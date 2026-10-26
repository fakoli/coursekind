"""Live course references and independent, idempotent path following."""

from collections import Counter
from datetime import datetime, timezone
from uuid import NAMESPACE_URL, uuid4, uuid5

from exceptions import ErrorCode, NotFoundException, StudyBuddyException
from models.learning_path import (
    LearningPath,
    LearningPathCreate,
    LearningPathResponse,
    LearningPathUpdate,
)
from services.access_service import AccessService, can_discover, can_read
from services.base_service import BaseService
from services.course_service import CourseService
from storage.base import StorageBackend


class LearningPathService(BaseService):
    def __init__(self, storage: StorageBackend, course_service: CourseService):
        super().__init__(storage)
        self.course_service = course_service
        self.access = AccessService(storage, str(course_service.content_path))

    async def list_paths(self, user_id: str | None = None) -> list[LearningPathResponse]:
        return [
            self._to_response(p)
            for p in await self.storage.list("learning_paths")
            if can_discover(p, user_id, "owner_id")
        ]

    async def list_user_paths(self, user_id: str) -> list[LearningPathResponse]:
        return [
            self._to_response(p)
            for p in await self.storage.list("learning_paths", {"owner_id": user_id})
        ]

    async def get_path(self, path_id: str, user_id: str | None = None) -> LearningPath:
        return LearningPath(**await self.access.require_path(path_id, user_id))

    async def create_path(self, user_id: str, data: LearningPathCreate) -> LearningPath:
        async with self.storage.transaction():
            course_ids = list(dict.fromkeys(data.course_ids))
            for course_id in course_ids:
                await self.access.require_course(course_id, user_id)
            now = datetime.now(timezone.utc)
            path = LearningPath(
                **{**data.model_dump(), "course_ids": course_ids},
                id=str(uuid4()),
                owner_id=user_id,
                created_at=now,
                updated_at=now,
            )
            await self.storage.create("learning_paths", path.model_dump(mode="json"))
            return path

    async def update_path(
        self, path_id: str, user_id: str, data: LearningPathUpdate
    ) -> LearningPath:
        async with self.storage.transaction():
            await self._get_owned_path(path_id, user_id)
            return await self._update(path_id, data.model_dump(exclude_unset=True, mode="json"))

    async def delete_path(self, path_id: str, user_id: str) -> bool:
        async with self.storage.transaction():
            await self._get_owned_path(path_id, user_id)
            for follow in await self.storage.list("path_follows", {"path_id": path_id}):
                await self.storage.delete("path_follows", follow["id"])
            return await self.storage.delete("learning_paths", path_id)

    async def add_course_to_path(self, path_id: str, user_id: str, course_id: str) -> LearningPath:
        async with self.storage.transaction():
            path = await self._get_owned_path(path_id, user_id)
            await self.access.require_course(course_id, user_id)
            return await self._update(
                path_id,
                {"course_ids": list(dict.fromkeys([*path.get("course_ids", []), course_id]))},
            )

    async def remove_course_from_path(
        self, path_id: str, user_id: str, course_id: str
    ) -> LearningPath:
        async with self.storage.transaction():
            path = await self._get_owned_path(path_id, user_id)
            if course_id not in path.get("course_ids", []):
                raise NotFoundException(
                    "Course not in learning path", code=ErrorCode.COURSE_NOT_FOUND
                )
            return await self._update(
                path_id,
                {"course_ids": [cid for cid in path.get("course_ids", []) if cid != course_id]},
            )

    async def reorder_courses(
        self, path_id: str, user_id: str, course_ids: list[str]
    ) -> LearningPath:
        async with self.storage.transaction():
            path = await self._get_owned_path(path_id, user_id)
            if Counter(path.get("course_ids", [])) != Counter(course_ids):
                raise StudyBuddyException(
                    "Course IDs must match existing membership exactly",
                    code=ErrorCode.INVALID_MODULE_ORDER,
                )
            return await self._update(path_id, {"course_ids": course_ids})

    async def _update(self, path_id: str, updates: dict) -> LearningPath:
        data = await self.storage.update(
            "learning_paths",
            path_id,
            {**updates, "updated_at": datetime.now(timezone.utc).isoformat()},
        )
        return LearningPath(**data)

    async def _get_owned_path(self, path_id: str, user_id: str) -> dict:
        return await self.access._owned("learning_paths", path_id, user_id)

    def _to_response(self, data: dict) -> LearningPathResponse:
        return LearningPathResponse(**data, course_count=len(data.get("course_ids", [])))

    @staticmethod
    def follow_id(path_id: str, user_id: str) -> str:
        return str(uuid5(NAMESPACE_URL, f"path-follow:{len(user_id)}:{user_id}:{path_id}"))

    async def is_following(self, path_id: str, user_id: str | None) -> bool:
        return bool(
            user_id and await self.storage.get("path_follows", self.follow_id(path_id, user_id))
        )

    async def follow(self, path_id: str, user_id: str) -> dict:
        async with self.storage.transaction():
            await self.access.require_path(path_id, user_id)
            record_id = self.follow_id(path_id, user_id)
            if not await self.storage.get("path_follows", record_id):
                await self.storage.create(
                    "path_follows",
                    {
                        "id": record_id,
                        "path_id": path_id,
                        "user_id": user_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            return {"is_following": True}

    async def unfollow(self, path_id: str, user_id: str) -> dict:
        # A learner may always remove their selection, even after access revocation.
        await self.storage.delete("path_follows", self.follow_id(path_id, user_id))
        return {"is_following": False}

    async def list_following(self, user_id: str) -> list[LearningPathResponse]:
        paths = []
        async with self.storage.transaction():
            for follow in await self.storage.list("path_follows", {"user_id": user_id}):
                path = await self.storage.get("learning_paths", follow["path_id"])
                if path and can_read(path, user_id, "owner_id"):
                    paths.append(self._to_response(path))
                else:
                    # Revoked/deleted selections are removed, never expose private metadata.
                    await self.storage.delete("path_follows", follow["id"])
        return paths
