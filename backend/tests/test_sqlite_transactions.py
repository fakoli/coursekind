import asyncio
import sqlite3
from pathlib import Path

import pytest

from storage.sqlite_storage import SQLiteStorage


@pytest.fixture
async def sqlite_storage(temp_storage_path):
    db_path = Path(temp_storage_path) / "test.db"
    storage = SQLiteStorage(str(db_path))
    yield storage
    await storage.close()


@pytest.mark.asyncio
async def test_sqlite_transaction_rolls_back_creates(sqlite_storage):
    with pytest.raises(RuntimeError):
        async with sqlite_storage.transaction() as txn:
            await txn.create("widgets", {"id": "one", "value": "first"})
            await txn.create("widgets", {"id": "two", "value": "second"})
            raise RuntimeError("boom")

    assert await sqlite_storage.get("widgets", "one") is None
    assert await sqlite_storage.get("widgets", "two") is None


@pytest.mark.asyncio
async def test_sqlite_transaction_rolls_back_updates_and_deletes(sqlite_storage):
    original = {"id": "one", "value": "first"}
    await sqlite_storage.create("widgets", original)

    with pytest.raises(RuntimeError):
        async with sqlite_storage.transaction() as txn:
            await txn.update("widgets", "one", {"value": "updated"})
            await txn.delete("widgets", "one")
            raise RuntimeError("boom")

    assert await sqlite_storage.get("widgets", "one") == original


@pytest.mark.asyncio
async def test_sqlite_other_tasks_wait_for_transaction_commit(sqlite_storage):
    entered = asyncio.Event()
    finish = asyncio.Event()

    async def writer():
        async with sqlite_storage.transaction() as txn:
            await txn.create("widgets", {"id": "one"})
            entered.set()
            await finish.wait()
            await txn.create("widgets", {"id": "two"})

    writer_task = asyncio.create_task(writer())
    await entered.wait()
    reader_task = asyncio.create_task(sqlite_storage.list("widgets"))
    try:
        await asyncio.sleep(0.02)
        assert not reader_task.done()
    finally:
        finish.set()
        await writer_task
    assert await asyncio.wait_for(reader_task, timeout=2) == [{"id": "one"}, {"id": "two"}]


@pytest.mark.asyncio
async def test_sqlite_nested_failure_rolls_back_inner_savepoint(sqlite_storage):
    async with sqlite_storage.transaction() as txn:
        await txn.create("widgets", {"id": "outer"})
        with pytest.raises(RuntimeError, match="inner failure"):
            async with txn.transaction() as nested:
                await nested.create("widgets", {"id": "inner"})
                raise RuntimeError("inner failure")
        assert await txn.get("widgets", "inner") is None

    assert await sqlite_storage.list("widgets") == [{"id": "outer"}]


@pytest.mark.asyncio
async def test_sqlite_cancelled_transaction_rolls_back_and_releases_lock(sqlite_storage):
    entered = asyncio.Event()

    async def writer():
        async with sqlite_storage.transaction() as txn:
            await txn.create("widgets", {"id": "cancelled"})
            entered.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(writer())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.wait_for(sqlite_storage.create("widgets", {"id": "after"}), timeout=2)
    assert await sqlite_storage.list("widgets") == [{"id": "after"}]


@pytest.mark.asyncio
async def test_sqlite_failed_batch_does_not_leave_partial_inserts(sqlite_storage):
    await sqlite_storage.create("widgets", {"id": "existing"})
    with pytest.raises(sqlite3.IntegrityError):
        await sqlite_storage.batch_create("widgets", [{"id": "new"}, {"id": "existing"}])
    assert await sqlite_storage.list("widgets") == [{"id": "existing"}]
    await sqlite_storage.create("widgets", {"id": "after"})
    assert await sqlite_storage.get("widgets", "new") is None


@pytest.mark.asyncio
async def test_sqlite_child_task_in_transaction_fails_promptly(sqlite_storage):
    async with sqlite_storage.transaction() as txn:
        with pytest.raises(RuntimeError, match="same task"):
            await asyncio.wait_for(
                asyncio.create_task(txn.create("widgets", {"id": "child"})), timeout=2
            )
        await txn.create("widgets", {"id": "owner"})
    assert await sqlite_storage.list("widgets") == [{"id": "owner"}]
