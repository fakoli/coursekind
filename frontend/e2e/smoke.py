"""Non-browser fixture smoke; runs separately to keep fixture imports isolated."""
import asyncio

from httpx import ASGITransport, AsyncClient

from server import app, sandbox, state, settings

async def main():
    assert settings.anvil_model == "llm.primary"
    assert settings.codex_subscription_enabled is False
    assert settings.codex_subscription_user_id is None
    assert settings.codex_subscription_binary == "/synthetic/codex"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        async def call(method, path, data=None, token=None):
            result = await client.request(method, "/api/v1" + path, json=data,
                                          headers={"Authorization": f"Bearer {token}"} if token else {})
            assert result.is_success, (method, path, result.status_code, result.text)
            return result.json()
        await call("POST", "/auth/register", {"name": "Synthetic", "email": "fixture@example.com", "password": "Synthetic-acceptance-123!"})
        token = (await call("POST", "/auth/login", {"email": "fixture@example.com", "password": "Synthetic-acceptance-123!"}))["access_token"]
        course = await call("POST", "/courses", {"title": "Fixture course", "ai_enabled": True,
                            "instructions": {"purpose": "Teach addition", "target_audience": "Beginners", "learning_objectives": ["Add"]}}, token)
        module = await call("POST", f"/courses/{course['id']}/modules", {"title": "Variables", "content_markdown": "Add numbers", "order_index": 0}, token)
        for provider, model in [("anvil", "llm.primary"), ("openai", "gpt-test"), ("gemini", "gemini-test"), ("anthropic", "claude-test")]:
            await call("PUT", "/auth/ai-preferences", {"provider": provider, "model": model, **({"api_key": "synthetic-key"} if provider != "anvil" else {})}, token)
            result = await call("POST", "/generate/flashcards", {"course_id": course["id"], "module_id": module["id"], "count": 2}, token)
            assert len(result["flashcards"]) == 2
            suggestions = await call("POST", "/generate/suggest-modules", {"course_id": course["id"], "module_count": 3}, token)
            assert len(suggestions["suggestions"]) == 3
            assert all(len(item["objectives"]) == 2 for item in suggestions["suggestions"])
        user = await call("GET", "/auth/me", token=token)
        settings.codex_subscription_enabled = True
        settings.codex_subscription_user_id = user["id"]
        await call("PUT", "/auth/ai-preferences", {"provider":"codex_subscription", "model":"gpt-6-luna"}, token)
        checked = await call("POST", "/auth/ai-preferences/validate", {"provider":"codex_subscription", "model":"gpt-6-luna"}, token)
        assert checked["is_valid"]
        content = await call("POST", "/generate/module-content", {"course_id":course["id"], "module_title":"Subscription", "module_prompt":"Teach addition with useful examples", "flashcard_count":1, "quiz_question_count":1}, token)
        assert content["tokens_used"] == 0 and len(content["flashcards"]) == 1 and len(content["quiz"]["questions"]) == 1
        assert (await call("GET", "/auth/me", token=token))["token_balance"] == user["token_balance"]
        assert len(state["calls"]) == 12
        print("Acceptance server smoke: auth, storage, four mocked HTTP adapters and fake-process subscription inference/content/activities/zero debit PASS")

try:
    asyncio.run(main())
finally:
    sandbox.cleanup()
