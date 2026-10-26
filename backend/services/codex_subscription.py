"""Opt-in, account-bound local ChatGPT subscription through the official Codex CLI.

Never reads authentication files. Only the CLI manages its existing login. A
version gate deliberately fails closed until a new CLI's controls are qualified.
"""

import asyncio
import json
import os
import re
import signal
import tempfile
from pathlib import Path

from exceptions import AIServiceException

SUPPORTED_VERSION = "codex-cli 0.162.1"
DISABLED_FEATURES = (
    "shell_tool",
    "shell_snapshot",
    "apps",
    "plugins",
    "hooks",
    "multi_agent",
    "browser_use",
    "computer_use",
    "image_generation",
    "view_image",
    "workspace_dependencies",
    "skill_search",
    "memories",
    "code_mode_host",
)


class ProcessBoundary:
    """Bound both pipes while running, and reap the process group on every exit."""

    def __init__(self, max_output_bytes=1_048_576):
        self.max_output_bytes = max_output_bytes

    async def run(self, argv, *, cwd, env, stdin=b"", timeout=20):
        process = None
        process_group = None
        tasks = []
        output = []
        size = 0

        async def read(stream, is_stdout):
            nonlocal size
            while chunk := await stream.read(8192):
                size += len(chunk)
                if size > self.max_output_bytes:
                    raise AIServiceException("Codex output exceeded the safe size limit")
                if is_stdout or ("login" in argv and "status" in argv):
                    output.append(chunk)

        def kill():
            # Descendants can outlive an already-exited group leader and keep
            # pipes or background work alive. Always signal the created group.
            if process_group is not None:
                try:
                    os.killpg(process_group, signal.SIGKILL)
                except ProcessLookupError:
                    pass

        try:
            async with asyncio.timeout(timeout):
                process = await asyncio.create_subprocess_exec(
                    *argv,
                    cwd=str(cwd),
                    env=env,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    start_new_session=True,
                )
                process_group = process.pid  # start_new_session makes PID the PGID.
                tasks = [
                    asyncio.create_task(read(process.stdout, True)),
                    asyncio.create_task(read(process.stderr, False)),
                ]
                process.stdin.write(stdin)
                await process.stdin.drain()
                process.stdin.close()
                await asyncio.gather(*tasks)
                code = await process.wait()
                return code, b"".join(output)

        except TimeoutError:
            raise AIServiceException(
                "Codex timed out. Try again or choose another provider."
            ) from None
        except FileNotFoundError:
            raise AIServiceException(
                "Codex CLI is missing. Install the supported CLI and configure its server path."
            ) from None
        except (OSError, ValueError, UnicodeError):
            raise AIServiceException("Codex could not complete a safe local request") from None
        finally:
            kill()
            for task in tasks:
                if not task.done():
                    task.cancel()
            try:
                async with asyncio.timeout(2):
                    if tasks:
                        await asyncio.gather(*tasks, return_exceptions=True)
                    if process is not None:
                        await process.wait()
            except TimeoutError:
                raise AIServiceException("Codex process cleanup exceeded its deadline") from None


class CodexSubscription:
    def __init__(self, settings):
        self.settings = settings
        self.boundary = ProcessBoundary()

    def allowed(self, user_id):
        return bool(
            self.settings.codex_subscription_enabled
            and self.settings.codex_subscription_user_id
            and user_id == self.settings.codex_subscription_user_id
        )

    def authorize(self, user_id):
        if not self.allowed(user_id):
            raise AIServiceException("Codex local subscription is not enabled for this account")
        if os.name != "posix":
            raise AIServiceException("Local Codex requires macOS or Linux process isolation")

    def _env(self):
        # No API keys, proxy overrides, inherited node/python hooks or arbitrary
        # CODEX_* configuration. CODEX_HOME locates the CLI-owned existing login.
        env = {
            key: os.environ[key]
            for key in ("HOME", "USER", "LANG", "TMPDIR", "CODEX_HOME")
            if key in os.environ
        }
        env["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
        return env

    def _controls(self):
        configs = [
            'approval_policy="never"',
            'sandbox_mode="read-only"',
            'model_provider="openai"',
            'forced_login_method="chatgpt"',
            'web_search="disabled"',
            "project_doc_max_bytes=0",
            "apps._default.enabled=false",
            "analytics.enabled=false",
        ]
        configs += [f"features.{name}=false" for name in DISABLED_FEATURES]
        return ["--strict-config"] + [arg for value in configs for arg in ("-c", value)]

    async def _run(self, args, cwd, **kwargs):
        binary = self.settings.codex_subscription_binary
        if not binary or not Path(binary).is_absolute():
            raise AIServiceException("Configure an absolute path to the supported Codex CLI")
        return await self.boundary.run([binary, *args], cwd=cwd, env=self._env(), **kwargs)

    async def _ready(self, user_id, cwd):
        self.authorize(user_id)
        code, output = await self._run(["--version"], cwd)
        if code or output.decode(errors="replace").strip() != SUPPORTED_VERSION:
            raise AIServiceException(
                "Unsupported Codex CLI. This integration requires the qualified version 0.162.1."
            )
        # login status is read-only and does not start an agent or integrations.
        # CLI 0.162.1 rejects --strict-config on login; hardening controls belong
        # to exec, where --ignore-user-config suppresses ambient configuration.
        code, output = await self._run(["login", "status"], cwd)
        if code or output.decode(errors="replace").strip() != "Logged in using ChatGPT":
            raise AIServiceException(
                "Codex ChatGPT sign-in is required. Run codex login on this host using ChatGPT; "
                "API-key-only login is not supported."
            )

    async def status(self, user_id):
        self.authorize(user_id)
        try:
            with tempfile.TemporaryDirectory(prefix="study-buddy-codex-") as cwd:
                await self._ready(user_id, cwd)
            return {"is_connected": True, "message": "Local Codex ChatGPT sign-in detected."}
        except AIServiceException as exc:
            return {"is_connected": False, "message": exc.message}

    async def models(self, user_id):
        self.authorize(user_id)
        with tempfile.TemporaryDirectory(prefix="study-buddy-codex-") as cwd:
            await self._ready(user_id, cwd)
        models = self.settings.codex_subscription_models
        if (
            not models
            or len(models) > 20
            or any(not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}", m) for m in models)
        ):
            raise AIServiceException("Configure valid Codex candidate model IDs on the server")
        # Deliberately operator-configured candidates, not model/list: app-server
        # lacks ignore-user-config and empty MCP overrides do not clear inherited
        # tables. Only exec offers the qualified isolation boundary we require.
        return sorted(set(models))

    async def complete(self, user_id, model, prompt, system_prompt, max_tokens):
        # Recheck the operator gate and CLI-owned auth for every inference.
        if model not in await self.models(user_id):
            raise AIServiceException(
                "Selected Codex model is unavailable; choose a configured candidate"
            )
        with tempfile.TemporaryDirectory(prefix="study-buddy-codex-") as cwd:
            schema = Path(cwd) / "response-schema.json"
            schema.write_text(
                json.dumps(
                    {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                        "required": ["text"],
                        "additionalProperties": False,
                    }
                )
            )
            instruction = (
                "Respond using the required JSON envelope with a single text string. "
                "The text string must contain the complete response to the following task. "
                "Do not use any tools. Never return partial work. "
                f"Aim for at most {max_tokens} output tokens.\n\n{system_prompt}\n\n{prompt}"
            )
            code, output = await self._run(
                [
                    "exec",
                    *self._controls(),
                    "--ignore-user-config",
                    "--ignore-rules",
                    "--ephemeral",
                    "--skip-git-repo-check",
                    "--sandbox",
                    "read-only",
                    "--model",
                    model,
                    "--output-schema",
                    str(schema),
                    "--json",
                    "-",
                ],
                cwd,
                stdin=instruction.encode(),
                timeout=self.settings.codex_subscription_timeout_seconds,
            )
        try:
            if code:
                raise ValueError()
            events = [json.loads(line) for line in output.splitlines() if line.strip()]
            if any(e.get("type") in ("error", "turn.failed") for e in events):
                raise ValueError()
            if sum(e.get("type") == "turn.completed" for e in events) != 1:
                raise ValueError()
            messages = [
                e["item"]["text"]
                for e in events
                if e.get("type") == "item.completed"
                and e.get("item", {}).get("type") == "agent_message"
            ]
            if len(messages) != 1:
                raise ValueError()
            result = json.loads(messages[0])
            text = result["text"]
            if set(result) != {"text"} or not isinstance(text, str) or not text.strip():
                raise ValueError()
            return text.strip()
        except (ValueError, TypeError, KeyError, AttributeError):
            raise AIServiceException(
                "Codex did not return a complete valid response. Check subscription limits or "
                "model access, then retry. No application credits charged."
            ) from None
