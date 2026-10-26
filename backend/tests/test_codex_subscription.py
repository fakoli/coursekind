"""No real Codex process or subscription is used by this suite."""

import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from config import Settings
from exceptions import AIServiceException
from models.ai_preferences import AIPreferencesUpdate
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderClient, ProviderSnapshot
from services.codex_subscription import CodexSubscription, ProcessBoundary

REAL_BOUNDARY_RUN = ProcessBoundary.run


@pytest.fixture
def settings(tmp_path):
    return Settings(
        _env_file=None,
        debug=True,
        storage_path=str(tmp_path),
        codex_subscription_enabled=True,
        codex_subscription_user_id="owner",
        codex_subscription_binary="/fake/codex",
        codex_subscription_models=["gpt-6-luna"],
    )


class FakeBoundary:
    def __init__(self):
        self.calls = []
        self.auth = b"Logged in using ChatGPT\n"
        self.result = {"text": "hello"}
        self.code = 0
        self.events = None

    async def run(self, argv, *, cwd, env, stdin=b"", rpc=False, timeout=20):
        self.calls.append((argv, cwd, env, stdin, rpc))
        if "--version" in argv:
            return 0, b"codex-cli 0.162.1\n"
        if "login" in argv:
            return 0, self.auth
        events = (
            self.events
            if self.events is not None
            else [
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": json.dumps(self.result)},
                },
                {"type": "turn.completed"},
            ]
        )
        return self.code, b"\n".join(json.dumps(e).encode() for e in events)


@pytest.fixture
def boundary(monkeypatch):
    fake = FakeBoundary()
    monkeypatch.setattr(ProcessBoundary, "run", fake.run)
    return fake


async def test_opt_in_and_account_isolation_never_launch(settings, boundary, storage):
    service = AIPreferencesService(storage, settings)
    assert (await service.get("other"))["codex_subscription_available"] is False
    for user in ("other", ""):
        with pytest.raises(AIServiceException, match="not enabled for this account"):
            await service.catalog(user, "codex_subscription")
    settings.codex_subscription_enabled = False
    with pytest.raises(AIServiceException):
        await service.catalog("owner", "codex_subscription")
    assert not boundary.calls


@pytest.mark.parametrize(
    "auth", [b"Not logged in", b"Logged in using an API key", b"private-secret-error"]
)
async def test_missing_or_wrong_login_is_safe(settings, boundary, auth):
    boundary.auth = auth
    with pytest.raises(AIServiceException, match="ChatGPT sign-in") as error:
        await CodexSubscription(settings).models("owner")
    assert "private-secret" not in str(error.value)
    assert not any("app-server" in c[0] for c in boundary.calls)


async def test_safe_argv_env_model_and_structured_completion(settings, boundary, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "do-not-copy")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "do-not-copy")
    monkeypatch.setenv("CODEX_CONFIG", "do-not-copy")
    client = ProviderClient(settings)
    snapshot = ProviderSnapshot("codex_subscription", "gpt-6-luna", "", user_id="owner")
    assert await client.models(snapshot) == ["gpt-6-luna"]
    assert await client.complete(snapshot, "private prompt", "system") == "hello"
    for argv, cwd, env, stdin, rpc in boundary.calls:
        assert argv[0] == "/fake/codex"
        assert "private prompt" not in argv
        assert not any("KEY" in k or "TOKEN" in k or "CONFIG" in k for k in env)
        assert "my-ai-study-buddy" not in str(cwd)
        if "exec" in argv:
            for flag in (
                "--ignore-user-config",
                "--ignore-rules",
                "--ephemeral",
                "--strict-config",
                "--output-schema",
            ):
                assert flag in argv
            assert "read-only" in argv and 'approval_policy="never"' in argv
            assert "features.shell_tool=false" in argv and "features.plugins=false" in argv
            assert 'forced_login_method="chatgpt"' in argv
            assert b"private prompt" in stdin
        if "login" in argv:
            assert argv == ["/fake/codex", "login", "status"]
        assert "app-server" not in argv
        assert not rpc
    with pytest.raises(AIServiceException, match="unavailable"):
        await client.complete(
            ProviderSnapshot("codex_subscription", "--evil", "", user_id="owner"), "p", "s"
        )


@pytest.mark.parametrize(
    "events,code",
    [
        ([], 0),
        ([{"type": "turn.failed"}], 0),
        (
            [
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": "private bad data"},
                },
                {"type": "turn.completed"},
            ],
            0,
        ),
        (
            [
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": '{"text":"partial"}'},
                },
                {"type": "turn.completed"},
            ],
            1,
        ),
    ],
)
async def test_partial_malformed_nonzero_not_returned(settings, boundary, events, code):
    boundary.events, boundary.code = events, code
    with pytest.raises(AIServiceException) as error:
        await CodexSubscription(settings).complete("owner", "gpt-6-luna", "p", "s", 4096)
    assert "private bad data" not in str(error.value)


async def test_preference_persists_without_credential_and_refuses_key(settings, boundary, storage):
    service = AIPreferencesService(storage, settings)
    assert (await service.get("owner"))["provider"] == "anvil"
    with pytest.raises(AIServiceException, match="API key"):
        await service.update(
            "owner",
            AIPreferencesUpdate(
                provider="codex_subscription", model="gpt-6-luna", api_key="private-secret"
            ),
        )
    assert not boundary.calls
    result = await service.update(
        "owner", AIPreferencesUpdate(provider="codex_subscription", model="gpt-6-luna")
    )
    assert result["accounting"] == "subscription"
    assert result["credentials"] == {} and result["is_configured"]
    assert (await service.snapshot("owner")).user_id == "owner"
    await service.delete_credential("owner", "codex_subscription")
    assert all("logout" not in c[0] for c in boundary.calls)


class HangingStream:
    async def read(self, size):
        await asyncio.Event().wait()


class FakeProcess:
    pid = 123456789
    returncode = None

    def __init__(self, output=None):
        self.stdout = asyncio.StreamReader()
        if output is not None:
            self.stdout.feed_data(output)
            self.stdout.feed_eof()
        self.stderr = HangingStream()
        self.stdin = self
        self.killed = False

    def write(self, data):
        pass

    async def drain(self):
        pass

    def close(self):
        pass

    def kill(self):
        self.killed = True
        self.returncode = -9

    async def wait(self):
        if not self.killed:
            await asyncio.Event().wait()
        return self.returncode


@pytest.mark.parametrize("mode", ["timeout", "cancel", "output"])
async def test_process_cleanup_on_timeout_cancel_and_output_limit(monkeypatch, tmp_path, mode):
    process = FakeProcess(b"x" * 1024 if mode == "output" else None)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=process))
    monkeypatch.setattr("services.codex_subscription.os.killpg", lambda pid, sig: process.kill())
    monkeypatch.setattr(ProcessBoundary, "run", REAL_BOUNDARY_RUN)
    boundary = ProcessBoundary(max_output_bytes=64)
    task = asyncio.create_task(boundary.run(["/fake/codex"], cwd=tmp_path, env={}, timeout=0.02))
    if mode == "cancel":
        await asyncio.sleep(0)
        task.cancel()
    with pytest.raises((AIServiceException, asyncio.CancelledError)):
        await task
    assert process.killed


async def test_unsupported_version_and_missing_binary_are_actionable(settings, monkeypatch):
    monkeypatch.setattr(ProcessBoundary, "run", AsyncMock(return_value=(0, b"codex-cli future")))
    with pytest.raises(AIServiceException, match="qualified version"):
        await CodexSubscription(settings).models("owner")
    monkeypatch.setattr(ProcessBoundary, "run", REAL_BOUNDARY_RUN)
    monkeypatch.setattr(
        asyncio,
        "create_subprocess_exec",
        AsyncMock(side_effect=FileNotFoundError("private/host/path")),
    )
    status = await CodexSubscription(settings).status("owner")
    assert not status["is_connected"] and "missing" in status["message"]
    assert "private/host" not in status["message"]


async def test_api_inference_check_is_explicit_and_account_bound(
    client, auth_headers, other_user_headers, boundary
):
    from config import get_settings

    settings = get_settings()
    user = (await client.get("/api/v1/auth/me", headers=auth_headers)).json()
    settings.codex_subscription_enabled = True
    settings.codex_subscription_user_id = user["id"]
    settings.codex_subscription_binary = "/fake/codex"
    settings.codex_subscription_models = ["gpt-6-luna"]
    url = "/api/v1/auth/ai-preferences"
    assert (await client.get(url, headers=auth_headers)).json()["codex_subscription_available"]
    response = await client.get(
        url + "/models?provider=codex_subscription", headers=other_user_headers
    )
    assert not response.json()["is_available"] and not boundary.calls
    response = await client.get(url + "/models?provider=codex_subscription", headers=auth_headers)
    assert response.json()["models"] == ["gpt-6-luna"]
    assert "Configured candidates only" in response.json()["message"]
    assert not any("exec" in call[0] for call in boundary.calls)
    boundary.result = {"text": "subscription-check-ok"}
    response = await client.post(
        url + "/validate",
        headers=auth_headers,
        json={"provider": "codex_subscription", "model": "gpt-6-luna"},
    )
    assert response.status_code == 200 and "Inference check succeeded" in response.json()["message"]
    assert (await client.get(url, headers=auth_headers)).json()["provider"] == "anvil"
    count = len(boundary.calls)
    response = await client.post(
        url + "/validate",
        headers=other_user_headers,
        json={"provider": "codex_subscription", "model": "gpt-6-luna"},
    )
    assert response.status_code != 200 and len(boundary.calls) == count


async def test_failure_preserves_saved_choice_and_credentials(storage, settings, boundary):
    service = AIPreferencesService(storage, settings)
    await storage.create(
        "ai_preferences",
        {
            "id": "owner",
            "provider": "anvil",
            "model": "llm.primary",
            "credentials": {"openai": {"encrypted": "untouched", "mask": "••••1234"}},
        },
    )
    with pytest.raises(AIServiceException, match="unavailable"):
        await service.update(
            "owner", AIPreferencesUpdate(provider="codex_subscription", model="missing")
        )
    stored = await storage.get("ai_preferences", "owner")
    assert (
        stored["provider"] == "anvil"
        and stored["credentials"]["openai"]["encrypted"] == "untouched"
    )
    await service.update(
        "owner", AIPreferencesUpdate(provider="codex_subscription", model="gpt-6-luna")
    )
    assert (await storage.get("ai_preferences", "owner"))["credentials"] == stored["credentials"]
    settings.codex_subscription_enabled = False
    with pytest.raises(AIServiceException):
        await service.snapshot("owner")
    assert not (await service.get("owner"))["is_configured"]


async def test_process_discards_stderr_and_keeps_complete_stdout(monkeypatch, tmp_path):
    process = FakeProcess(b'{"type":"turn.completed"}\n')
    process.stderr = asyncio.StreamReader()
    process.stderr.feed_data(b"private-provider-diagnostic /private/host/path")
    process.stderr.feed_eof()
    process.returncode = 0
    process.wait = AsyncMock(return_value=0)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=process))
    monkeypatch.setattr(ProcessBoundary, "run", REAL_BOUNDARY_RUN)
    code, output = await ProcessBoundary().run(["/fake/codex", "exec"], cwd=tmp_path, env={})
    assert code == 0 and output == b'{"type":"turn.completed"}\n'
    assert b"private" not in output


async def test_unsupported_platform_fails_before_process(settings, boundary, monkeypatch):
    monkeypatch.setattr("services.codex_subscription.os.name", "nt")
    with pytest.raises(AIServiceException, match="macOS or Linux"):
        await CodexSubscription(settings).models("owner")
    assert not boundary.calls
