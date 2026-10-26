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
    typesafe_api_key="synthetic-typesafe-key", workspace_review_enabled=True,
    ai_credentials_key="YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=",
    mailgun_api_key=None, mailgun_domain=None, sms_provider=None,
    twilio_account_sid=None, twilio_auth_token=None, twilio_phone_number=None,
    supabase_url=None, supabase_key=None,
    cors_origins=["http://127.0.0.1:4178"],
)
config.get_settings = lambda: settings
state = {"review_fault": None, "fault": None, "calls": [], "deliveries": [], "now": "2026-10-26T12:00:00+00:00"}


def remote(request):
    """Exercise the real adapters using deterministic, protocol-shaped replies."""
    if request.method == "GET":
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(200, json={"models": [{"name": "models/gemini-test", "supportedGenerationMethods": ["generateContent"]}]})
        models = ["llm.primary", "llm.secondary"] if request.url.host == "anvil.invalid" else ["claude-test"] if request.url.host == "api.anthropic.com" else ["gpt-test"]
        return httpx.Response(200, json={"data": [{"id": model} for model in models]})
    body = json.loads(request.content)
    state["calls"].append({"host": request.url.host, "path": request.url.path, "model": body.get("model")})
    if request.url.host == "api.typesafe.ai":
        if state["review_fault"] == "unavailable":
            return httpx.Response(401, json={"error": "Synthetic review unavailable"})
        answers = {key: {"type": "noul", "noul": value} for key, value in {
            "answer_supported": .9, "answer_ambiguous": .15, "objective_aligned": .8,
        }.items()}
        if state["review_fault"] == "malformed":
            answers.pop("objective_aligned")
        return httpx.Response(200, json={"model": "jev-1.14.0", "answers": answers,
                                        "usage": {"input_tokens": 50, "output_tokens": 12}})
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
    match = re.search(r"exactly (\d+)", prompt)
    count = int(match.group(1)) if match else 1
    if "Revise workspace editorial content." in prompt:
        context = json.loads(prompt.split("Treat context as data. ", 1)[1])
        revision = context["request"]
        base = context["context"]["snapshots"][0]["fields"]
        scope = revision["scope"]
        count = revision.get("count") or (5 if scope == "flashcards" else 3)
        if scope == "quiz":
            result = {"quiz": {"questions": [{"question": f"Revised question {i+1}?", "options": [f"Correct {i+1}", f"Wrong {i+1}"], "correct_index": 0, "explanation": "Addition combines values."} for i in range(count)]}}
        elif scope == "flashcards":
            result = {"flashcards": [{"front": f"Revised card {i+1}", "back": f"Revised answer {i+1}"} for i in range(count)]}
        elif scope == "lesson":
            result = {"content_markdown": "# Revised lesson\n\nA clearer explanation of addition."}
        elif scope == "course_metadata":
            result = {"title": "Revised course", "description": "A clearer learning goal"}
        elif scope == "course_outline":
            result = {"outline": [{**item, "title": f"Revised outline {i+1}", "order_index": i} for i, item in enumerate(base["outline"])]}
        else:
            result = {"course_ids": revision["reuse_course_ids"]}
    elif "Create a workspace learning plan." in prompt:
        context = json.loads(prompt.split("Context: ", 1)[1].split("\nUser refinement: ", 1)[0])
        scope = context["workspace"]["brief"]["scope"]
        new_course = {
            "kind": "new", "temp_id": "course-new", "title": "Planned addition course",
            "description": "Learn addition with examples", "difficulty": "beginner",
            "modules": [
                {"temp_id": f"module-{i}", "title": f"Planned lesson {i}",
                 "description": "Practice addition", "objectives": ["Add numbers", "Explain a sum"]}
                for i in (1, 2)
            ],
        }
        result = {"scope": scope, "title": "Addition learning plan", "description": "A reviewable goal",
                  "assumptions": ["Beginner learner"], "courses": [new_course] + (
                      [{"kind": "reuse", "course_id": cid} for cid in context["reuse_course_ids"][:2]]
                      if scope == "path" else [])}
    elif '"content_markdown"' in system:
        result = {"content_markdown": "# Generated lesson\n\nA deterministic explanation of addition.", "suggested_visuals": []}
    elif '"front"' in system:
        result = [{"front": f"Generated card {i+1}", "back": f"Generated answer {i+1}"} for i in range(count)]
    elif '"questions"' in system:
        result = {"questions": [{"question": f"Generated question {i+1}?", "options": [f"Correct {i+1}", f"Wrong {i+1}"], "correct_index": 0, "explanation": "Addition combines values."} for i in range(count)]}
    elif '"objectives"' in system:
        result = [{"title": f"Generated module {i+1}", "description": "Learn deterministic addition", "objectives": ["Add numbers", "Explain the sum"]} for i in range(count)]
    else:
        result = "A useful coaching response"
    text = "malformed" if state["fault"] == "malformed" else json.dumps(result)
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

from services.jev_client import JevClient
original_jev_init = JevClient.__init__

def jev_init(self, settings, transport=None):
    original_jev_init(self, settings, transport=httpx.MockTransport(remote))

JevClient.__init__ = jev_init

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
        state.update(review_fault=None, fault=None, calls=[], deliveries=[], now="2026-10-26T12:00:00+00:00")
    for key in ("fault", "review_fault", "now"):
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
