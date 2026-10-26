"""Owner-only workspaces with atomic optimistic writes and durable replay receipts."""

import hashlib
import json
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid4, uuid5

from exceptions import ConflictException, NotFoundException
from models.workspace import Workspace, WorkspaceCreate, WorkspaceUpdate
from services.access_service import AccessService
from storage.base import StorageBackend


class WorkspaceService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self.access = AccessService(storage)

    async def get(self, user_id: str, workspace_id: str) -> Workspace:
        doc = await self.storage.get("workspaces", workspace_id)
        if not doc or doc["owner_id"] != user_id:
            raise NotFoundException("Workspace not found")
        return await self._current_links(user_id, doc)

    async def _current_links(self, user_id: str, doc: dict) -> Workspace:
        workspace = Workspace.model_validate(doc)
        if workspace.path_id:
            try:
                path = await self.access.require_path(workspace.path_id, user_id)
            except NotFoundException:
                # Keep the private brief available for missing-source recovery.
                return workspace
            workspace.course_ids = list(path.get("course_ids", []))
        return workspace

    async def list(self, user_id: str, archived: bool = False) -> list[Workspace]:
        docs = await self.storage.list("workspaces", {"owner_id": user_id, "archived": archived})
        return [
            await self._current_links(user_id, doc)
            for doc in sorted(docs, key=lambda d: d["updated_at"], reverse=True)
        ]

    async def _source(self, user_id: str, data: WorkspaceCreate) -> dict | None:
        if data.source_course_id is not None:
            await self.access.require_course_owner(data.source_course_id, user_id)
        if data.source_path_id is not None:
            return await self.access.require_path_owner(data.source_path_id, user_id)
        return None

    def _receipt(
        self, user_id: str, operation: str, data: WorkspaceCreate | WorkspaceUpdate
    ) -> tuple[str, str]:
        key = str(uuid5(NAMESPACE_URL, f"coursekind:workspace-request:{user_id}:{data.request_id}"))
        fingerprint = hashlib.sha256(
            json.dumps(
                {"operation": operation, "input": data.model_dump(mode="json")}, sort_keys=True
            ).encode()
        ).hexdigest()
        return key, fingerprint

    async def _replay(self, user_id: str, key: str, fingerprint: str) -> Workspace | None:
        receipt = await self.storage.get("workspace_requests", key)
        if not receipt:
            return None
        # Check current access before disclosing even a historical response.
        await self.get(user_id, receipt["workspace_id"])
        if receipt["fingerprint"] != fingerprint:
            raise ConflictException("Request ID already used with different input")
        return Workspace.model_validate(receipt["result"])

    async def _record(self, key: str, fingerprint: str, workspace: Workspace) -> Workspace:
        await self.storage.create(
            "workspace_requests",
            {
                "id": key,
                "workspace_id": workspace.id,
                "fingerprint": fingerprint,
                "result": workspace.model_dump(mode="json"),
            },
        )
        return workspace

    async def create(self, user_id: str, user_name: str, data: WorkspaceCreate) -> Workspace:
        key, fingerprint = self._receipt(user_id, "create", data)
        async with self.storage.transaction():
            path = await self._source(user_id, data)
            replay = await self._replay(user_id, key, fingerprint)
            if replay:
                return replay
            for workspace in await self.list(user_id):
                if (
                    data.source_course_id
                    and not workspace.path_id
                    and data.source_course_id in workspace.course_ids
                ) or (data.source_path_id and workspace.path_id == data.source_path_id):
                    return await self._record(key, fingerprint, workspace)
            now = datetime.now(timezone.utc)
            workspace = Workspace(
                id=str(uuid4()),
                owner_id=user_id,
                brief=data.brief,
                course_ids=list(path.get("course_ids", []))
                if path
                else [data.source_course_id]
                if data.source_course_id
                else [],
                path_id=data.source_path_id,
                created_at=now,
                updated_at=now,
            )
            await self.storage.create("workspaces", workspace.model_dump(mode="json"))
            return await self._record(key, fingerprint, workspace)

    async def update(self, user_id: str, workspace_id: str, data: WorkspaceUpdate) -> Workspace:
        key, fingerprint = self._receipt(user_id, f"update:{workspace_id}", data)
        async with self.storage.transaction():
            workspace = await self.get(user_id, workspace_id)
            replay = await self._replay(user_id, key, fingerprint)
            if replay:
                return replay
            if workspace.version != data.expected_version:
                raise ConflictException(
                    "Workspace changed. Reload saved brief before saving again."
                )
            updates = data.model_dump(
                mode="json", exclude={"request_id", "expected_version"}, exclude_none=True
            )
            updates.update(
                version=workspace.version + 1, updated_at=datetime.now(timezone.utc).isoformat()
            )
            doc = await self.storage.update("workspaces", workspace_id, updates)
            return await self._record(key, fingerprint, await self._current_links(user_id, doc))
