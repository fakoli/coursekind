"""Durable generation results and exactly-once application-credit accounting."""

import asyncio
import hashlib
import json
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from exceptions import ConflictException, InsufficientTokensException, UnauthorizedException
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderSnapshot

active_provider = ContextVar("generation_provider", default=None)


@dataclass
class _OperationLock:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    users: int = 0


_operation_locks: dict[tuple[str, str, str], _OperationLock] = {}


@asynccontextmanager
async def _single_operation(storage, user_id, request_id):
    path = getattr(storage, "storage_path", getattr(storage, "db_path", None))
    location = str(Path(path).resolve()) if path is not None else str(id(storage))
    key = (location, user_id, request_id)
    entry = _operation_locks.setdefault(key, _OperationLock())
    entry.users += 1
    try:
        async with entry.lock:
            yield
    finally:
        entry.users -= 1
        if entry.users == 0:
            _operation_locks.pop(key, None)


class GenerationOperation:
    def __init__(self, storage, settings):
        self.storage = storage
        self.preferences = AIPreferencesService(storage, settings)

    async def _balance(self, user_id, cost):
        user = await self.storage.get("users", user_id)
        if not user:
            raise UnauthorizedException("User not found")
        balance = user.get("token_balance", 100)
        if balance < cost:
            raise InsufficientTokensException(
                f"Insufficient application credits. Required: {cost}, available: {balance}"
            )
        return balance

    async def run(
        self, user_id, operation, request, cost, response_type, action, access=None, save=None
    ):
        request = request.model_copy(update={"request_id": request.request_id or str(uuid4())})
        # Coalesce concurrent retries without holding the storage transaction over inference.
        async with _single_operation(self.storage, user_id, request.request_id):
            return await self._run(
                user_id, operation, request, cost, response_type, action, access, save
            )

    async def _run(
        self, user_id, operation, request, cost, response_type, action, access=None, save=None
    ):
        payload = request.model_dump(mode="json")
        request_id = payload.pop("request_id", None) or str(uuid4())
        identity = hashlib.sha256(f"{user_id}:{request_id}".encode()).hexdigest()
        digest = hashlib.sha256(
            json.dumps([operation, payload], sort_keys=True).encode()
        ).hexdigest()

        async def replay():
            old = await self.storage.get("generation_operations", identity)
            if old:
                if old["request_hash"] != digest:
                    raise ConflictException(
                        "Generation request ID was already used for different inputs"
                    )
                return response_type.model_validate(old["result"])
            return None

        if access:
            await access()
        old = await replay()
        if old is not None:
            return old
        if cost:
            snapshot = await self.preferences.snapshot(user_id)
        else:
            # Applying supplied outlines performs no inference and needs no key.
            preferences = await self.preferences.get(user_id)
            snapshot = ProviderSnapshot(preferences["provider"], preferences["model"], "")
        charge = cost if snapshot.provider == "anvil" else 0
        await self._balance(user_id, charge)
        context = active_provider.set(snapshot)
        try:
            result = await action()
        finally:
            active_provider.reset(context)
        # Provider calls finished. All transaction work uses this owning task.
        async with self.storage.transaction():
            if access:
                await access()
            old = await replay()
            if old is not None:
                return old
            balance = await self._balance(user_id, charge)
            if save:
                result = await save(result)
            if hasattr(result, "tokens_used"):
                result.tokens_used = charge
            if hasattr(result, "total_tokens_used"):
                result.total_tokens_used = charge
            now = datetime.now(timezone.utc).isoformat()
            if charge:
                await self.storage.update("users", user_id, {"token_balance": balance - charge})
            await self.storage.create(
                "token_transactions",
                {
                    "id": identity,
                    "user_id": user_id,
                    "amount": -charge,
                    "balance_after": balance - charge,
                    "operation": operation,
                    "reason": f"{snapshot.provider}/{snapshot.model}: "
                    + (
                        "local AI usage"
                        if snapshot.provider == "anvil"
                        else "BYOK usage; provider bills user"
                    ),
                    "admin_id": None,
                    "created_at": now,
                },
            )
            await self.storage.create(
                "generation_operations",
                {
                    "id": identity,
                    "user_id": user_id,
                    "request_id": request_id,
                    "request_hash": digest,
                    "operation": operation,
                    "provider": snapshot.provider,
                    "model": snapshot.model,
                    "credits": charge,
                    "created_at": now,
                    "result": result.model_dump(mode="json"),
                },
            )
        return result
