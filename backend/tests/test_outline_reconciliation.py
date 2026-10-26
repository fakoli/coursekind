import asyncio
from unittest.mock import AsyncMock

import pytest

from exceptions import ConflictException
from models.course import CourseCreate
from models.module import ModuleCreate
from services.course_service import CourseService
from services.module_service import ModuleService


@pytest.fixture(params=["json", "sqlite"])
async def outline_store(storage, tmp_path, request):
    if request.param == "sqlite":
        from storage.sqlite_storage import SQLiteStorage

        storage = SQLiteStorage(str(tmp_path / "outlines.db"))
    yield storage
    if request.param == "sqlite":
        await storage.close()


async def setup(storage):
    course = await CourseService(storage).create_course(
        "owner", "Owner", CourseCreate(title="Course")
    )
    service = ModuleService(storage)
    module = await service.create_module(
        course.id, "owner", ModuleCreate(title="A", order_index=0, content_markdown="Keep lesson")
    )
    initial = [m.model_dump(mode="json") for m in await service.list_modules(course.id)]
    draft = [
        {"id": module.id, "title": "Edited", "description": ""},
        {"id": "new-client", "title": "New", "description": ""},
    ]
    return course.id, service, module, initial, draft


@pytest.mark.parametrize("change", ["add", "delete", "edit"])
async def test_stale_outline_conflicts_without_deletion_or_resurrection(outline_store, change):
    cid, service, module, initial, draft = await setup(outline_store)
    if change == "add":
        await service.create_module(cid, "owner", ModuleCreate(title="Concurrent", order_index=1))
    elif change == "delete":
        await service.delete_module(cid, module.id, "owner")
    else:
        from models.module import ModuleUpdate

        await service.update_module(
            cid, module.id, "owner", ModuleUpdate(content_markdown="Concurrent content")
        )
    before = await outline_store.list("modules")
    with pytest.raises(ConflictException):
        await service.reconcile_outlines(cid, "owner", initial, draft, "request")
    assert await outline_store.list("modules") == before


async def test_outline_commit_and_lost_response_replay_preserve_content(outline_store):
    cid, service, module, initial, draft = await setup(outline_store)
    result = await service.reconcile_outlines(cid, "owner", initial, draft, "request")
    assert len(result) == 2
    assert (await service.get_module(cid, module.id, "owner")).content_markdown == "Keep lesson"
    await service.create_module(cid, "owner", ModuleCreate(title="After response", order_index=2))
    assert await service.reconcile_outlines(cid, "owner", initial, draft, "request") == result
    assert len(await service.list_modules(cid)) == 3
    with pytest.raises(ConflictException):
        await service.reconcile_outlines(cid, "owner", initial, [], "request")


async def test_outline_failure_rolls_back_all_changes(outline_store, monkeypatch):
    cid, service, module, initial, draft = await setup(outline_store)
    before = await outline_store.list("modules")
    monkeypatch.setattr(service, "create_module", AsyncMock(side_effect=RuntimeError("failed")))
    with pytest.raises(RuntimeError):
        await service.reconcile_outlines(cid, "owner", initial, draft, "request")
    assert await outline_store.list("modules") == before
    assert not await outline_store.list("outline_operations")


async def test_concurrent_addition_during_reconcile_waits_and_survives(outline_store, monkeypatch):
    cid, service, module, initial, draft = await setup(outline_store)
    entered, release, writer_started = asyncio.Event(), asyncio.Event(), asyncio.Event()
    original_update = outline_store.update

    async def held_update(collection, key, updates):
        if collection == "modules" and key == module.id:
            entered.set()
            await release.wait()
        return await original_update(collection, key, updates)

    monkeypatch.setattr(outline_store, "update", held_update)

    async def writer():
        await entered.wait()
        writer_started.set()
        return await service.create_module(
            cid, "owner", ModuleCreate(title="Concurrent", order_index=3)
        )

    # Create independent tasks before either enters its storage transaction.
    writing = asyncio.create_task(writer())
    reconciling = asyncio.create_task(
        service.reconcile_outlines(cid, "owner", initial, draft, "request")
    )
    await asyncio.wait_for(writer_started.wait(), 2)
    assert not writing.done()
    release.set()
    await asyncio.wait_for(reconciling, 2)
    added = await asyncio.wait_for(writing, 2)
    assert (await service.get_module(cid, added.id, "owner")).title == "Concurrent"
    assert len(await service.list_modules(cid)) == 3
