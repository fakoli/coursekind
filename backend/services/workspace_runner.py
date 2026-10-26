"""Single-process sequential workspace executor; restarts never repeat inference."""

import asyncio

from models.ai_generation import GeneratedModuleContent, GenerateModuleContentRequest
from models.workspace_change import ModuleFields, ResourcePatch, ResourceSnapshot, ResourceTarget
from models.workspace_job import JobStep, MutationRequest
from models.workspace_plan import PlanRequest, WorkspacePlan
from services.ai_generation_service import AIGenerationService
from services.ai_provider import ProviderSnapshot
from services.generation_operation import GenerationOperation
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_context import WorkspaceContext, fingerprint
from services.workspace_job_service import now
from services.workspace_plan_service import WorkspacePlanService


class WorkspaceRunner:
    def __init__(self, storage, settings):
        self.storage, self.settings = storage, settings
        self.tasks = {}
        self.serial = asyncio.Lock()
        storage.workspace_runner = self

    def submit(self, job_id: str, snapshot: ProviderSnapshot) -> None:
        if job_id in self.tasks:
            return
        task = asyncio.create_task(self._run(job_id, snapshot))
        self.tasks[job_id] = task
        task.add_done_callback(lambda _: self.tasks.pop(job_id, None))

    async def wait_idle(self):
        while self.tasks:
            await asyncio.gather(*list(self.tasks.values()))

    async def recover_interrupted(self) -> int:
        count = 0
        async with self.storage.transaction():
            for job in await self.storage.list("workspace_jobs"):
                if job["state"] not in ("queued", "running"):
                    continue
                count += 1
                for step_id in job["step_ids"]:
                    step = await self.storage.get("workspace_steps", step_id)
                    if step["state"] in ("queued", "running"):
                        await self.storage.update(
                            "workspace_steps",
                            step_id,
                            dict(
                                state="interrupted",
                                safe_error=(
                                    "Interrupted. Explicit retry required; "
                                    "external provider charges may already apply."
                                ),
                            ),
                        )
                states = [
                    (await self.storage.get("workspace_steps", i))["state"] for i in job["step_ids"]
                ]
                await self.storage.update(
                    "workspace_jobs",
                    job["id"],
                    dict(
                        state="ready" if all(s == "ready" for s in states) else "interrupted",
                        updated_at=now(),
                    ),
                )
        return count

    async def shutdown(self) -> None:
        for task in list(self.tasks.values()):
            task.cancel()
        await asyncio.gather(*list(self.tasks.values()), return_exceptions=True)
        await self.recover_interrupted()

    async def _run(self, job_id, snapshot):
        async with self.serial:
            try:
                async with self.storage.transaction():
                    job = await self.storage.get("workspace_jobs", job_id)
                    if job["state"] != "queued" or job["cancel_requested"]:
                        return
                    await self.storage.update(
                        "workspace_jobs", job_id, dict(state="running", updated_at=now())
                    )
                for step_id in job["step_ids"]:
                    # Cancellation and admission arbitrate under the same storage lock.
                    # Once claimed, a valid in-flight result may finish and be charged.
                    async with self.storage.transaction():
                        job = await self.storage.get("workspace_jobs", job_id)
                        step = await self.storage.get("workspace_steps", step_id)
                        if job["cancel_requested"]:
                            break
                        if step["state"] != "queued":
                            continue
                        await self.storage.update("workspace_steps", step_id, {"state": "running"})
                    # No provider await runs inside the claim transaction.
                    try:
                        await self._execute(job, step, snapshot)
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        # Never leak raw provider/storage messages, credentials, or user content.
                        raw = await self.storage.get("workspace_steps", step_id)
                        message = (
                            (
                                "Validated draft saved; retry will finalize it without another "
                                "model call."
                            )
                            if raw.get("staged_output") is not None
                            else (
                                "Generation failed. No application credits charged. "
                                "Retry may incur external provider charges."
                            )
                        )
                        await self.storage.update(
                            "workspace_steps", step_id, dict(state="failed", safe_error=message)
                        )
                        # A failed batch stops; remaining steps require explicit selection to retry.
                        for remaining in job["step_ids"]:
                            pending = await self.storage.get("workspace_steps", remaining)
                            if pending["state"] == "queued":
                                await self.storage.update(
                                    "workspace_steps",
                                    remaining,
                                    dict(
                                        state="interrupted",
                                        safe_error=(
                                            "An earlier step failed. Select retry to continue."
                                        ),
                                    ),
                                )
                        break
                await self._finish(job_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                # A storage outage can leave a durable running attempt. Startup recovery handles it.
                return

    async def _finish(self, job_id):
        async with self.storage.transaction():
            job = await self.storage.get("workspace_jobs", job_id)
            states = [
                (await self.storage.get("workspace_steps", i))["state"] for i in job["step_ids"]
            ]
            state = (
                "ready"
                if all(s == "ready" for s in states)
                else "partial"
                if "ready" in states
                else "cancelled"
                if job["cancel_requested"]
                else "failed"
            )
            await self.storage.update("workspace_jobs", job_id, dict(state=state, updated_at=now()))

    async def _execute(self, job, step, selected_snapshot):
        user_id, workspace_id = job["owner_id"], job["workspace_id"]
        ctx = WorkspaceContext(self.storage)
        snapshots = [ResourceSnapshot.model_validate(s) for s in step["source_snapshots"]]
        plan_service = WorkspacePlanService(self.storage, self.settings)
        staged_type = WorkspacePlan if job["kind"] == "plan" else GeneratedModuleContent
        # Finalize-only retries retain the original billing selection; they need no credentials.
        snapshot = (
            ProviderSnapshot(step["provider"], step["model"], "")
            if step.get("staged_output") is not None
            else selected_snapshot
        )

        async def access():
            await ctx.workspace(user_id, workspace_id, writable=True)
            await ctx.check(user_id, snapshots, editable=job["kind"] == "build")

        async def action():
            if step.get("staged_output") is not None:
                if fingerprint(step["staged_output"]) != step["staged_hash"]:
                    raise ValueError("Staged output checksum mismatch")
                return staged_type.model_validate(step["staged_output"])
            if job["kind"] == "plan":
                result = await plan_service.stage(
                    user_id,
                    workspace_id,
                    PlanRequest.model_validate(step["input"]),
                    step["context"],
                )
            else:
                module = snapshots[0].fields
                request = GenerateModuleContentRequest(
                    course_id=step["target"]["course_id"],
                    module_title=module["title"],
                    module_prompt="Learning objectives and requirements: "
                    + str(module["objectives"])
                    + "\n"
                    + (module["description"] or "")
                    + "\n"
                    + str(step["context"]["brief"]),
                    **{
                        k: step["input"][k]
                        for k in (
                            "generate_flashcards",
                            "flashcard_count",
                            "generate_quiz",
                            "quiz_question_count",
                        )
                    },
                )
                result = await AIGenerationService(
                    self.storage, self.settings, repair_provider_output=True
                ).stage_content(user_id, request, require_enabled=False)
            output = result.model_dump(mode="json")
            # Stage before the receipt/debit transaction. A failed finalization is safely resumable.
            async with self.storage.transaction():
                await access()
                await self.storage.update(
                    "workspace_steps",
                    step["id"],
                    dict(staged_output=output, staged_hash=fingerprint(output)),
                )
            return result

        async def save(result):
            if job["kind"] == "plan":
                output = await plan_service.save_proposal(
                    user_id, workspace_id, result, step["context"], job["id"]
                )
            else:
                fields = {"content_markdown": result.content_markdown}
                if step["input"]["generate_flashcards"]:
                    fields["flashcards"] = result.flashcards
                if step["input"]["generate_quiz"]:
                    fields["quiz"] = result.quiz
                patch = ResourcePatch(
                    target=ResourceTarget.model_validate(step["target"]),
                    expected_fingerprint=snapshots[0].fingerprint,
                    fields=ModuleFields(**fields),
                )
                output = await WorkspaceChangeService(self.storage).prepare(
                    user_id, workspace_id, [patch], job["id"]
                )
            charge = (10 if job["kind"] == "plan" else 25) if snapshot.provider == "anvil" else 0
            doc = await self.storage.update(
                "workspace_steps",
                step["id"],
                dict(state="ready", credits=charge, output_ref=output.id, safe_error=None),
            )
            return JobStep.model_validate(doc)

        await GenerationOperation(self.storage, self.settings).run(
            user_id,
            f"workspace-{job['kind']}",
            MutationRequest(request_id=step["operation_id"]),
            10 if job["kind"] == "plan" else 25,
            JobStep,
            action,
            access=access,
            save=save,
            provider_snapshot=snapshot,
        )
