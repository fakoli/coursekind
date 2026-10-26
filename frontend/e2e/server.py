"""Disposable acceptance server. Never imported by the production application.

Real HTTP routes, auth, persistence and service logic. Only remote provider HTTP
and notification delivery are captured. No .env files or ambient service keys.
"""
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

import httpx
import uvicorn
from fastapi import Request

import config

sandbox = tempfile.TemporaryDirectory(prefix="study-buddy-playwright-")
settings = config.Settings(
    _env_file=None, debug=False, jwt_secret="synthetic-acceptance-jwt-secret-32-characters",
    storage_backend="json", storage_path=sandbox.name,
    anvil_router_base_url="https://anvil.invalid/v1", anvil_router_token="synthetic-host-key",
    anvil_model="llm.primary",
    ai_credentials_key="YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
    mailgun_api_key=None, mailgun_domain=None, sms_provider=None,
    twilio_account_sid=None, twilio_auth_token=None, twilio_phone_number=None,
    supabase_url=None, supabase_key=None,
    cors_origins=["http://127.0.0.1:4178"],
    codex_subscription_enabled=False, codex_subscription_user_id=None,
    codex_subscription_binary="/synthetic/codex", codex_subscription_timeout_seconds=30,
    codex_subscription_models=["gpt-6-luna"],
)
config.get_settings = lambda: settings
state = {"fault": None, "calls": [], "deliveries": [], "now": "2026-10-26T12:00:00+00:00"}


def synthetic_text(system, prompt):
    match = re.search(r"exactly (\d+)", prompt)
    count = int(match.group(1)) if match else 1
    if '"content_markdown"' in system:
        result = {"content_markdown": "# Generated lesson\n\nA deterministic explanation of addition.", "suggested_visuals": []}
    elif '"front"' in system:
        result = [{"front": f"Generated card {i+1}", "back": f"Generated answer {i+1}"} for i in range(count)]
    elif '"questions"' in system:
        result = {"questions": [{"question": f"Generated question {i+1}?", "options": [f"Correct {i+1}", f"Wrong {i+1}"], "correct_index": 0, "explanation": "Addition combines values."} for i in range(count)]}
    elif '"objectives"' in system:
        result = [{"title": f"Generated module {i+1}", "description": "Learn deterministic addition", "objectives": ["Add numbers", "Explain the sum"]} for i in range(count)]
    else:
        result = "A useful coaching response"
    return "malformed" if state["fault"] == "malformed" else json.dumps(result)

def remote(request):
    """Exercise the real adapters using deterministic, protocol-shaped replies."""
    if request.method == "GET":
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(200, json={"models": [{"name": "models/gemini-test", "supportedGenerationMethods": ["generateContent"]}]})
        models = ["llm.primary", "llm.secondary"] if request.url.host == "anvil.invalid" else ["claude-test"] if request.url.host == "api.anthropic.com" else ["gpt-test"]
        return httpx.Response(200, json={"data": [{"id": model} for model in models]})
    body = json.loads(request.content)
    state["calls"].append({"host": request.url.host, "path": request.url.path, "model": body.get("model")})
    if state["fault"] == "unavailable":
        return httpx.Response(503, json={"error": "Synthetic provider unavailable"})
    if request.url.host == "generativelanguage.googleapis.com":
        system = body["systemInstruction"]["parts"][0]["text"]
        prompt = body["contents"][0]["parts"][0]["text"]
    elif request.url.host == "api.openai.com":
        system, prompt = body["instructions"], body["input"]
    else:
        system = body.get("system") or body["messages"][0]["content"]
        prompt = body["messages"][-1]["content"]
    text = synthetic_text(system, prompt)
    if request.url.host == "api.openai.com":
        payload = {"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}]}
    elif request.url.host == "generativelanguage.googleapis.com":
        payload = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": text}]}}]}
    elif request.url.host == "api.anthropic.com":
        payload = {"stop_reason": "end_turn", "content": [{"type": "text", "text": text}]}
    else:
        payload = {"choices": [{"finish_reason": "stop", "message": {"content": text}}]}
    return httpx.Response(200, json=payload)


from services.ai_provider import ProviderClient

original_init = ProviderClient.__init__

def provider_init(self, settings, transport=None):
    original_init(self, settings, transport=httpx.MockTransport(remote))

ProviderClient.__init__ = provider_init

# Replace the OS process boundary unconditionally, including before opt-in. No real
# Codex binary, login, or subscription is ever reachable in this acceptance server.
from services.codex_subscription import ProcessBoundary

async def synthetic_codex(self, argv, *, cwd, env, stdin=b"", timeout=20):
    if "--version" in argv:
        return 0, b"codex-cli 0.162.1"
    if "login" in argv:
        return 0, b"Logged in using ChatGPT"
    model = argv[argv.index("--model") + 1]
    state["calls"].append({"host": "codex-subscription.invalid", "model": model})
    if state["fault"] == "unavailable":
        return 1, b""
    prompt = stdin.decode()
    text = "subscription-check-ok" if "Return exactly subscription-check-ok" in prompt else synthetic_text(prompt, prompt)
    events = [{"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps({"text": text})}}, {"type": "turn.completed"}]
    return 0, "\n".join(json.dumps(e) for e in events).encode()

ProcessBoundary.run = synthetic_codex

# No delivery adapter can contact a provider, even if a future route calls send.
from services.notifications.email_service import EmailService
from services.notifications.sms_service import SMSService

async def capture_send(self, *args, **kwargs):
    state["deliveries"].append({"transport": type(self).__name__})
    return True

EmailService.send = capture_send
SMSService.send = capture_send

import services.progress_service as progress

class ControlledDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime.fromisoformat(state["now"]).astimezone(tz or timezone.utc)

progress.datetime = ControlledDateTime

from main import app

@app.post("/__test/control")
async def control(request: Request):
    updates = await request.json()
    if updates.get("reset"):
        state.update(fault=None, calls=[], deliveries=[], now="2026-10-26T12:00:00+00:00")
        settings.codex_subscription_enabled = False
        settings.codex_subscription_user_id = None
    if "codex_user_id" in updates:
        settings.codex_subscription_user_id = updates["codex_user_id"]
        settings.codex_subscription_enabled = bool(updates["codex_user_id"])
    for key in ("fault", "now"):
        if key in updates:
            state[key] = updates[key]
    return state

@app.get("/__test/state")
async def fixture_state():
    return state

if __name__ == "__main__":
    try:
        uvicorn.run(app, host="127.0.0.1", port=8018, log_level="warning")
    finally:
        sandbox.cleanup()
