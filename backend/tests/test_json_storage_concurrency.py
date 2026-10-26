"""Regression coverage for process-local JSON persistence and transactions."""

import asyncio
import json
import os
import threading
from pathlib import Path

import pytest

from storage.json_storage import JSONStorage


async def test_concurrent_crud_across_instances_preserves_all_changes(tmp_path):
    first = JSONStorage(str(tmp_path))
    second = JSONStorage(str(tmp_path / "."))
    for index in range(12):
        await first.create("widgets", {"id": f"update-{index}", "value": "old"})
        await first.create("widgets", {"id": f"delete-{index}"})

    await asyncio.gather(
        *(first.create("widgets", {"id": f"new-{index}"}) for index in range(12)),
        *(second.update("widgets", f"update-{index}", {"value": "new"}) for index in range(12)),
        *(second.delete("widgets", f"delete-{index}") for index in range(12)),
    )

    data = json.loads((tmp_path / "widgets.json").read_text())
    assert set(data) == {f"new-{index}" for index in range(12)} | {
        f"update-{index}" for index in range(12)
    }
    assert all(data[f"update-{index}"]["value"] == "new" for index in range(12))


async def test_parallel_batch_creates_preserve_every_document(tmp_path):
    first = JSONStorage(str(tmp_path))
    second = JSONStorage(str(tmp_path))
    first_batch = [{"id": f"first-{index}"} for index in range(20)]
    second_batch = [{"id": f"second-{index}"} for index in range(20)]

    assert await asyncio.gather(
        first.batch_create("widgets", first_batch),
        second.batch_create("widgets", second_batch),
    ) == [first_batch, second_batch]
    assert await first.count("widgets") == 40
    assert len(json.loads((tmp_path / "widgets.json").read_text())) == 40


async def test_batch_create_validates_every_item_before_writing(tmp_path):
    storage = JSONStorage(str(tmp_path))
    await storage.create("widgets", {"id": "original"})

    with pytest.raises(ValueError):
        await storage.batch_create("widgets", [{"id": "new"}, {"value": "missing id"}])

    assert await storage.list("widgets") == [{"id": "original"}]


async def test_batch_delete_propagates_corruption(tmp_path):
    storage = JSONStorage(str(tmp_path))
    path = tmp_path / "widgets.json"
    path.write_text("{broken json")

    with pytest.raises(json.JSONDecodeError):
        await storage.batch_delete("widgets", ["first", "second"])

    assert path.read_text() == "{broken json"


async def test_failed_replacement_transaction_rolls_back_all_collections(tmp_path):
    storage = JSONStorage(str(tmp_path))
    await storage.batch_create("widgets", [{"id": "one"}, {"id": "two"}])
    await storage.create("courses", {"id": "course", "count": 2})

    with pytest.raises(ValueError):
        async with storage.transaction() as txn:
            await txn.batch_delete("widgets", ["one", "two"])
            await txn.create("widgets", {"id": "replacement"})
            await txn.update("courses", "course", {"count": 1})
            await txn.create("widgets", {"value": "missing id"})

    assert await storage.list("widgets") == [{"id": "one"}, {"id": "two"}]
    assert await storage.get("courses", "course") == {"id": "course", "count": 2}


async def test_nested_transaction_rolls_back_to_savepoint_and_outer_commits(tmp_path):
    storage = JSONStorage(str(tmp_path))
    peer = JSONStorage(str(tmp_path))
    await storage.create("widgets", {"id": "one", "value": "original"})

    async with storage.transaction() as txn:
        await txn.update("widgets", "one", {"value": "outer"})
        with pytest.raises(RuntimeError, match="inner failure"):
            async with peer.transaction() as nested:
                await nested.update("widgets", "one", {"value": "inner"})
                await nested.create("new-collection", {"id": "temporary"})
                raise RuntimeError("inner failure")
        assert await txn.get("widgets", "one") == {"id": "one", "value": "outer"}
        assert await txn.list("new-collection") == []
        await txn.create("widgets", {"id": "two"})

    assert await peer.list("widgets") == [{"id": "one", "value": "outer"}, {"id": "two"}]
    assert not (tmp_path / "new-collection.json").exists()


async def test_cancelled_transaction_discards_changes_and_releases_lock(tmp_path):
    storage = JSONStorage(str(tmp_path))
    peer = JSONStorage(str(tmp_path))
    entered = asyncio.Event()

    async def cancelled_writer():
        async with storage.transaction() as txn:
            await txn.create("widgets", {"id": "cancelled"})
            entered.set()
            await asyncio.Event().wait()

    task = asyncio.create_task(cancelled_writer())
    await entered.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    await asyncio.wait_for(peer.create("widgets", {"id": "after"}), timeout=2)
    assert await peer.list("widgets") == [{"id": "after"}]


async def test_other_tasks_wait_for_transaction_and_see_committed_state(tmp_path):
    storage = JSONStorage(str(tmp_path))
    peer = JSONStorage(str(tmp_path))
    entered = asyncio.Event()
    finish = asyncio.Event()

    async def writer():
        async with storage.transaction() as txn:
            await txn.create("widgets", {"id": "one"})
            entered.set()
            await finish.wait()
            await txn.create("widgets", {"id": "two"})

    writer_task = asyncio.create_task(writer())
    await entered.wait()
    reader_task = asyncio.create_task(peer.list("widgets"))
    try:
        await asyncio.sleep(0.02)
        assert not reader_task.done()
    finally:
        finish.set()
        await writer_task
    assert await asyncio.wait_for(reader_task, timeout=2) == [{"id": "one"}, {"id": "two"}]


async def test_raw_readers_never_observe_partial_json(tmp_path):
    storage = JSONStorage(str(tmp_path))
    path = tmp_path / "widgets.json"
    await storage.create("widgets", {"id": "one", "value": "original"})
    stop = threading.Event()
    started = threading.Event()
    errors = []

    def read_disk():
        while not stop.is_set():
            try:
                data = json.loads(path.read_text())
                assert data["one"]["value"]
            except BaseException as error:
                errors.append(error)
            started.set()

    reader = threading.Thread(target=read_disk)
    reader.start()
    assert started.wait(timeout=2)
    try:
        for index in range(20):
            await storage.update("widgets", "one", {"value": f"{index}" * 100_000})
    finally:
        stop.set()
        reader.join(timeout=2)
    assert not reader.is_alive()
    assert errors == []


async def test_corrupted_empty_file_is_not_treated_as_missing(tmp_path):
    storage = JSONStorage(str(tmp_path))
    (tmp_path / "widgets.json").write_text("")

    with pytest.raises(json.JSONDecodeError):
        await storage.create("widgets", {"id": "one"})

    assert (tmp_path / "widgets.json").read_text() == ""


async def test_commit_io_failure_restores_already_replaced_collections(tmp_path, monkeypatch):
    storage = JSONStorage(str(tmp_path))
    await storage.create("first", {"id": "one", "value": "original"})
    await storage.create("second", {"id": "two", "value": "original"})
    original_replace = os.replace
    failed = False

    def fail_second_replace(source, destination):
        nonlocal failed
        if Path(destination).name == "second.json" and not failed:
            failed = True
            raise OSError("simulated disk failure")
        return original_replace(source, destination)

    monkeypatch.setattr("os.replace", fail_second_replace)
    with pytest.raises(OSError, match="simulated disk failure"):
        async with storage.transaction() as txn:
            await txn.update("first", "one", {"value": "changed"})
            await txn.update("second", "two", {"value": "changed"})

    assert await storage.get("first", "one") == {"id": "one", "value": "original"}
    assert await storage.get("second", "two") == {"id": "two", "value": "original"}
    assert sorted(path.name for path in tmp_path.iterdir()) == ["first.json", "second.json"]


async def test_child_task_in_transaction_fails_promptly_without_leaking_changes(tmp_path):
    storage = JSONStorage(str(tmp_path))

    async with storage.transaction() as txn:
        with pytest.raises(RuntimeError, match="same task"):
            await asyncio.wait_for(
                asyncio.create_task(txn.create("widgets", {"id": "child"})), timeout=2
            )
        await txn.create("widgets", {"id": "owner"})

    assert await storage.list("widgets") == [{"id": "owner"}]


async def test_instances_in_different_thread_event_loops_share_lock(tmp_path):
    def write_batch(prefix):
        async def write():
            storage = JSONStorage(str(tmp_path))
            for index in range(15):
                await storage.create("widgets", {"id": f"{prefix}-{index}"})
        asyncio.run(write())

    await asyncio.gather(
        asyncio.to_thread(write_batch, "first"), asyncio.to_thread(write_batch, "second")
    )

    assert await JSONStorage(str(tmp_path)).count("widgets") == 30
