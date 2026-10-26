"""Durable job admission, authorized reads and explicit retry/cancellation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel

from exceptions import ConflictException, NotFoundException
from models.workspace_change import ResourceTarget, RevisionRequest
from models.workspace_job import BuildRequest, JobStep, MutationRequest, RetryRequest, WorkspaceJob
from models.workspace_plan import PlanRequest
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderSnapshot
from services.workspace_context import WorkspaceContext
from services.workspace_plan_service import WorkspacePlanService
from services.workspace_requests import WorkspaceRequests
from services.workspace_revision_generator import COSTS


def now():
    return datetime.now(timezone.utc).isoformat()


class WorkspaceJobService:
    def __init__(self, storage, settings):
        self.storage, self.settings = storage, settings
        self.ctx = WorkspaceContext(storage)

    @property
    def runner(self):
        from services.workspace_runner import WorkspaceRunner

        runner = getattr(self.storage, "workspace_runner", None)
        if runner is None:
            runner = WorkspaceRunner(self.storage, self.settings)
        return runner

    async def _raw(self, user_id, workspace_id, job_id):
        await self.ctx.workspace(user_id, workspace_id)
        doc = await self.storage.get("workspace_jobs", job_id)
        if not doc or doc["workspace_id"] != workspace_id or doc["owner_id"] != user_id:
            raise NotFoundException("Job not found")
        return doc

    async def get(self, user_id: str, workspace_id: str, job_id: str) -> WorkspaceJob:
        doc = await self._raw(user_id, workspace_id, job_id)
        steps = []
        for step_id in doc["step_ids"]:
            raw = await self.storage.get("workspace_steps", step_id)
            step = JobStep.model_validate(raw)
            step.finalize_only = raw.get("staged_output") is not None
            step.operation_credits = (
                10
                if doc["kind"] == "plan"
                else COSTS[raw["input"]["scope"]]
                if doc["kind"] == "revision"
                else 25
            )
            await self.ctx.check(user_id, step.source_snapshots)
            steps.append(step)
        return WorkspaceJob.model_validate({**doc, "steps": steps})

    async def list(self, user_id: str, workspace_id: str) -> list[WorkspaceJob]:
        await self.ctx.workspace(user_id, workspace_id)
        docs = await self.storage.list(
            "workspace_jobs", {"workspace_id": workspace_id, "owner_id": user_id}
        )
        return [
            await self.get(user_id, workspace_id, d["id"])
            for d in sorted(docs, key=lambda d: d["created_at"], reverse=True)
        ]

    async def _inputs(self, user_id, workspace_id, kind, data):
        w = await self.ctx.workspace(user_id, workspace_id, writable=True)
        if kind == "plan":
            data = PlanRequest.model_validate(data.model_dump())
            context = await WorkspacePlanService(self.storage, self.settings).context(
                user_id, workspace_id, data
            )
            return [
                dict(
                    target=None,
                    source_snapshots=context["snapshots"],
                    input=data.model_dump(mode="json"),
                    context=context,
                )
            ]
        if kind == "revision":
            from services.workspace_revision_generator import WorkspaceRevisionGenerator

            data = RevisionRequest.model_validate(data.model_dump())
            context = await WorkspaceRevisionGenerator(self.storage, self.settings).context(
                user_id, workspace_id, data
            )
            return [
                dict(
                    target=data.target.model_dump(),
                    source_snapshots=context["snapshots"],
                    input=data.model_dump(mode="json"),
                    context=context,
                )
            ]
        if kind != "build":
            raise ConflictException("Unsupported job kind")
        data = BuildRequest.model_validate(data.model_dump())
        result = []
        for module_id in data.module_ids:
            doc = await self.storage.get("modules", module_id)
            if not doc or doc["course_id"] not in w.course_ids:
                raise NotFoundException("Module is not linked to this workspace")
            target = ResourceTarget(
                kind="module", resource_id=module_id, course_id=doc["course_id"]
            )
            module = await self.ctx.snapshot(user_id, target, editable=True)
            course = await self.ctx.snapshot(
                user_id, ResourceTarget(kind="course", resource_id=doc["course_id"]), editable=True
            )
            result.append(
                dict(
                    target=target.model_dump(),
                    source_snapshots=[module.model_dump(), course.model_dump()],
                    input=data.model_dump(mode="json"),
                    context={"brief": w.brief.model_dump(mode="json")},
                )
            )
        return result

    async def start(
        self,
        user_id: str,
        workspace_id: str,
        kind: Literal["plan", "build", "revision"],
        data: BaseModel,
    ) -> WorkspaceJob:
        ledger = WorkspaceRequests(self.storage, user_id, f"job-start:{workspace_id}:{kind}", data)
        async with self.storage.transaction():
            await self.ctx.workspace(user_id, workspace_id, writable=True)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, replay["id"])
        snapshot = await AIPreferencesService(self.storage, self.settings).snapshot(user_id)
        async with self.storage.transaction():
            inputs = await self._inputs(user_id, workspace_id, kind, data)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, replay["id"])
            job_id, step_ids = str(uuid4()), []
            for item in inputs:
                step = dict(
                    id=str(uuid4()),
                    job_id=job_id,
                    attempt=1,
                    state="queued",
                    credits=0,
                    output_ref=None,
                    safe_error=None,
                    operation_id=str(uuid4()),
                    provider=snapshot.provider,
                    model=snapshot.model,
                    staged_output=None,
                    staged_hash=None,
                    **item,
                )
                await self.storage.create("workspace_steps", step)
                step_ids.append(step["id"])
            await self.storage.create(
                "workspace_jobs",
                dict(
                    id=job_id,
                    workspace_id=workspace_id,
                    owner_id=user_id,
                    kind=kind,
                    provider=snapshot.provider,
                    model=snapshot.model,
                    state="queued",
                    step_ids=step_ids,
                    cancel_requested=False,
                    created_at=now(),
                    updated_at=now(),
                ),
            )
            job = await self.get(user_id, workspace_id, job_id)
            await ledger.record(workspace_id, job)
        # create_task inherits context: never submit until the transaction has exited.
        self.runner.submit(job.id, snapshot)
        return job

    async def cancel(
        self, user_id: str, workspace_id: str, job_id: str, request_id: str
    ) -> WorkspaceJob:
        ledger = WorkspaceRequests(
            self.storage,
            user_id,
            f"job-cancel:{workspace_id}:{job_id}",
            MutationRequest(request_id=request_id),
        )
        async with self.storage.transaction():
            job = await self.get(user_id, workspace_id, job_id)
            replay = await ledger.replay()
            if replay:
                return WorkspaceJob.model_validate(replay)
            await self.storage.update(
                "workspace_jobs", job_id, {"cancel_requested": True, "updated_at": now()}
            )
            for step in job.steps:
                if step.state == "queued":
                    await self.storage.update("workspace_steps", step.id, {"state": "cancelled"})
            if job.state == "queued":
                await self.storage.update("workspace_jobs", job_id, {"state": "cancelled"})
            return await ledger.record(workspace_id, await self.get(user_id, workspace_id, job_id))

    async def retry(
        self, user_id: str, workspace_id: str, job_id: str, request_id: str, step_ids: list[str]
    ) -> WorkspaceJob:
        data = RetryRequest(request_id=request_id, step_ids=step_ids)
        ledger = WorkspaceRequests(
            self.storage, user_id, f"job-retry:{workspace_id}:{job_id}", data
        )
        async with self.storage.transaction():
            job = await self.get(user_id, workspace_id, job_id)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, job_id)
            selected = [s for s in job.steps if s.id in step_ids]
            if len(selected) != len(step_ids) or len(set(step_ids)) != len(step_ids):
                raise ConflictException("Select distinct unfinished steps")
            saved_steps = [await self.storage.get("workspace_steps", s.id) for s in selected]
            finalize_only = all(s.get("staged_output") is not None for s in saved_steps)
        # Saved output has no provider work left and must not require a still-present key.
        snapshot = (
            ProviderSnapshot(saved_steps[0]["provider"], saved_steps[0]["model"], "")
            if finalize_only
            else await AIPreferencesService(self.storage, self.settings).snapshot(user_id)
        )
        async with self.storage.transaction():
            job = await self.get(user_id, workspace_id, job_id)
            await self.ctx.workspace(user_id, workspace_id, writable=True)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, job_id)
            if job.state in ("queued", "running") or len(set(step_ids)) != len(step_ids):
                raise ConflictException("Wait for the current attempt before retrying")
            selected = {step.id: step for step in job.steps if step.id in step_ids}
            if len(selected) != len(step_ids) or any(s.state == "ready" for s in selected.values()):
                raise ConflictException("Only unfinished steps can be retried")
            for step in selected.values():
                raw = await self.storage.get("workspace_steps", step.id)
                updates = dict(state="queued", safe_error=None)
                if raw.get("staged_output") is None:
                    # Unknown outcome: an explicit new attempt, with a visibly new provider
                    # selection.
                    snapshots = [
                        await self.ctx.snapshot(user_id, s.target, editable=job.kind == "build")
                        for s in step.source_snapshots
                    ]
                    updates.update(
                        attempt=step.attempt + 1,
                        operation_id=str(uuid4()),
                        provider=snapshot.provider,
                        model=snapshot.model,
                        source_snapshots=[s.model_dump(mode="json") for s in snapshots],
                    )
                    if job.kind == "revision":
                        from services.workspace_revision_generator import WorkspaceRevisionGenerator

                        context = await WorkspaceRevisionGenerator(
                            self.storage, self.settings
                        ).context(
                            user_id, workspace_id, RevisionRequest.model_validate(raw["input"])
                        )
                        updates.update(context=context, source_snapshots=context["snapshots"])
                    if job.kind == "plan":
                        context = await WorkspacePlanService(self.storage, self.settings).context(
                            user_id, workspace_id, PlanRequest.model_validate(raw["input"])
                        )
                        updates.update(context=context, source_snapshots=context["snapshots"])
                await self.storage.update("workspace_steps", step.id, updates)
            await self.storage.update(
                "workspace_jobs",
                job_id,
                dict(
                    state="queued",
                    cancel_requested=False,
                    provider=snapshot.provider,
                    model=snapshot.model,
                    updated_at=now(),
                ),
            )
            result = await self.get(user_id, workspace_id, job_id)
            await ledger.record(workspace_id, result)
        self.runner.submit(job_id, snapshot)
        return result
