"""Service tests for live path membership, access and owner mutations.

Fixtures persist disposable courses so path validation uses the real access policy.
Reuse is derived from distinct paths, never from increment/decrement mocks.
"""

import pytest

from exceptions import (
    ErrorCode,
    ForbiddenException,
    NotFoundException,
    StudyBuddyException,
)
from models.learning_path import LearningPathCreate, LearningPathUpdate
from services.course_service import CourseService
from services.learning_path_service import LearningPathService
from storage.json_storage import JSONStorage


@pytest.fixture
async def learning_path_service(temp_storage_path):
    """Real course/path services backed by disposable JSON storage."""
    storage = JSONStorage(temp_storage_path)
    course_service = CourseService(storage, content_path=temp_storage_path + "/content")
    for cid in ["c1", "c2", "c9"]:
        await storage.create(
            "courses", {"id": cid, "title": cid, "author_id": "author", "visibility": "public"}
        )
    return LearningPathService(storage=storage, course_service=course_service)


@pytest.fixture
async def seeded_path(client, auth_headers, storage, learning_path_service):
    """Create a real learning path (owner test@example.com) via the API and return its id."""
    # Create a course first so course validation passes
    course = await client.post(
        "/api/v1/courses",
        json={"title": "Seed Course", "description": "d"},
        headers=auth_headers,
    )
    assert course.status_code == 200, course.text
    course_id = course.json()["id"]

    path = await client.post(
        "/api/v1/paths",
        json={"title": "Seed Path", "description": "p", "course_ids": [course_id]},
        headers=auth_headers,
    )
    assert path.status_code == 200, path.text
    return path.json()


_path_counter = [0]  # module-level counter for unique stable ids in seeding


async def _create_path_direct(
    service, user_id="owner-1", course_ids=None, path_id="path", **overrides
):
    """Seed a learning path directly into storage under a stable id.

    Bypasses create_path (which would validate courses + assign a random
    id); instead writes the exact record shape the service round-trips.
    """
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "id": path_id,
        "owner_id": user_id,
        "title": "Path",
        "description": None,
        "thumbnail_url": None,
        "difficulty": "beginner",
        "estimated_hours": None,
        "course_ids": course_ids if course_ids is not None else [],
        "visibility": "private",
        "created_at": now,
        "updated_at": now,
    }
    record.update(overrides)  # caller may override visibility/title/etc.
    await service.storage.create("learning_paths", record)
    return record


class TestListPaths:
    @pytest.mark.asyncio
    async def test_list_paths_empty(self, learning_path_service):
        """No paths -> empty list."""
        paths = await learning_path_service.list_paths("reader")
        assert paths == []

    @pytest.mark.asyncio
    async def test_list_paths_includes_own_and_public_no_dupe(self, learning_path_service):
        """Own private + public, with dedupe for public paths the user owns."""
        await _create_path_direct(
            learning_path_service, "user-1", visibility="private", path_id="p1"
        )
        await _create_path_direct(
            learning_path_service, "user-1", visibility="public", path_id="p2"
        )
        await _create_path_direct(learning_path_service, "other", visibility="public", path_id="p3")

        paths = await learning_path_service.list_paths("user-1")
        assert len(paths) == 3  # own private, own public, other public

    @pytest.mark.asyncio
    async def test_list_paths_no_user_gets_no_paths(self, learning_path_service):
        """Every visibility requires sign-in under D2."""
        await _create_path_direct(
            learning_path_service, "user-1", visibility="private", path_id="p1"
        )
        await _create_path_direct(
            learning_path_service, "user-2", visibility="public", path_id="p2"
        )

        paths = await learning_path_service.list_paths(None)
        assert paths == []

    @pytest.mark.asyncio
    async def test_list_paths_course_count(self, learning_path_service):
        """course_count reflects the number of course_ids."""
        await _create_path_direct(
            learning_path_service,
            "user-1",
            course_ids=["c1", "c2"],
            visibility="public",
            path_id="p1",
        )
        paths = await learning_path_service.list_paths("reader")
        assert paths[0].course_count == 2


class TestListUserPaths:
    @pytest.mark.asyncio
    async def test_only_own(self, learning_path_service):
        await _create_path_direct(learning_path_service, "user-1", path_id="p1")
        await _create_path_direct(learning_path_service, "user-2", path_id="p2")
        paths = await learning_path_service.list_user_paths("user-1")
        assert len(paths) == 1


class TestGetPath:
    @pytest.mark.asyncio
    async def test_get_missing_raises_not_found(self, learning_path_service):
        with pytest.raises(NotFoundException) as exc:
            await learning_path_service.get_path("nope", "user-1")
        assert exc.value.code == ErrorCode.LEARNING_PATH_NOT_FOUND

    @pytest.mark.asyncio
    async def test_get_private_owned(self, learning_path_service):
        await _create_path_direct(learning_path_service, "user-1", visibility="private")
        path = await learning_path_service.get_path("path", "user-1")
        assert path.owner_id == "user-1"

    @pytest.mark.asyncio
    async def test_get_private_other_user_hidden(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", visibility="private")
        with pytest.raises(NotFoundException):
            await learning_path_service.get_path("path", "other")

    @pytest.mark.asyncio
    async def test_get_public_any_user(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", visibility="public")
        path = await learning_path_service.get_path("path", "anyone")
        assert path.visibility == "public"


class TestCreatePath:
    @pytest.mark.asyncio
    async def test_create_validates_courses_and_persists_membership(self, learning_path_service):
        data = LearningPathCreate(title="New", course_ids=["c1"])

        path = await learning_path_service.create_path("user-1", data)

        assert path.id
        assert path.owner_id == "user-1"
        assert (await learning_path_service.storage.get("learning_paths", path.id))[
            "course_ids"
        ] == ["c1"]

    @pytest.mark.asyncio
    async def test_create_raises_when_course_missing(self, learning_path_service):
        data = LearningPathCreate(title="New", course_ids=["ghost"])

        with pytest.raises(NotFoundException) as exc:
            await learning_path_service.create_path("user-1", data)
        assert exc.value.code == ErrorCode.COURSE_NOT_FOUND

    @pytest.mark.asyncio
    async def test_create_persists_model(self, learning_path_service, storage):
        data = LearningPathCreate(title="Persist", course_ids=["c1"])

        path = await learning_path_service.create_path("user-1", data)
        stored = await storage.get("learning_paths", path.id)
        assert stored["title"] == "Persist"
        assert stored["owner_id"] == "user-1"


class TestUpdatePath:
    @pytest.mark.asyncio
    async def test_update_owner_only(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner")
        updated = await learning_path_service.update_path(
            "path", "owner", LearningPathUpdate(title="Renamed")
        )
        assert updated.title == "Renamed"

    @pytest.mark.asyncio
    async def test_update_other_user_forbidden(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner")
        with pytest.raises(ForbiddenException):
            await learning_path_service.update_path(
                "path", "intruder", LearningPathUpdate(title="Hacked")
            )


class TestDeletePath:
    @pytest.mark.asyncio
    async def test_delete_owner_only_removes_reference(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1"])
        deleted = await learning_path_service.delete_path("path", "owner")
        assert deleted is True
        assert all(
            "c1" not in p["course_ids"]
            for p in await learning_path_service.storage.list("learning_paths")
        )

    @pytest.mark.asyncio
    async def test_delete_other_user_forbidden(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner")
        with pytest.raises(ForbiddenException):
            await learning_path_service.delete_path("path", "intruder")


class TestAddCourseToPath:
    @pytest.mark.asyncio
    async def test_add_course_persists_and_returns(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=[])
        result = await learning_path_service.add_course_to_path("path", "owner", "c9")
        assert "c9" in result.course_ids
        assert (await learning_path_service.storage.get("learning_paths", "path"))[
            "course_ids"
        ] == ["c9"]

    @pytest.mark.asyncio
    async def test_add_duplicate_is_noop(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1"])
        result = await learning_path_service.add_course_to_path("path", "owner", "c1")
        assert result.course_ids == ["c1"]
        assert len(await learning_path_service.storage.list("learning_paths")) == 1


class TestRemoveCourseFromPath:
    @pytest.mark.asyncio
    async def test_remove_course_removes_reference(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1", "c2"])
        result = await learning_path_service.remove_course_from_path("path", "owner", "c1")
        assert result.course_ids == ["c2"]
        assert all(
            "c1" not in p["course_ids"]
            for p in await learning_path_service.storage.list("learning_paths")
        )

    @pytest.mark.asyncio
    async def test_remove_missing_course_raises(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1"])
        with pytest.raises(NotFoundException) as exc:
            await learning_path_service.remove_course_from_path("path", "owner", "ghost")
        assert exc.value.code == ErrorCode.COURSE_NOT_FOUND


class TestReorderCourses:
    @pytest.mark.asyncio
    async def test_reorder_persists_new_order(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1", "c2"])
        result = await learning_path_service.reorder_courses("path", "owner", ["c2", "c1"])
        assert result.course_ids == ["c2", "c1"]

    @pytest.mark.asyncio
    async def test_reorder_mismatch_raises(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner", course_ids=["c1", "c2"])
        with pytest.raises(StudyBuddyException):
            await learning_path_service.reorder_courses("path", "owner", ["c1", "c3"])


class TestOwnedPathHelpers:
    @pytest.mark.asyncio
    async def test_get_owned_path_missing(self, learning_path_service):
        with pytest.raises(NotFoundException):
            await learning_path_service._get_owned_path("ghost", "owner")

    @pytest.mark.asyncio
    async def test_get_owned_path_forbidden(self, learning_path_service):
        await _create_path_direct(learning_path_service, "owner")
        with pytest.raises(ForbiddenException):
            await learning_path_service._get_owned_path("path", "other")

    def test_to_response_course_count(self, learning_path_service):
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()
        resp = learning_path_service._to_response(
            {
                "id": "p",
                "title": "T",
                "owner_id": "o",
                "visibility": "public",
                "course_ids": ["a", "b"],
                "created_at": now,
                "updated_at": now,
            }
        )
        assert resp.course_count == 2
