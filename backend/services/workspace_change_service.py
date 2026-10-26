"""Atomic, allowlisted changes and immutable compensating editorial revisions."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from exceptions import ConflictException, NotFoundException
from models.course import CourseUpdate
from models.learning_path import LearningPathUpdate
from models.module import ModuleUpdate
from models.workspace_change import (
    ChangeSet,
    ResourcePatch,
    ResourceSnapshot,
    RestoreRequest,
    Revision,
)
from models.workspace_discovery import WorkspaceDiscovery
from models.workspace_job import MutationRequest
from services.course_service import CourseService
from services.learning_path_service import LearningPathService
from services.module_service import ModuleService
from services.workspace_context import WorkspaceContext, fingerprint
from services.workspace_discovery import discover_records
from services.workspace_requests import WorkspaceRequests

CONFLICT = (
    "This content changed since your draft was created. Your draft is kept. "
    "Review the current version or regenerate before applying."
)


def fields_of(patch):
    return patch.fields.model_dump(mode="json", exclude_unset=True)


def revision_fingerprint(snapshots, touched):
    return fingerprint(
        [
            {"target": s.target.model_dump(), "fields": {k: s.fields.get(k) for k in keys}}
            for s, keys in zip(snapshots, touched, strict=True)
        ]
    )


class WorkspaceChangeService:
    def __init__(self, storage):
        self.storage = storage
        self.ctx = WorkspaceContext(storage)

    async def linked(self, user_id, workspace_id, target):
        w = await self.ctx.workspace(user_id, workspace_id, writable=True)
        linked = (
            target.resource_id == w.path_id
            if target.kind == "path"
            else (target.course_id if target.kind == "module" else target.resource_id)
            in w.course_ids
        )
        if not linked:
            raise NotFoundException("Target is not linked to this workspace")
        return await self.ctx.snapshot(user_id, target, editable=True)

    async def validate_fields(self, user_id, patch, current):
        fields = fields_of(patch)
        if patch.target.kind == "path":
            for cid in fields.get("course_ids", []):
                await self.ctx.access.require_course(cid, user_id)
        if "outline" in fields:
            items = fields["outline"]
            ids = [m["id"] for m in items]
            if len(ids) != len(set(ids)) or set(ids) != set(current.fields["module_ids"]):
                raise ConflictException(
                    "Outline must retain exactly the existing module IDs. "
                    "Use a plan to add material."
                )
            if [m["order_index"] for m in items] != list(range(len(items))):
                raise ConflictException("Outline order must be consecutive and match item order")

    async def prepare(
        self,
        user_id,
        workspace_id,
        patches: list[ResourcePatch],
        origin_job_id=None,
        *,
        base_snapshots=None,
        request_id=None,
        revision_request=None,
        parent_revision_id=None,
    ):
        async with self.storage.transaction():
            if not patches or len({(p.target.kind, p.target.resource_id) for p in patches}) != len(
                patches
            ):
                raise ConflictException("Select distinct patch targets")
            # Course outline and a module in that course overlap.
            outlines = {p.target.resource_id for p in patches if "outline" in fields_of(p)}
            if any(p.target.course_id in outlines for p in patches if p.target.kind == "module"):
                raise ConflictException("Overlapping patch targets")
            snapshots = []
            normalized = []
            for index, original in enumerate(patches):
                patch = ResourcePatch.model_validate(original.model_dump(mode="json"))
                current = await self.linked(user_id, workspace_id, patch.target)
                await self.validate_fields(user_id, patch, current)
                base = base_snapshots[index] if base_snapshots else current
                snapshots.append(base)
                if patch.target.kind == "module" and patch.fields.flashcards is not None:
                    allowed = {c.get("id"): c for c in base.fields.get("flashcards", [])}
                    seen = set()
                    for card in patch.fields.flashcards:
                        if not parent_revision_id and (
                            not card.id
                            or card.id not in allowed
                            or card.id in seen
                            or any(
                                getattr(card, key) != allowed[card.id].get(key)
                                for key in ("front", "back", "visual")
                            )
                        ):
                            card.id = str(uuid4())
                        seen.add(card.id)
                normalized.append(patch)
            after = [
                ResourceSnapshot(
                    target=s.target,
                    fields={**s.fields, **fields_of(p)},
                    fingerprint=fingerprint({**s.fields, **fields_of(p)}),
                )
                for s, p in zip(snapshots, normalized, strict=True)
            ]
            change = ChangeSet(
                id=str(uuid4()),
                workspace_id=workspace_id,
                owner_id=user_id,
                patches=normalized,
                base_snapshots=snapshots,
                before=snapshots,
                after=after,
                origin_job_id=origin_job_id,
                request_id=request_id,
                revision_request=revision_request,
                parent_revision_id=parent_revision_id,
                created_at=datetime.now(timezone.utc),
            )
            await self.storage.create("workspace_changes", change.model_dump(mode="json"))
            return change

    async def manual(self, user_id, workspace_id, request):
        ledger = WorkspaceRequests(self.storage, user_id, f"change-create:{workspace_id}", request)
        async with self.storage.transaction():
            await self.ctx.workspace(user_id, workspace_id, writable=True)
            for patch in request.patches:
                await self.linked(user_id, workspace_id, patch.target)
                for cid in fields_of(patch).get("course_ids", []):
                    await self.ctx.access.require_course(cid, user_id)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, replay["id"])
            return await ledger.record(
                workspace_id,
                await self.prepare(
                    user_id, workspace_id, request.patches, request_id=request.request_id
                ),
            )

    async def discover_changes(self, user_id, workspace_id) -> WorkspaceDiscovery[ChangeSet]:
        return await discover_records(
            self.ctx,
            user_id,
            workspace_id,
            "workspace_changes",
            lambda record_id: self.get(user_id, workspace_id, record_id),
        )

    async def list_changes(self, user_id, workspace_id) -> list[ChangeSet]:
        await self.ctx.workspace(user_id, workspace_id)
        docs = await self.storage.list(
            "workspace_changes", {"owner_id": user_id, "workspace_id": workspace_id}
        )
        return [
            await self.get(user_id, workspace_id, doc["id"])
            for doc in sorted(docs, key=lambda d: d["created_at"], reverse=True)
        ]

    async def get(self, user_id, workspace_id, change_id):
        await self.ctx.workspace(user_id, workspace_id)
        doc = await self.storage.get("workspace_changes", change_id)
        if not doc or doc["workspace_id"] != workspace_id or doc["owner_id"] != user_id:
            raise NotFoundException("Draft not found")
        change = ChangeSet.model_validate(doc)
        await self.ctx.check(user_id, change.base_snapshots)
        for saved in [*change.before, *change.after]:
            for cid in saved.fields.get("course_ids", []):
                await self.ctx.access.require_course(cid, user_id)
        if change.origin_job_id:
            job = await self.storage.get("workspace_jobs", change.origin_job_id)
            if job:
                for step_id in job["step_ids"]:
                    step = await self.storage.get("workspace_steps", step_id)
                    await self.ctx.check(
                        user_id,
                        [ResourceSnapshot.model_validate(s) for s in step["source_snapshots"]],
                    )
        return change

    async def _write(self, user_id, patch):
        fields = fields_of(patch)
        target = patch.target
        if target.kind == "module":
            # Baseline service validates ownership/activity content; the validated proposal's
            # explicit identities also include cards recovered from immutable history.
            await ModuleService(self.storage).update_module(
                target.course_id, target.resource_id, user_id, ModuleUpdate(**fields)
            )
            if "flashcards" in fields:
                await self.storage.update(
                    "modules", target.resource_id, {"flashcards": fields["flashcards"]}
                )
        elif target.kind == "course":
            if "outline" in fields:
                for item in fields["outline"]:
                    await ModuleService(self.storage).update_module(
                        target.resource_id,
                        item["id"],
                        user_id,
                        ModuleUpdate(**{k: v for k, v in item.items() if k != "id"}),
                    )
            else:
                await CourseService(self.storage).update_course(
                    target.resource_id, user_id, CourseUpdate(**fields)
                )
        else:
            paths = LearningPathService(self.storage, CourseService(self.storage))
            if "course_ids" in fields:
                await paths.replace_course_references(
                    target.resource_id, user_id, fields.pop("course_ids")
                )
            if fields:
                await paths.update_path(target.resource_id, user_id, LearningPathUpdate(**fields))

    async def apply(self, user_id, workspace_id, change_id, request_id):
        ledger = WorkspaceRequests(
            self.storage,
            user_id,
            f"change-apply:{workspace_id}:{change_id}",
            MutationRequest(request_id=request_id),
        )
        async with self.storage.transaction():
            change = await self.get(user_id, workspace_id, change_id)
            await self.ctx.workspace(user_id, workspace_id, writable=True)
            # Access is checked even for response-loss replay.
            for patch in change.patches:
                await self.ctx.snapshot(user_id, patch.target, editable=True)
            replay = await ledger.replay()
            if replay:
                return ChangeSet.model_validate(replay)
            if change.status == "applied":
                return await ledger.record(workspace_id, change)
            before = []
            for patch in change.patches:
                snapshot = await self.linked(user_id, workspace_id, patch.target)
                if snapshot.fingerprint != patch.expected_fingerprint:
                    raise ConflictException(CONFLICT)
                await self.validate_fields(user_id, patch, snapshot)
                before.append(snapshot)
            for patch in change.patches:
                await self._write(user_id, patch)
            after = [
                await self.ctx.snapshot(user_id, p.target, editable=True) for p in change.patches
            ]
            touched = [list(fields_of(p)) for p in change.patches]
            revision = Revision(
                id=str(uuid4()),
                workspace_id=workspace_id,
                owner_id=user_id,
                change_id=change.id,
                before=before,
                after=after,
                touched_fields=touched,
                fingerprint=revision_fingerprint(after, touched),
                parent_revision_id=change.parent_revision_id,
                created_at=datetime.now(timezone.utc),
            )
            await self.storage.create(
                "workspace_revisions",
                revision.model_dump(
                    mode="json", exclude={"current_fingerprint", "current_snapshots", "restorable"}
                ),
            )
            change.status = change.state = "applied"
            change.revision_id = revision.id
            change.applied_at = datetime.now(timezone.utc)
            await self.storage.update(
                "workspace_changes",
                change.id,
                {
                    "status": "applied",
                    "state": "applied",
                    "revision_id": revision.id,
                    "applied_at": change.applied_at.isoformat(),
                },
            )
            return await ledger.record(workspace_id, change)

    async def _revision(self, user_id, workspace_id, revision_id):
        await self.ctx.workspace(user_id, workspace_id)
        doc = await self.storage.get("workspace_revisions", revision_id)
        if not doc or doc["owner_id"] != user_id or doc["workspace_id"] != workspace_id:
            raise NotFoundException("Revision not found")
        revision = Revision.model_validate(doc)
        await self.ctx.check(user_id, [*revision.before, *revision.after])
        for saved in [*revision.before, *revision.after]:
            for cid in saved.fields.get("course_ids", []):
                await self.ctx.access.require_course(cid, user_id)
        if not revision.touched_fields and revision.kind == "editorial":
            # Existing Task2 history has a real originating typed change; no invented history.
            change = await self.get(user_id, workspace_id, revision.change_id)
            revision.touched_fields = [list(fields_of(p)) for p in change.patches]
            revision.fingerprint = revision_fingerprint(revision.after, revision.touched_fields)
        return revision

    async def _history_entry(self, user_id, workspace_id, revision_id):
        revision = await self._revision(user_id, workspace_id, revision_id)
        if revision.kind == "editorial" and revision.touched_fields:
            current = [
                await self.ctx.snapshot(user_id, s.target, editable=False) for s in revision.after
            ]
            revision.current_snapshots = current
            revision.current_fingerprint = revision_fingerprint(current, revision.touched_fields)
            revision.restorable = True
        return revision

    async def discover_history(self, user_id, workspace_id) -> WorkspaceDiscovery[Revision]:
        return await discover_records(
            self.ctx,
            user_id,
            workspace_id,
            "workspace_revisions",
            lambda record_id: self._history_entry(user_id, workspace_id, record_id),
        )

    async def history(self, user_id, workspace_id) -> list[Revision]:
        await self.ctx.workspace(user_id, workspace_id)
        docs = await self.storage.list(
            "workspace_revisions", {"owner_id": user_id, "workspace_id": workspace_id}
        )
        result = []
        for doc in sorted(docs, key=lambda d: d["created_at"], reverse=True):
            revision = await self._history_entry(user_id, workspace_id, doc["id"])
            result.append(revision)
        return result

    async def restore(
        self, user_id, workspace_id, revision_id, expected_current_fingerprint, request_id
    ) -> ChangeSet:
        request = RestoreRequest(
            request_id=request_id, expected_current_fingerprint=expected_current_fingerprint
        )
        ledger = WorkspaceRequests(
            self.storage, user_id, f"restore:{workspace_id}:{revision_id}", request
        )
        async with self.storage.transaction():
            revision = await self._revision(user_id, workspace_id, revision_id)
            await self.ctx.workspace(user_id, workspace_id, writable=True)
            current = [await self.linked(user_id, workspace_id, s.target) for s in revision.after]
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, replay["id"])
            if revision.kind != "editorial" or not revision.touched_fields:
                raise ConflictException(
                    "Created objects are recorded but cannot be destructively restored"
                )
            actual = revision_fingerprint(current, revision.touched_fields)
            if actual != expected_current_fingerprint or actual != revision.fingerprint:
                raise ConflictException(CONFLICT)
            patches = [
                ResourcePatch(
                    target=s.target,
                    expected_fingerprint=c.fingerprint,
                    fields={k: s.fields.get(k) for k in keys},
                )
                for s, c, keys in zip(
                    revision.before, current, revision.touched_fields, strict=True
                )
            ]
            change = await self.prepare(
                user_id,
                workspace_id,
                patches,
                base_snapshots=current,
                request_id=request_id,
                parent_revision_id=revision.id,
            )
            return await ledger.record(
                workspace_id, await self.apply(user_id, workspace_id, change.id, str(uuid4()))
            )
