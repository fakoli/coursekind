import json
from unittest.mock import AsyncMock

import httpx
import pytest
from cryptography.fernet import Fernet

from config import Settings
from exceptions import AIServiceException
from models.ai_preferences import AIPreferencesUpdate
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderClient, ProviderSnapshot


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None,
        debug=True,
        storage_path=str(tmp_path),
        ai_credentials_key=Fernet.generate_key().decode(),
        anvil_router_base_url="https://anvil.test/v1",
        anvil_router_token="host-token",
    )


async def test_isolated_encrypted_masked_replace_delete(storage, settings, monkeypatch):
    monkeypatch.setattr(ProviderClient, "models", AsyncMock(return_value=["text-model"]))
    service = AIPreferencesService(storage, settings)
    assert (await service.get("alice"))["provider"] == "anvil"
    result = await service.update(
        "alice",
        AIPreferencesUpdate(provider="openai", model="text-model", api_key="private-key-1234"),
    )
    assert result["credential_mask"] == "••••1234"
    assert "private-key" not in json.dumps(result)
    assert "private-key" not in json.dumps(await storage.list("ai_preferences"))
    assert (await service.snapshot("alice")).api_key == "private-key-1234"
    assert (await service.get("bob"))["provider"] == "anvil"
    await service.update(
        "alice",
        AIPreferencesUpdate(provider="openai", model="text-model", api_key="replacement-5678"),
    )
    assert (await service.snapshot("alice")).api_key == "replacement-5678"
    await service.delete_credential("alice", "openai")
    assert (await service.get("alice"))["provider"] == "openai"
    with pytest.raises(AIServiceException):
        await service.snapshot("alice")


async def test_invalid_key_or_unavailable_model_preserves_previous(storage, settings, monkeypatch):
    monkeypatch.setattr(ProviderClient, "models", AsyncMock(return_value=["text-model"]))
    service = AIPreferencesService(storage, settings)
    with pytest.raises(AIServiceException):
        await service.update(
            "alice", AIPreferencesUpdate(provider="openai", model="missing", api_key="invalid-key")
        )
    assert (await service.get("alice"))["provider"] == "anvil"
    monkeypatch.setattr(
        ProviderClient, "models", AsyncMock(side_effect=AIServiceException("Rejected"))
    )
    with pytest.raises(AIServiceException):
        await service.update(
            "alice",
            AIPreferencesUpdate(provider="openai", model="text-model", api_key="invalid-key"),
        )
    assert not await storage.list("ai_preferences")


@pytest.mark.parametrize(
    "provider,model,path,response",
    [
        (
            "anvil",
            "llm.primary",
            "/v1/chat/completions",
            {"choices": [{"message": {"content": "hello"}, "finish_reason": "stop"}]},
        ),
        (
            "openai",
            "gpt-test",
            "/v1/responses",
            {
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": "hello"}]}
                ],
            },
        ),
        (
            "anthropic",
            "claude-test",
            "/v1/messages",
            {"stop_reason": "end_turn", "content": [{"type": "text", "text": "hello"}]},
        ),
        (
            "gemini",
            "gemini-test",
            "/v1beta/models/gemini-test:generateContent",
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [{"text": "hidden", "thought": True}, {"text": "hello"}]
                        },
                    }
                ]
            },
        ),
    ],
)
async def test_provider_http_contract(settings, provider, model, path, response):
    def handle(request):
        assert request.url.path == path
        assert "key=" not in str(request.url)
        body = json.loads(request.content)
        if provider == "openai":
            assert body["store"] is False and "temperature" not in body
        if provider != "gemini":
            assert body["model"] == model
        assert "user-key" in str(dict(request.headers))
        return httpx.Response(200, json=response)

    client = ProviderClient(settings, transport=httpx.MockTransport(handle))
    assert (
        await client.complete(
            ProviderSnapshot(provider, model, "user-key"), "prompt", "system", 4096
        )
        == "hello"
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"choices": [{"message": {"content": ""}, "finish_reason": "stop"}]},
        {"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}]},
        {},
    ],
)
async def test_bad_provider_output_is_safe(settings, payload):
    client = ProviderClient(
        settings, transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))
    )
    with pytest.raises(AIServiceException):
        await client.complete(ProviderSnapshot("anvil", "llm.primary", "user-key"), "p", "s", 4096)


async def test_anvil_catalog_excludes_unconfirmed_modalities(settings):
    client = ProviderClient(
        settings,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                json={
                    "data": [
                        {"id": m}
                        for m in (
                            "llm.primary",
                            "llm.secondary",
                            "llm.voice",
                            "vision.general",
                            "embedding",
                        )
                    ]
                },
            )
        ),
    )
    assert await client.models(ProviderSnapshot("anvil", "llm.primary", "host-key")) == [
        "llm.primary",
        "llm.secondary",
    ]


async def test_gemini_pagination_and_capabilities(settings):
    def handler(request):
        if request.url.params.get("pageToken") == "next":
            return httpx.Response(
                200,
                json={
                    "models": [
                        {
                            "name": "models/gemini-text",
                            "supportedGenerationMethods": ["generateContent"],
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "nextPageToken": "next",
                "models": [
                    {"name": "models/embed", "supportedGenerationMethods": ["embedContent"]},
                    {
                        "name": "models/gemini-image",
                        "supportedGenerationMethods": ["generateContent"],
                    },
                ],
            },
        )

    client = ProviderClient(settings, transport=httpx.MockTransport(handler))
    assert await client.models(ProviderSnapshot("gemini", "gemini-text", "user-key")) == [
        "gemini-text"
    ]


async def test_error_bodies_never_leak_credentials(settings):
    client = ProviderClient(
        settings,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(401, text="user-private-key prompt text")
        ),
    )
    with pytest.raises(AIServiceException) as error:
        await client.models(ProviderSnapshot("openai", "gpt-test", "user-private-key"))
    assert "user-private-key" not in str(error.value)


async def test_settings_api_auth_isolation_and_no_raw_keys(
    client, auth_headers, other_user_headers, monkeypatch
):
    monkeypatch.setattr(ProviderClient, "models", AsyncMock(return_value=["gpt-text"]))
    assert (await client.get("/api/v1/auth/ai-preferences")).status_code == 401
    result = await client.put(
        "/api/v1/auth/ai-preferences",
        headers=auth_headers,
        json={"provider": "openai", "model": "gpt-text", "api_key": "private-test-key-1234"},
    )
    assert result.status_code == 200
    assert "private-test-key" not in result.text
    assert (await client.get("/api/v1/auth/ai-preferences", headers=other_user_headers)).json()[
        "provider"
    ] == "anvil"
    removed = await client.delete(
        "/api/v1/auth/ai-preferences/credentials/openai", headers=auth_headers
    )
    assert removed.status_code == 200 and removed.json()["is_configured"] is False


async def test_development_key_persistent_protected_and_production_requires_key(
    storage, tmp_path, monkeypatch
):
    monkeypatch.setattr(ProviderClient, "models", AsyncMock(return_value=["text-model"]))
    settings = Settings(_env_file=None, debug=True, storage_path=str(tmp_path))
    await AIPreferencesService(storage, settings).update(
        "u", AIPreferencesUpdate(provider="openai", model="text-model", api_key="private-test-1234")
    )
    assert (tmp_path / ".ai-credentials.key").stat().st_mode & 0o777 == 0o600
    assert (
        await AIPreferencesService(storage, settings).snapshot("u")
    ).api_key == "private-test-1234"
    production = Settings(
        _env_file=None, debug=False, jwt_secret="test-secure-key", storage_path=str(tmp_path)
    )
    with pytest.raises(AIServiceException, match="AI_CREDENTIALS_KEY"):
        await AIPreferencesService(storage, production).snapshot("u")


async def test_sqlite_file_storage_uses_sibling_development_key(storage, tmp_path, monkeypatch):
    monkeypatch.setattr(ProviderClient, "models", AsyncMock(return_value=["text-model"]))
    database = tmp_path / "study.db"
    database.touch()
    settings = Settings(
        _env_file=None, debug=True, storage_backend="sqlite", storage_path=str(database)
    )
    await AIPreferencesService(storage, settings).update(
        "u", AIPreferencesUpdate(provider="openai", model="text-model", api_key="private-test-key")
    )
    assert (tmp_path / ".ai-credentials.key").is_file()


async def test_truncation_diagnostic_is_specific_without_content_or_key(settings):
    payload = {
        "choices": [
            {"message": {"content": "private learner material"}, "finish_reason": "length"}
        ],
        "usage": {"completion_tokens": 4096},
    }
    client = ProviderClient(
        settings, transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))
    )
    with pytest.raises(AIServiceException) as error:
        await client.complete(
            ProviderSnapshot("anvil", "llm.primary", "private-key"), "p", "s", 4096
        )
    assert error.value.details["reason"] == "incomplete"
    assert error.value.details["max_output_tokens"] == 4096
    assert "private learner material" not in str(error.value)
    assert "private-key" not in str(error.value)
