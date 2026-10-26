"""Non-browser fixture smoke; runs separately to keep fixture imports isolated."""
import asyncio

from httpx import ASGITransport, AsyncClient

from server import app, sandbox, state, settings

async def main():
    assert settings.anvil_model == "llm.primary"
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
        assert len(state["calls"]) == 4
        print("Acceptance server smoke: auth, storage, and all four mocked provider adapters PASS")

try:
    asyncio.run(main())
finally:
    sandbox.cleanup()
