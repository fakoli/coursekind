"""Service-level tests for ModuleService (database + filesystem paths).

Before this, ModuleService was 21% covered (mostly the error branches in
file-system handling were untested). These tests cover DB CRUD, batch,
reorder, permission checks, and the filesystem reader logic.
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from exceptions import ErrorCode, ForbiddenException, NotFoundException, StudyBuddyException
from models.module import ModuleCreate, ModuleUpdate
from services.module_service import ModuleService


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeStorage:
    """In-memory dict-based storage that mimics the JSONStorage sync API
    but with async methods matched to the storage.backend interface."""

    def __init__(self):
        self.data: dict[str, dict] = {}

    @asynccontextmanager
    async def transaction(self):
        yield self

    async def get(self, collection, key):
        return self.data.get(collection, {}).get(key)

    async def list(self, collection, query=None):
        items = list(self.data.get(collection, {}).values())
        if not query:
            return items
        return [i for i in items if all(i.get(k) == v for k, v in query.items())]

    async def create(self, collection, record):
        key = record["id"]
        self.data.setdefault(collection, {})[key] = record
        return record

    async def batch_create(self, collection, records):
        for r in records:
            await self.create(collection, r)
        return records

    async def update(self, collection, key, updates):
        store = self.data.setdefault(collection, {})
        if key not in store:
            return None
        store[key] = {**store[key], **updates}
        return store[key]

    async def delete(self, collection, key):
        store = self.data.get(collection, {})
        if key not in store:
            return False
        del store[key]
        return True


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def service(storage, tmp_path):
    """ModuleService backed by FakeStorage, no filesystem content."""
    return ModuleService(storage=storage, content_path=str(tmp_path))


async def _seed_course(
    storage, author_id="owner-1", visibility="private", course_id=None, source="db"
):
    if course_id is None:
        course_id = str(uuid4())
    record = {
        "id": course_id,
        "title": "Course",
        "author_id": author_id,
        "visibility": visibility,
        "source": source,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await storage.create("courses", record)
    return course_id


async def _seed_module(
    storage, course_id, title="Module", order_index=0, flashcards=None, quiz=None
):
    module_id = str(uuid4())
    record = {
        "id": module_id,
        "course_id": course_id,
        "title": title,
        "order_index": order_index,
        "content_markdown": "content",
        "flashcards": flashcards or [],
        "quiz": quiz,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await storage.create("modules", record)
    return module_id


def _module_create(**overrides):
    base = {
        "title": "New Module",
        "order_index": 0,
        "content_markdown": "content",
        "flashcards": [],
        "quiz": None,
    }
    base.update(overrides)
    return ModuleCreate(**base)


class TestGetModule:
    @pytest.mark.asyncio
    async def test_get_missing_filesystem_falls_back(self, service, storage, tmp_path):
        """If course not in DB, tries filesystem and 404s when absent."""
        course_path = tmp_path / "fs-course"
        course_path.mkdir()
        with pytest.raises(NotFoundException) as exc:
            await service.get_module("fs-course", "missing-module", "user-1")
        assert exc.value.code == ErrorCode.COURSE_NOT_FOUND

    @pytest.mark.asyncio
    async def test_get_private_course_other_user_forbidden(self, service, storage):
        course_id = await _seed_course(storage, author_id="owner")
        module_id = await _seed_module(storage, course_id)
        with pytest.raises(NotFoundException) as exc:
            await service.get_module(course_id, module_id, "other")
        assert exc.value.code == ErrorCode.COURSE_NOT_FOUND

    @pytest.mark.asyncio
    async def test_get_private_course_owner_ok(self, service, storage):
        course_id = await _seed_course(storage, author_id="owner")
        module_id = await _seed_module(storage, course_id)
        module = await service.get_module(course_id, module_id, "owner")
        assert module.id == module_id
        assert module.title == "Module"

    @pytest.mark.asyncio
    async def test_get_public_course_any_user(self, service, storage):
        course_id = await _seed_course(storage, visibility="public")
        module_id = await _seed_module(storage, course_id)
        module = await service.get_module(course_id, module_id, "anyone")
        assert module.id == module_id

    @pytest.mark.asyncio
    async def test_get_module_wrong_course_404(self, service, storage):
        course_id = await _seed_course(storage)
        other_course_id = await _seed_course(storage)
        module_id = await _seed_module(storage, course_id)
        with pytest.raises(NotFoundException):
            await service.get_module(other_course_id, module_id, "owner-1")


class TestListModules:
    @pytest.mark.asyncio
    async def test_list_empty(self, service, storage):
        course_id = await _seed_course(storage)
        assert await service.list_modules(course_id) == []

    @pytest.mark.asyncio
    async def test_list_sorted_and_counts(self, service, storage):
        course_id = await _seed_course(storage)
        await _seed_module(
            storage,
            course_id,
            title="B",
            order_index=1,
            flashcards=[{"front": "f", "back": "b"}],
        )
        await _seed_module(storage, course_id, title="A", order_index=0)
        summaries = await service.list_modules(course_id)
        assert [s.title for s in summaries] == ["A", "B"]
        assert summaries[1].flashcard_count == 1
        assert summaries[0].flashcard_count == 0
        assert summaries[0].has_quiz is False

    @pytest.mark.asyncio
    async def test_list_flashcards_none_has_quiz(self, service, storage):
        course_id = await _seed_course(storage)
        await _seed_module(
            storage,
            course_id,
            quiz={"questions": [{"question": "q", "options": ["a"], "correct_index": 0}]},
        )
        summaries = await service.list_modules(course_id)
        assert summaries[0].has_quiz is True


class TestCreateModule:
    @pytest.mark.asyncio
    async def test_create_verifies_ownership(self, service, storage):
        course_id = await _seed_course(storage, author_id="owner")
        with pytest.raises(ForbiddenException) as exc:
            await service.create_module(course_id, "intruder", _module_create())
        assert exc.value.code == ErrorCode.ACCESS_DENIED

    @pytest.mark.asyncio
    async def test_create_missing_course_404(self, service, storage):
        with pytest.raises(NotFoundException) as exc:
            await service.create_module("ghost", "owner", _module_create())
        assert exc.value.code == ErrorCode.COURSE_NOT_FOUND

    @pytest.mark.asyncio
    async def test_create_filesystem_course_forbidden(self, service, storage, tmp_path):
        fs_course = tmp_path / "fs-course"
        fs_course.mkdir()
        with pytest.raises(ForbiddenException) as exc:
            await service.create_module("fs-course", "owner", _module_create())
        assert exc.value.code == ErrorCode.COURSE_NOT_EDITABLE

    @pytest.mark.asyncio
    async def test_create_success(self, service, storage):
        course_id = await _seed_course(storage)
        module = await service.create_module(course_id, "owner-1", _module_create(title="Created"))
        assert module.title == "Created"
        assert module.course_id == course_id
        stored = await storage.get("modules", module.id)
        assert stored["title"] == "Created"


class TestBatchCreateModules:
    @pytest.mark.asyncio
    async def test_batch_creates_multiple(self, service, storage):
        course_id = await _seed_course(storage)
        modules = await service.batch_create_modules(
            course_id,
            "owner-1",
            [_module_create(title="M1", order_index=0), _module_create(title="M2", order_index=1)],
        )
        assert len(modules) == 2
        assert {m.title for m in modules} == {"M1", "M2"}
        stored = await storage.list("modules", {"course_id": course_id})
        assert len(stored) == 2


class TestUpdateModule:
    @pytest.mark.asyncio
    async def test_update_ownership_and_fields(self, service, storage):
        course_id = await _seed_course(storage, author_id="owner")
        module_id = await _seed_module(storage, course_id, title="Old")
        with pytest.raises(ForbiddenException):
            await service.update_module(
                course_id, module_id, "intruder", ModuleUpdate(title="Hacked")
            )

        updated = await service.update_module(
            course_id, module_id, "owner", ModuleUpdate(title="New")
        )
        assert updated.title == "New"
        assert updated.updated_at >= updated.created_at

    @pytest.mark.asyncio
    async def test_update_missing_module_404(self, service, storage):
        course_id = await _seed_course(storage)
        with pytest.raises(NotFoundException) as exc:
            await service.update_module(course_id, "ghost", "owner-1", ModuleUpdate(title="X"))
        assert exc.value.code == ErrorCode.MODULE_NOT_FOUND


class TestDeleteModule:
    @pytest.mark.asyncio
    async def test_delete_ok(self, service, storage):
        course_id = await _seed_course(storage)
        module_id = await _seed_module(storage, course_id)
        assert await service.delete_module(course_id, module_id, "owner-1") is True
        assert await storage.get("modules", module_id) is None

    @pytest.mark.asyncio
    async def test_delete_missing_404(self, service, storage):
        course_id = await _seed_course(storage)
        with pytest.raises(NotFoundException):
            await service.delete_module(course_id, "ghost", "owner-1")


class TestReorderModules:
    @pytest.mark.asyncio
    async def test_reorder_updates_indexes(self, service, storage):
        course_id = await _seed_course(storage)
        m1 = await _seed_module(storage, course_id, title="A", order_index=0)
        m2 = await _seed_module(storage, course_id, title="B", order_index=1)
        summaries = await service.reorder_modules(course_id, "owner-1", [m2, m1])
        assert [s.title for s in summaries] == ["B", "A"]
        assert (await storage.get("modules", m2))["order_index"] == 0
        assert (await storage.get("modules", m1))["order_index"] == 1

    @pytest.mark.asyncio
    async def test_reorder_mismatch_404(self, service, storage):
        course_id = await _seed_course(storage)
        m1 = await _seed_module(storage, course_id)
        with pytest.raises(StudyBuddyException) as exc:
            await service.reorder_modules(course_id, "owner-1", [m1, "ghost"])
        assert exc.value.code == ErrorCode.INVALID_MODULE_ORDER


class TestFilesystem:
    @pytest.mark.asyncio
    async def test_get_filesystem_module(self, service, tmp_path):
        """Loads content.md, flashcards.json, quiz.json, derives title/order."""
        course_id = "fs-course"
        module_dir = tmp_path / course_id / "modules" / "01-intro"
        module_dir.mkdir(parents=True)
        (tmp_path / course_id / "meta.json").write_text('{"title":"Filesystem course"}')
        (module_dir / "content.md").write_text("# Intro")
        (module_dir / "flashcards.json").write_text(
            json.dumps({"cards": [{"front": "F", "back": "B", "visual": None}]})
        )
        (module_dir / "quiz.json").write_text(
            json.dumps(
                {
                    "questions": [
                        {
                            "question": "Q",
                            "options": ["a", "b"],
                            "correct_index": 0,
                            "explanation": None,
                        }
                    ]
                }
            )
        )

        module = await service.get_module(course_id, "01-intro", "anyone")
        assert module.title == "Intro"
        assert module.order_index == 0  # 01 -> 1 -> 0-indexed
        assert module.content_markdown == "# Intro"
        assert len(module.flashcards) == 1
        assert module.flashcards[0].front == "F"
        assert module.quiz is not None
        assert module.quiz.questions[0].question == "Q"

    @pytest.mark.asyncio
    async def test_list_filesystem_modules(self, service, tmp_path):
        course_id = "fs-course"
        (tmp_path / course_id / "modules" / "01-math").mkdir(parents=True)
        (tmp_path / course_id / "modules" / "02-science").mkdir(parents=True)
        (tmp_path / course_id / "modules" / "01-math" / "flashcards.json").write_text(
            json.dumps({"cards": [{"front": "a", "back": "b"}]})
        )

        summaries = await service.list_modules(course_id)
        assert len(summaries) == 2
        assert summaries[0].flashcard_count == 1
        assert summaries[0].has_quiz is False

    @pytest.mark.asyncio
    async def test_list_filesystem_empty(self, service, tmp_path):
        assert await service.list_modules("fs-nothing") == []

    @pytest.mark.asyncio
    async def test_get_filesystem_missing_module_404(self, service, tmp_path):
        (tmp_path / "fs-course" / "modules").mkdir(parents=True)
        with pytest.raises(NotFoundException):
            await service.get_module("fs-course", "ghost", "user")
