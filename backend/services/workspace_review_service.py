"""Access-checked review receipts. Provider calls never mutate learning or accounting."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from weakref import WeakKeyDictionary

from exceptions import ConflictException, NotFoundException
from models.workspace_change import ResourceSnapshot, ResourceTarget
from models.workspace_review import (
    MaterialReview,
    MaterialReviewRequest,
    ReviewSource,
    ReviewSources,
    ReviewUsage,
)
from services.jev_client import PROMPT_VERSION, JevClient, JevUnavailable
from services.module_service import ModuleService
from services.workspace_change_service import WorkspaceChangeService, fields_of
from services.workspace_context import WorkspaceContext, fingerprint
from services.workspace_requests import WorkspaceRequests

_LOCKS = WeakKeyDictionary()
UNAVAILABLE = "Review unavailable. Your material is kept. You can retry this optional review."


class WorkspaceReviewService:
    def __init__(self, storage, settings):
        self.storage = storage
        self.settings = settings
        self.ctx = WorkspaceContext(storage)

    @property
    def configured(self):
        return bool(
            self.settings.workspace_review_enabled
            and self.settings.typesafe_api_key
            and self.settings.typesafe_api_key.get_secret_value().strip()
        )

    async def _source(
        self, user_id, workspace_id, target, change_id=None, *, require_current=False
    ):
        workspace = await self.ctx.workspace(user_id, workspace_id)
        if target.kind != "module" or target.course_id not in workspace.course_ids:
            raise NotFoundException("Review source not found")
        current = await self.ctx.snapshot(user_id, target, editable=False)
        snapshot = current
        proposal = None
        if change_id:
            change = await WorkspaceChangeService(self.storage).get(
                user_id, workspace_id, change_id
            )
            index = next((i for i, p in enumerate(change.patches) if p.target == target), None)
            if index is None:
                raise NotFoundException("Review source not found")
            base = change.base_snapshots[index]
            if require_current and (
                change.status != "ready" or base.fingerprint != current.fingerprint
            ):
                raise ConflictException(
                    "Draft source changed. Review current material or regenerate the draft."
                )
            fields = {**base.fields, **fields_of(change.patches[index])}
            snapshot = ResourceSnapshot(
                target=target, fields=fields, fingerprint=fingerprint(fields)
            )
            # Proposals are immutable today; hash version/status for future edits.
            proposal = fingerprint(
                {
                    "id": change.id,
                    "status": change.status,
                    "created_at": change.created_at.isoformat(),
                    "applied_at": str(change.applied_at),
                    "snapshot": snapshot.model_dump(),
                }
            )
        doc = await self.ctx.access.require_module(target.course_id, target.resource_id, user_id)
        revisions = await self.storage.list(
            "workspace_revisions", {"workspace_id": workspace_id, "owner_id": user_id}
        )
        latest = max(revisions, key=lambda r: (r["created_at"], r["id"]), default=None)
        marker = fingerprint(
            {
                "updated_at": doc.get("updated_at"),
                "latest_revision": latest["id"] if latest else None,
                "current_fingerprint": current.fingerprint,
                "proposal_version": proposal,
            }
        )
        return ReviewSource(snapshot=snapshot, revision_marker=marker, change_id=change_id)

    async def sources(self, user_id, workspace_id, change_id=None) -> ReviewSources:
        workspace = await self.ctx.workspace(user_id, workspace_id)
        if change_id:
            change = await WorkspaceChangeService(self.storage).get(
                user_id, workspace_id, change_id
            )
            targets = [p.target for p in change.patches if p.target.kind == "module"]
        else:
            targets = [
                ResourceTarget(kind="module", resource_id=m.id, course_id=cid)
                for cid in workspace.course_ids
                for m in await ModuleService(self.storage).list_modules(cid)
            ]
        sources = [await self._source(user_id, workspace_id, t, change_id) for t in targets]
        return ReviewSources(configured=self.configured, sources=sources)

    async def get(self, user_id: str, workspace_id: str, review_id: str) -> MaterialReview:
        await self.ctx.workspace(user_id, workspace_id)
        doc = await self.storage.get("workspace_reviews", review_id)
        if not doc or doc["owner_id"] != user_id or doc["workspace_id"] != workspace_id:
            raise NotFoundException("Review not found")
        request = MaterialReviewRequest.model_validate(doc["request"])
        source = await self._source(user_id, workspace_id, request.target, request.change_id)
        result = MaterialReview.model_validate(doc)
        if (
            source.revision_marker != result.revision_marker
            or source.snapshot.fingerprint != request.expected_fingerprint
        ):
            result.state = "stale"
        return result

    async def review(
        self, user_id: str, workspace_id: str, request: MaterialReviewRequest
    ) -> MaterialReview:
        locks = _LOCKS.setdefault(self.storage, {})
        async with locks.setdefault(workspace_id, asyncio.Lock()):
            return await self._review(user_id, workspace_id, request)

    async def _review(self, user_id, workspace_id, request):
        ledger = WorkspaceRequests(self.storage, user_id, f"review:{workspace_id}", request)
        async with self.storage.transaction():
            # Current source access precedes receipt/cache resolution, including lost responses.
            source = await self._source(user_id, workspace_id, request.target, request.change_id)
            replay = await ledger.replay()
            if replay:
                return await self.get(user_id, workspace_id, replay["id"])
            source = await self._source(
                user_id, workspace_id, request.target, request.change_id, require_current=True
            )
            if (
                source.snapshot.fingerprint != request.expected_fingerprint
                or source.revision_marker != request.expected_revision_marker
            ):
                raise ConflictException(
                    "Material changed. Select current material before reviewing."
                )
            fields = source.snapshot.fields
            questions = (fields.get("quiz") or {}).get("questions", [])
            if (
                request.lesson_excerpt not in (fields.get("content_markdown") or "")
                or not request.lesson_excerpt.strip()
                or request.objective not in (fields.get("objectives") or [])
                or request.question_index >= len(questions)
            ):
                raise ConflictException(
                    "Select an exact lesson excerpt, existing objective and question "
                    "from this material."
                )
            question = questions[request.question_index]
            if len(question["question"]) + sum(map(len, question["options"])) > 4000:
                raise ConflictException(
                    "Question and options exceed the 4,000 character review limit."
                )
            state = {
                "objective": request.objective,
                "lesson_excerpt": request.lesson_excerpt,
                **{k: question[k] for k in ("question", "options", "correct_index")},
            }
            content_hash = fingerprint(
                {
                    "snapshot": source.snapshot.model_dump(),
                    "selected_state": state,
                    "prompt_version": PROMPT_VERSION,
                    "model": self.settings.jev_model,
                }
            )
            if not request.refresh:
                cached = await self.storage.list(
                    "workspace_reviews",
                    {
                        "owner_id": user_id,
                        "workspace_id": workspace_id,
                        "content_hash": content_hash,
                        "revision_marker": source.revision_marker,
                        "state": "ready",
                    },
                )
                if cached:
                    result = await self.get(user_id, workspace_id, cached[0]["id"])
                    return await ledger.record(workspace_id, result)
            result = MaterialReview(
                id=str(uuid4()),
                state="unavailable",
                model=self.settings.jev_model,
                prompt_version=PROMPT_VERSION,
                content_hash=content_hash,
                revision_marker=source.revision_marker,
                created_at=datetime.now(timezone.utc),
                safe_error=UNAVAILABLE,
            )
            # Pending receipts fail closed after interruption; never repeat a call silently.
            await self.storage.create(
                "workspace_reviews",
                {
                    **result.model_dump(mode="json"),
                    "owner_id": user_id,
                    "workspace_id": workspace_id,
                    "request": request.model_dump(mode="json"),
                },
            )
            await ledger.record(workspace_id, result)
        if self.configured:
            try:
                answer = await JevClient(self.settings).review(state)
                result.state = "ready"
                result.model = answer.model
                result.dimensions = answer.dimensions
                result.usage = ReviewUsage(
                    input_tokens=answer.input_tokens, output_tokens=answer.output_tokens
                )
                result.safe_error = None
            except JevUnavailable:
                pass
        await self.storage.update("workspace_reviews", result.id, result.model_dump(mode="json"))
        return await self.get(user_id, workspace_id, result.id)
