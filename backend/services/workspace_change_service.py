"""Explicit, conflict-safe draft application with immutable before/after history."""

from datetime import datetime, timezone
from uuid import uuid4

from exceptions import ConflictException, NotFoundException
from models.workspace_change import ChangeSet, ResourcePatch, Revision
from models.workspace_job import MutationRequest
from services.workspace_context import WorkspaceContext
from services.workspace_requests import WorkspaceRequests


class WorkspaceChangeService:
    def __init__(self, storage):
        self.storage = storage
        self.ctx = WorkspaceContext(storage)

    async def prepare(
        self, user_id, workspace_id, patches: list[ResourcePatch], origin_job_id=None
    ):
        w = await self.ctx.workspace(user_id, workspace_id, writable=True)
        snapshots = []
        if not patches or len({p.target.resource_id for p in patches}) != len(patches):
            raise ConflictException("Select distinct patch targets")
        for patch in patches:
            if patch.target.course_id not in w.course_ids:
                raise NotFoundException("Module is not linked to this workspace")
            current = await self.ctx.snapshot(user_id, patch.target, editable=True)
            # The draft still exists if source changed during inference; apply rejects its
            # old fingerprint.
            snapshots.append(current)
            if patch.fields.flashcards is not None:
                for card in patch.fields.flashcards:
                    card.id = str(uuid4())
        change = ChangeSet(
            id=str(uuid4()),
            workspace_id=workspace_id,
            owner_id=user_id,
            patches=patches,
            base_snapshots=snapshots,
            origin_job_id=origin_job_id,
            created_at=datetime.now(timezone.utc),
        )
        await self.storage.create("workspace_changes", change.model_dump(mode="json"))
        return change

    async def get(self, user_id, workspace_id, change_id):
        await self.ctx.workspace(user_id, workspace_id)
        doc = await self.storage.get("workspace_changes", change_id)
        if not doc or doc["workspace_id"] != workspace_id or doc["owner_id"] != user_id:
            raise NotFoundException("Draft not found")
        change = ChangeSet.model_validate(doc)
        await self.ctx.check(user_id, change.base_snapshots)
        if change.origin_job_id:
            job = await self.storage.get("workspace_jobs", change.origin_job_id)
            if job:
                from models.workspace_change import ResourceSnapshot

                for step_id in job["step_ids"]:
                    step = await self.storage.get("workspace_steps", step_id)
                    await self.ctx.check(
                        user_id,
                        [ResourceSnapshot.model_validate(s) for s in step["source_snapshots"]],
                    )
        return change

    async def apply(self, user_id, workspace_id, change_id, request_id):
        ledger = WorkspaceRequests(
            self.storage,
            user_id,
            f"change-apply:{workspace_id}:{change_id}",
            MutationRequest(request_id=request_id),
        )
        async with self.storage.transaction():
            change = await self.get(user_id, workspace_id, change_id)
            w = await self.ctx.workspace(user_id, workspace_id, writable=True)
            replay = await ledger.replay()
            if replay:
                return ChangeSet.model_validate(replay)
            if change.status == "applied":
                return await ledger.record(workspace_id, change)
            before = []
            for patch in change.patches:
                if patch.target.course_id not in w.course_ids:
                    raise ConflictException("Module is no longer linked")
                snapshot = await self.ctx.snapshot(user_id, patch.target, editable=True)
                if snapshot.fingerprint != patch.expected_fingerprint:
                    raise ConflictException(
                        "Module changed. Generate a fresh draft before applying."
                    )
                before.append(snapshot)
            for patch in change.patches:
                fields = patch.fields.model_dump(mode="json", exclude_none=True)
                fields["updated_at"] = datetime.now(timezone.utc).isoformat()
                await self.storage.update("modules", patch.target.resource_id, fields)
            after = [
                await self.ctx.snapshot(user_id, p.target, editable=True) for p in change.patches
            ]
            revision = Revision(
                id=str(uuid4()),
                workspace_id=workspace_id,
                owner_id=user_id,
                change_id=change.id,
                before=before,
                after=after,
                created_at=datetime.now(timezone.utc),
            )
            await self.storage.create("workspace_revisions", revision.model_dump(mode="json"))
            change.status, change.revision_id = "applied", revision.id
            await self.storage.update(
                "workspace_changes", change.id, change.model_dump(mode="json")
            )
            return await ledger.record(workspace_id, change)
