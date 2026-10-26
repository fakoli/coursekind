"""One live access policy. Unlisted links grant reads; discovery does not.

Recipient IDs are stored only in raw documents, never serialized in public models.
A path grant never grants access to its referenced courses.
"""

import json
from pathlib import Path

from exceptions import ErrorCode, ForbiddenException, NotFoundException
from storage.base import StorageBackend


def can_read(resource: dict, user_id: str | None, owner_key: str) -> bool:
    return resource.get("visibility", "private") in ("public", "unlisted") or bool(
        user_id
        and (resource.get(owner_key) == user_id or user_id in resource.get("shared_with", []))
    )


def can_discover(resource: dict, user_id: str | None, owner_key: str) -> bool:
    return resource.get("visibility") == "public" or bool(
        user_id
        and (resource.get(owner_key) == user_id or user_id in resource.get("shared_with", []))
    )


class AccessService:
    def __init__(self, storage: StorageBackend, content_path: str = "./content/courses"):
        self.storage = storage
        self.content_path = Path(content_path).resolve()

    async def require_course(self, course_id: str, user_id: str | None) -> dict:
        data = await self.storage.get("courses", course_id)
        if data is None:
            path = (self.content_path / course_id).resolve()
            if path.parent == self.content_path and (path / "meta.json").is_file():
                with (path / "meta.json").open() as file:
                    meta = json.load(file)
                return {
                    **meta,
                    "id": course_id,
                    "source": "filesystem",
                    "visibility": "public",
                    "author_id": "system",
                    "title": meta.get("title", course_id),
                }
        if data is None or not can_read(data, user_id, "author_id"):
            raise NotFoundException("Course not found", code=ErrorCode.COURSE_NOT_FOUND)
        return data

    async def require_path(self, path_id: str, user_id: str | None) -> dict:
        data = await self.storage.get("learning_paths", path_id)
        if data is None or not can_read(data, user_id, "owner_id"):
            raise NotFoundException(
                "Learning path not found", code=ErrorCode.LEARNING_PATH_NOT_FOUND
            )
        return data

    async def require_course_owner(self, course_id: str, user_id: str) -> dict:
        data = await self.require_course(course_id, user_id)
        if data.get("source") == "filesystem" or data.get("author_id") != user_id:
            raise ForbiddenException(
                "Only the course author can edit this course", code=ErrorCode.ACCESS_DENIED
            )
        return data

    async def require_path_owner(self, path_id: str, user_id: str) -> dict:
        data = await self.require_path(path_id, user_id)
        if data.get("owner_id") != user_id:
            raise ForbiddenException(
                "Only the path owner can edit this path", code=ErrorCode.ACCESS_DENIED
            )
        return data

    async def require_module(self, course_id: str, module_id: str, user_id: str | None) -> dict:
        from services.module_service import ModuleService

        module = await ModuleService(self.storage, str(self.content_path)).get_module(
            course_id, module_id, user_id
        )
        return module.model_dump(mode="json")

    async def sharing(self, collection: str, resource_id: str, user_id: str) -> dict:
        data = await self._owned(collection, resource_id, user_id)
        recipients = []
        for recipient_id in data.get("shared_with", []):
            recipient = await self.storage.get("users", recipient_id)
            if recipient:
                recipients.append(
                    {"id": recipient_id, "name": recipient["name"], "email": recipient["email"]}
                )
        return {"recipients": recipients}

    async def _owned(self, collection: str, resource_id: str, user_id: str) -> dict:
        # Author-only endpoint may return forbidden, but never resource metadata.
        data = await self.storage.get(collection, resource_id)
        if not data:
            raise NotFoundException("Resource not found")
        owner_key = "author_id" if collection == "courses" else "owner_id"
        if data.get(owner_key) != user_id or data.get("source") == "filesystem":
            raise ForbiddenException("Only the owner can manage sharing")
        return data

    async def grant(self, collection: str, resource_id: str, user_id: str, email: str) -> dict:
        async with self.storage.transaction():
            data = await self._owned(collection, resource_id, user_id)
            users = await self.storage.list("users")
            recipient = next(
                (u for u in users if u.get("email", "").casefold() == email.strip().casefold()),
                None,
            )
            if recipient is None:
                raise NotFoundException("No registered recipient with that email")
            ids = list(dict.fromkeys([*data.get("shared_with", []), recipient["id"]]))
            await self.storage.update(collection, resource_id, {"shared_with": ids})
            return await self.sharing(collection, resource_id, user_id)

    async def revoke(
        self, collection: str, resource_id: str, user_id: str, recipient_id: str
    ) -> dict:
        async with self.storage.transaction():
            data = await self._owned(collection, resource_id, user_id)
            await self.storage.update(
                collection,
                resource_id,
                {"shared_with": [i for i in data.get("shared_with", []) if i != recipient_id]},
            )
            return await self.sharing(collection, resource_id, user_id)
