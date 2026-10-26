"""User-scoped encrypted credentials and explicit provider selection."""

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from exceptions import AIServiceException
from services.ai_provider import ProviderClient, ProviderSnapshot
from services.codex_subscription import CodexSubscription


class AIPreferencesService:
    def __init__(self, storage, settings):
        self.storage = storage
        self.settings = settings
        self.client = ProviderClient(settings)

    def _cipher(self):
        key = self.settings.ai_credentials_key
        if not key:
            if not self.settings.debug:
                raise AIServiceException(
                    "AI_CREDENTIALS_KEY must be configured for external provider credentials"
                )
            directory = Path(self.settings.storage_path)
            if self.settings.storage_backend == "sqlite" and directory.suffix == ".db":
                directory = directory.parent
            path = directory / ".ai-credentials.key"
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            except FileExistsError:
                pass
            else:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(Fernet.generate_key())
            if path.stat().st_mode & 0o077:
                raise AIServiceException("Local credential key file must have mode 0600")
            key = path.read_bytes()
        try:
            return Fernet(key)
        except (ValueError, TypeError):
            raise AIServiceException("AI credential encryption key is invalid") from None

    async def _record(self, user_id):
        return await self.storage.get("ai_preferences", user_id) or {
            "id": user_id,
            "provider": "anvil",
            "model": "llm.primary",
            "credentials": {},
        }

    async def get(self, user_id):
        record = await self._record(user_id)
        provider = record["provider"]
        credential = record["credentials"].get(provider)
        configured = (
            bool(self.settings.anvil_router_base_url and self.settings.anvil_router_token)
            if provider == "anvil"
            else bool(credential)
        )
        codex = CodexSubscription(self.settings)
        connection = None
        if provider == "codex_subscription":
            if codex.allowed(user_id):
                connection = await codex.status(user_id)
                configured = connection["is_connected"]
            else:
                configured = False
        return {
            "codex_subscription_available": codex.allowed(user_id),
            "subscription_connection": connection,
            "provider": provider,
            "model": record["model"],
            "is_configured": configured,
            "credential_mask": credential["mask"] if credential else None,
            "credentials": {
                p: {"is_configured": True, "mask": c["mask"]}
                for p, c in record["credentials"].items()
            },
            "accounting": (
                "application_credits"
                if provider == "anvil"
                else "subscription"
                if provider == "codex_subscription"
                else "provider_billed"
            ),
            "automatic_fallback": False,
        }

    async def snapshot(self, user_id, provider=None, api_key=None):
        record = await self._record(user_id)
        provider = provider or record["provider"]
        if provider == "codex_subscription":
            CodexSubscription(self.settings).authorize(user_id)
            if api_key is not None:
                raise AIServiceException("Codex subscription does not accept an API key")
            return ProviderSnapshot(provider, record["model"], "", user_id=user_id)
        if provider == "anvil":
            key = self.settings.anvil_router_token or ""
        elif api_key is not None:
            key = api_key.get_secret_value().strip()
            if len(key) < 8 or len(key) > 4096:
                raise AIServiceException("Enter a valid provider API key")
        else:
            credential = record["credentials"].get(provider)
            if not credential:
                raise AIServiceException("Add a credential for the selected provider in Settings")
            try:
                key = self._cipher().decrypt(credential["encrypted"].encode()).decode()
            except InvalidToken:
                raise AIServiceException(
                    "Credential cannot be decrypted; replace it in Settings"
                ) from None
        return ProviderSnapshot(provider, record["model"], key)

    async def catalog(self, user_id, provider, api_key=None):
        snapshot = await self.snapshot(user_id, provider, api_key)
        return await self.client.models(snapshot)

    async def update(self, user_id, update):
        models = await self.catalog(user_id, update.provider, update.api_key)
        if update.model not in models:
            raise AIServiceException(
                "Selected model is unavailable; choose an advertised text model"
            )
        encrypted = None
        if update.api_key is not None and update.provider != "anvil":
            key = update.api_key.get_secret_value().strip()
            encrypted = {
                "encrypted": self._cipher().encrypt(key.encode()).decode(),
                "mask": "••••" + key[-4:],
            }
        async with self.storage.transaction():
            record = await self._record(user_id)
            if encrypted:
                record["credentials"][update.provider] = encrypted
            record.update(provider=update.provider, model=update.model)
            if await self.storage.get("ai_preferences", user_id):
                await self.storage.update("ai_preferences", user_id, record)
            else:
                await self.storage.create("ai_preferences", record)
        return await self.get(user_id)

    async def delete_credential(self, user_id, provider):
        if provider == "codex_subscription":
            CodexSubscription(self.settings).authorize(user_id)
            # App selection never changes the host CLI login.
            return await self.get(user_id)
        async with self.storage.transaction():
            record = await self.storage.get("ai_preferences", user_id)
            if record:
                record["credentials"].pop(provider, None)
                await self.storage.update("ai_preferences", user_id, record)
        # Preserve selection: removal must never silently switch providers.
        return await self.get(user_id)
