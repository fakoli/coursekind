"""Account-scoped replay identities shared with the workspace lifecycle ledger."""

from uuid import NAMESPACE_URL, uuid5

from exceptions import ConflictException
from services.workspace_context import fingerprint


class WorkspaceRequests:
    def __init__(self, storage, user_id, operation, request):
        self.storage = storage
        self.key = str(
            uuid5(NAMESPACE_URL, f"coursekind:workspace-request:{user_id}:{request.request_id}")
        )
        self.digest = fingerprint(
            {"operation": operation, "input": request.model_dump(mode="json")}
        )

    async def replay(self):
        doc = await self.storage.get("workspace_requests", self.key)
        if doc and doc["fingerprint"] != self.digest:
            raise ConflictException("Request ID already used with different input")
        return doc["result"] if doc else None

    async def record(self, workspace_id, result):
        await self.storage.create(
            "workspace_requests",
            dict(
                id=self.key,
                workspace_id=workspace_id,
                fingerprint=self.digest,
                result=result.model_dump(mode="json"),
            ),
        )
        return result
