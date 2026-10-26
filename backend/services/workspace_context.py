"""Live authorization and canonical editorial snapshots shared by workspace operations."""

import hashlib
import json

from exceptions import ConflictException
from models.workspace_change import ResourceSnapshot, ResourceTarget
from services.access_service import AccessService
from services.module_service import ModuleService
from services.workspace_service import WorkspaceService

FIELDS = {
    "course": ("title", "description", "difficulty", "tags", "instructions", "ai_enabled"),
    "module": (
        "title",
        "description",
        "objectives",
        "order_index",
        "content_markdown",
        "flashcards",
        "quiz",
        "sandbox",
    ),
    "path": ("title", "description", "difficulty", "estimated_hours", "course_ids"),
}


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


class WorkspaceContext:
    def __init__(self, storage):
        self.storage = storage
        self.access = AccessService(storage)

    async def workspace(self, user_id, workspace_id, *, writable=False):
        w = await WorkspaceService(self.storage).get(user_id, workspace_id)
        if writable and w.archived:
            raise ConflictException("Restore this workspace before making changes")
        if w.path_id:
            await self.access.require_path(w.path_id, user_id)
        for course_id in w.course_ids:
            await self.access.require_course(course_id, user_id)
        return w

    async def snapshot(
        self, user_id: str, target: ResourceTarget, *, editable: bool
    ) -> ResourceSnapshot:
        if target.kind == "path":
            fn = self.access.require_path_owner if editable else self.access.require_path
            doc = await fn(target.resource_id, user_id)
            for course_id in doc.get("course_ids", []):
                await self.access.require_course(course_id, user_id)
        else:
            course_id = target.course_id if target.kind == "module" else target.resource_id
            fn = self.access.require_course_owner if editable else self.access.require_course
            doc = await fn(course_id, user_id)
            if target.kind == "module":
                doc = await self.access.require_module(course_id, target.resource_id, user_id)
        fields = {key: doc.get(key) for key in FIELDS[target.kind]}
        if target.kind == "course":
            modules = await ModuleService(self.storage).list_modules(target.resource_id)
            fields["module_ids"] = [m.id for m in modules]
            fields["outline"] = [
                dict(
                    id=m.id,
                    title=m.title,
                    description=m.description,
                    objectives=m.objectives,
                    order_index=m.order_index,
                )
                for m in modules
            ]
        return ResourceSnapshot(target=target, fields=fields, fingerprint=fingerprint(fields))

    async def check(self, user_id, snapshots, *, compare=False, editable=False):
        for saved in snapshots:
            current = await self.snapshot(user_id, saved.target, editable=editable)
            if compare and saved.fingerprint != current.fingerprint:
                raise ConflictException("Source changed. Review a fresh proposal before applying.")
