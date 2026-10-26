"""JSON persistence for small, single-process deployments."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from contextvars import ContextVar
from copy import deepcopy
from pathlib import Path
from typing import Any, AsyncIterator
from weakref import WeakValueDictionary

from storage.base import StorageBackend


class _DirectoryState:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.owner: asyncio.Task[Any] | None = None
        self.context_owner: ContextVar[asyncio.Task[Any] | None] = ContextVar(
            "json_transaction_owner", default=None
        )
        self.staged: dict[str, dict[str, dict[str, Any]]] = {}
        self.dirty: set[str] = set()


_states: WeakValueDictionary[Path, _DirectoryState] = WeakValueDictionary()
_states_lock = threading.Lock()


class JSONStorage(StorageBackend):
    """JSON storage with process-local isolation and per-file atomic replacement.

    Instances sharing a resolved directory serialize all CRUD and transactions,
    including across threads/event loops. Transaction calls and nested contexts
    must stay in the same asyncio task; child tasks fail promptly. Nested
    transactions are savepoints. Returned documents do not alias staged data.

    Filesystem work is synchronous and intended for small development datasets.
    Independent processes are NOT coordinated: run one writer process or use a
    database backend. Raw filesystem readers see complete old/new files, but a
    multi-collection commit is not atomic for external readers or process crashes.
    Transaction exceptions/cancellation discard staged changes; commit I/O errors
    restore replaced files when the filesystem still permits rollback.
    """

    def __init__(self, storage_path: str):
        self.storage_path = Path(storage_path).resolve()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        with _states_lock:
            state = _states.get(self.storage_path)
            if state is None:
                state = _DirectoryState()
                _states[self.storage_path] = state
            self._state = state

    def _get_collection_path(self, collection: str) -> Path:
        return self.storage_path / f"{collection}.json"

    @asynccontextmanager
    async def _locked(self) -> AsyncIterator[None]:
        task = asyncio.current_task()
        if self._state.owner is task:
            yield
            return
        inherited_owner = self._state.context_owner.get()
        if inherited_owner is not None and self._state.owner is inherited_owner:
            raise RuntimeError("JSON transactions must run in the same task")

        # A nonblocking process lock also works across event loops. Waiting never
        # occupies a worker thread, so cancellation cannot strand an acquisition.
        while not self._state.lock.acquire(blocking=False):
            await asyncio.sleep(0.001)
        try:
            yield
        finally:
            self._state.lock.release()

    async def _read_collection(self, collection: str) -> dict[str, dict[str, Any]]:
        if collection in self._state.staged:
            return deepcopy(self._state.staged[collection])
        path = self._get_collection_path(collection)
        try:
            content = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            data = {}
        else:
            data = json.loads(content)
            if not isinstance(data, dict) or any(
                not isinstance(doc, dict) for doc in data.values()
            ):
                raise ValueError(f"Invalid JSON collection: {collection}")
        if self._state.owner is not None:
            self._state.staged[collection] = deepcopy(data)
        return data

    @staticmethod
    def _serialize(data: Any) -> bytes:
        return json.dumps(data, indent=2, default=str).encode("utf-8")

    @staticmethod
    def _atomic_write(path: Path, content: bytes) -> None:
        temporary: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
            ) as file:
                temporary = Path(file.name)
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    async def _write_collection(
        self, collection: str, data: dict[str, dict[str, Any]]
    ) -> None:
        content = self._serialize(data)
        if self._state.owner is not None:
            # Round-trip before staging validates serializability and detaches
            # caller-owned mutable values, preserving JSON's existing default=str.
            self._state.staged[collection] = json.loads(content)
            self._state.dirty.add(collection)
        else:
            self._atomic_write(self._get_collection_path(collection), content)

    def _commit_transaction(self) -> None:
        writes = {
            self._get_collection_path(collection): self._serialize(self._state.staged[collection])
            for collection in sorted(self._state.dirty)
        }
        originals: dict[Path, bytes | None] = {}
        for path in writes:
            try:
                originals[path] = path.read_bytes()
            except FileNotFoundError:
                originals[path] = None
        replaced: list[Path] = []
        try:
            for path, content in writes.items():
                self._atomic_write(path, content)
                replaced.append(path)
        except BaseException as error:
            rollback_errors = []
            for path in reversed(replaced):
                try:
                    original = originals[path]
                    if original is None:
                        path.unlink(missing_ok=True)
                    else:
                        self._atomic_write(path, original)
                except BaseException as rollback_error:
                    rollback_errors.append(rollback_error)
            if rollback_errors:
                raise BaseExceptionGroup(
                    "JSON commit failed and rollback could not restore every file",
                    [error, *rollback_errors],
                ) from error
            raise

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[JSONStorage]:
        """Stage a same-task transaction; nested contexts provide savepoints."""
        async with self._locked():
            if self._state.owner is not None:
                snapshot = deepcopy(self._state.staged)
                dirty = self._state.dirty.copy()
                try:
                    yield self
                except BaseException:
                    self._state.staged = snapshot
                    self._state.dirty = dirty
                    raise
                return

            self._state.owner = asyncio.current_task()
            token = self._state.context_owner.set(self._state.owner)
            try:
                yield self
                self._commit_transaction()
            finally:
                self._state.staged = {}
                self._state.dirty = set()
                self._state.owner = None
                self._state.context_owner.reset(token)

    @staticmethod
    def _validate_document(data: dict[str, Any]) -> None:
        if not isinstance(data, dict) or "id" not in data:
            raise ValueError("Document must have an 'id' field")
        if not isinstance(data["id"], str):
            raise ValueError("Document 'id' must be a string")

    def _matches_filters(
        self, doc: dict[str, Any], filters: dict[str, Any] | None
    ) -> bool:
        if not filters:
            return True
        for key, value in filters.items():
            if key not in doc or doc[key] != value:
                return False
        return True

    async def get(self, collection: str, id: str) -> dict[str, Any] | None:
        async with self._locked():
            return (await self._read_collection(collection)).get(id)

    async def list(
        self, collection: str, filters: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        async with self._locked():
            data = await self._read_collection(collection)
            return [doc for doc in data.values() if self._matches_filters(doc, filters)]

    async def create(self, collection: str, data: dict[str, Any]) -> dict[str, Any]:
        self._validate_document(data)
        async with self._locked():
            collection_data = await self._read_collection(collection)
            collection_data[data["id"]] = data
            await self._write_collection(collection, collection_data)
            return data

    async def update(
        self, collection: str, id: str, data: dict[str, Any]
    ) -> dict[str, Any] | None:
        async with self._locked():
            collection_data = await self._read_collection(collection)
            if id not in collection_data:
                return None
            updated = {**collection_data[id], **data, "id": id}
            collection_data[id] = updated
            await self._write_collection(collection, collection_data)
            return updated

    async def delete(self, collection: str, id: str) -> bool:
        async with self._locked():
            collection_data = await self._read_collection(collection)
            if id not in collection_data:
                return False
            del collection_data[id]
            await self._write_collection(collection, collection_data)
            return True

    async def count(self, collection: str, filters: dict[str, Any] | None = None) -> int:
        async with self._locked():
            data = await self._read_collection(collection)
            return sum(1 for doc in data.values() if self._matches_filters(doc, filters))

    async def batch_create(
        self, collection: str, items: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        for item in items:
            self._validate_document(item)
        self._serialize(items)
        if not items:
            return []
        async with self._locked():
            data = await self._read_collection(collection)
            data.update((item["id"], item) for item in items)
            await self._write_collection(collection, data)
            return items

    async def batch_delete(self, collection: str, ids: list[str]) -> dict[str, bool]:
        if any(not isinstance(id, str) for id in ids):
            raise ValueError("Document 'id' must be a string")
        if not ids:
            return {}
        async with self._locked():
            data = await self._read_collection(collection)
            results = {id: id in data for id in ids}
            for id in ids:
                data.pop(id, None)
            if any(results.values()):
                await self._write_collection(collection, data)
            return results
