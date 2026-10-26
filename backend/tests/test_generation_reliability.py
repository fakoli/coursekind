import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from config import Settings
from exceptions import AIServiceException, ConflictException, InsufficientTokensException
from models.ai_generation import (
    GenerateFlashcardsRequest,
    GenerateModuleContentRequest,
    GenerateQuizRequest,
    SuggestModulesRequest,
)
from services.ai_generation_service import AIGenerationService
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderSnapshot


@pytest.fixture(params=["json", "sqlite"])
async def generation(storage, temp_storage_path, request):
    from datetime import datetime, timezone

    if request.param == "sqlite":
        from storage.sqlite_storage import SQLiteStorage

        storage = SQLiteStorage(temp_storage_path + "/generation.db")
    now = datetime.now(timezone.utc).isoformat()
    await storage.create("users", {"id": "u", "token_balance": 100})
    await storage.create(
        "courses",
        {
            "id": "c",
            "title": "Course",
            "description": "Test course",
            "author_id": "u",
            "author_name": "Tester",
            "created_at": now,
            "updated_at": now,
            "ai_enabled": True,
            "difficulty": "beginner",
        },
    )
    await storage.create(
        "modules",
        {
            "id": "m",
            "course_id": "c",
            "title": "Module",
            "order_index": 0,
            "content_markdown": "Example content",
            "created_at": now,
            "updated_at": now,
        },
    )
    yield AIGenerationService(
        storage, Settings(_env_file=None, debug=True, storage_path=temp_storage_path)
    )
    if request.param == "sqlite":
        await storage.close()


async def test_malformed_no_debit_and_bounded_repair(generation, monkeypatch):
    call = AsyncMock(return_value='{"truncated":')
    monkeypatch.setattr(generation, "_call_llm", call)
    with pytest.raises(AIServiceException):
        await generation.suggest_modules("u", SuggestModulesRequest(course_id="c"))
    assert call.await_count == 2
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100
    assert not await generation.storage.list("generation_operations")


async def test_exact_counts_validation_and_repair(generation, monkeypatch):
    call = AsyncMock(side_effect=['[{"front":"Q", "back":""}]', '[{"front":"Q", "back":"A"}]'])
    monkeypatch.setattr(generation, "_call_llm", call)
    result = await generation.generate_flashcards(
        "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1, request_id="cards")
    )
    assert len(result.flashcards) == 1
    assert (await generation.storage.get("users", "u"))["token_balance"] == 92
    replay = await generation.generate_flashcards(
        "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1, request_id="cards")
    )
    assert replay == result
    assert call.await_count == 2
    assert len(await generation.storage.list("token_transactions")) == 1
    with pytest.raises(ConflictException):
        await generation.generate_flashcards(
            "u",
            GenerateFlashcardsRequest(course_id="c", module_id="m", count=2, request_id="cards"),
        )


async def test_quiz_bad_index_never_charged(generation, monkeypatch):
    monkeypatch.setattr(
        generation,
        "_call_llm",
        AsyncMock(
            return_value=json.dumps(
                {"questions": [{"question": "Q", "options": ["A", "B"], "correct_index": 2}]}
            )
        ),
    )
    with pytest.raises(AIServiceException):
        await generation.generate_quiz(
            "u", GenerateQuizRequest(course_id="c", module_id="m", question_count=1)
        )
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100


async def test_content_stages_and_single_commit(generation, monkeypatch):
    monkeypatch.setattr(
        generation,
        "_call_llm",
        AsyncMock(
            side_effect=[
                json.dumps(
                    {"content_markdown": "# Lesson\nUseful explanation", "suggested_visuals": []}
                ),
                json.dumps([{"front": "Q", "back": "A"}]),
                json.dumps(
                    {"questions": [{"question": "Q", "options": ["A", "B"], "correct_index": 0}]}
                ),
            ]
        ),
    )
    result = await generation.generate_module_content(
        "u",
        GenerateModuleContentRequest(
            course_id="c",
            module_title="Title",
            module_prompt="A sufficiently long prompt",
            flashcard_count=1,
            quiz_question_count=1,
        ),
    )
    assert result.tokens_used == 25 and len(result.flashcards) == 1
    assert (await generation.storage.get("users", "u"))["token_balance"] == 75
    assert len(await generation.storage.list("generation_operations")) == 1


async def test_byok_snapshot_inflight_no_credit_debit(generation, monkeypatch):
    snap = AsyncMock(return_value=ProviderSnapshot("openai", "chosen", "user-key"))
    monkeypatch.setattr(AIPreferencesService, "snapshot", snap)

    async def call(*args, **kwargs):
        snap.return_value = ProviderSnapshot("gemini", "different", "another-key")
        return '[{"front":"Q","back":"A"}]'

    monkeypatch.setattr(generation, "_call_llm", call)
    result = await generation.generate_flashcards(
        "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1)
    )
    assert result.tokens_used == 0
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100
    record = (await generation.storage.list("generation_operations"))[0]
    assert record["provider"] == "openai" and record["model"] == "chosen"
    assert (await generation.storage.list("token_transactions"))[0]["amount"] == 0


async def test_concurrent_insufficient_credit_protection(generation, monkeypatch):
    await generation.storage.update("users", "u", {"token_balance": 8})
    ready = asyncio.Event()
    calls = 0

    async def call(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            ready.set()
        await ready.wait()
        return '[{"front":"Q","back":"A"}]'

    monkeypatch.setattr(generation, "_call_llm", call)
    results = await asyncio.gather(
        *(
            generation.generate_flashcards(
                "u",
                GenerateFlashcardsRequest(
                    course_id="c", module_id="m", count=1, request_id=f"run{i}"
                ),
            )
            for i in range(2)
        ),
        return_exceptions=True,
    )
    assert sum(isinstance(r, InsufficientTokensException) for r in results) == 1
    assert (await generation.storage.get("users", "u"))["token_balance"] == 0
    assert len(await generation.storage.list("generation_operations")) == 1


async def test_full_course_failure_keeps_old_modules_and_balance(generation, monkeypatch):
    from models.ai_generation import GenerateFullCourseRequest, ModuleSuggestion
    from services.course_orchestrator import get_course_orchestrator

    orchestrator = get_course_orchestrator(generation.storage, generation.settings)
    monkeypatch.setattr(
        orchestrator.ai_service,
        "_call_llm",
        AsyncMock(side_effect=['{"content_markdown":"Valid lesson"}', "broken", "broken"]),
    )
    request = GenerateFullCourseRequest(
        course_id="c",
        module_suggestions=[
            ModuleSuggestion(
                title="One", description="Detailed description", objectives=["Learn one"]
            ),
            ModuleSuggestion(
                title="Two", description="Detailed description", objectives=["Learn two"]
            ),
        ],
        generate_flashcards=False,
        generate_quiz=False,
        replace_existing=True,
        request_id="full",
    )
    with pytest.raises(AIServiceException):
        await orchestrator.generate_request("u", request)
    assert [m["id"] for m in await generation.storage.list("modules")] == ["m"]
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100


async def test_full_course_atomic_replace_replay_metadata(generation, monkeypatch):
    from models.ai_generation import GenerateFullCourseRequest, ModuleSuggestion
    from services.course_orchestrator import get_course_orchestrator

    orchestrator = get_course_orchestrator(generation.storage, generation.settings)
    monkeypatch.setattr(
        orchestrator.ai_service,
        "_call_llm",
        AsyncMock(return_value='{"content_markdown":"Useful lesson"}'),
    )
    request = GenerateFullCourseRequest(
        course_id="c",
        module_suggestions=[
            ModuleSuggestion(
                title="New", description="Detailed description", objectives=["Learn concept"]
            )
        ],
        generate_flashcards=False,
        generate_quiz=False,
        replace_existing=True,
        request_id="full",
    )
    result = await orchestrator.generate_request("u", request)
    replay = await orchestrator.generate_request("u", request)
    assert replay == result
    modules = await generation.storage.list("modules")
    assert len(modules) == 1 and modules[0]["id"] != "m"
    assert modules[0]["description"] == "Detailed description"
    assert modules[0]["objectives"] == ["Learn concept"]
    assert result.module_statuses[0].module_id == modules[0]["id"]
    assert (await generation.storage.get("users", "u"))["token_balance"] == 75


async def test_cancelled_generation_no_debit(generation, monkeypatch):
    started = asyncio.Event()

    async def call(*args, **kwargs):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(generation, "_call_llm", call)
    task = asyncio.create_task(
        generation.generate_flashcards(
            "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1)
        )
    )
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100
    assert not await generation.storage.list("generation_operations")


async def test_access_revoked_inflight_no_result_or_debit(generation, monkeypatch):
    from exceptions import NotFoundException

    async def call(*args, **kwargs):
        await generation.storage.update(
            "courses", "c", {"author_id": "different-owner", "visibility": "private"}
        )
        return '[{"front":"Q","back":"A"}]'

    monkeypatch.setattr(generation, "_call_llm", call)
    with pytest.raises(NotFoundException):
        await generation.generate_flashcards(
            "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1)
        )
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100
    assert not await generation.storage.list("generation_operations")


async def test_duplicate_concurrent_request_returns_same_result_once(generation, monkeypatch):
    calls = 0

    async def call(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.01)
        return '[{"front":"Q","back":"A"}]'

    monkeypatch.setattr(generation, "_call_llm", call)
    request = GenerateFlashcardsRequest(
        course_id="c", module_id="m", count=1, request_id="duplicate"
    )
    a, b = await asyncio.gather(
        generation.generate_flashcards("u", request), generation.generate_flashcards("u", request)
    )
    assert a == b
    assert calls == 1
    assert (await generation.storage.get("users", "u"))["token_balance"] == 92
    assert len(await generation.storage.list("generation_operations")) == 1


@pytest.mark.parametrize(
    "provider,model",
    [
        ("anvil", "llm.primary"),
        ("openai", "gpt-test"),
        ("gemini", "gemini-test"),
        ("anthropic", "claude-test"),
    ],
)
async def test_all_workflows_route_selected_user_provider(generation, monkeypatch, provider, model):
    import httpx

    from models.ai_preferences import AIPreferencesUpdate
    from services.ai_provider import ProviderClient
    from services.ai_service import (
        AIService,
        ExamplesRequest,
        ExplainRequest,
        HintRequest,
        SimplifyRequest,
    )

    generation.settings.anvil_router_base_url = "https://anvil.test/v1"
    generation.settings.anvil_router_token = "host-only-key"
    calls = []

    def handle(request):
        expected_key = "host-only-key" if provider == "anvil" else "user-only-private-key"
        assert expected_key in str(dict(request.headers))
        if provider != "anvil":
            assert "host-only-key" not in str(dict(request.headers))
        if request.method == "GET":
            body = (
                {
                    "models": [
                        {
                            "name": f"models/{model}",
                            "supportedGenerationMethods": ["generateContent"],
                        }
                    ]
                }
                if provider == "gemini"
                else {"data": [{"id": model}]}
            )
            return httpx.Response(200, json=body)
        body = json.loads(request.content)
        calls.append(request.url.path)
        if provider == "gemini":
            assert model in request.url.path
            system = body["systemInstruction"]["parts"][0]["text"]
        else:
            assert body["model"] == model
            system = (
                body.get("instructions") or body.get("system") or body["messages"][0]["content"]
            )
        if "content_markdown" in system:
            output = {"content_markdown": "A useful lesson"}
        elif '"front"' in system:
            output = [{"front": "Q", "back": "A"}]
        elif '"questions"' in system:
            output = {"questions": [{"question": "Q", "options": ["A", "B"], "correct_index": 0}]}
        elif '"objectives"' in system:
            output = [
                {
                    "title": "Title",
                    "description": "Useful description",
                    "objectives": ["One", "Two"],
                }
            ]
        else:
            output = None
        text = json.dumps(output) if output else "A useful coaching response"
        if provider == "anvil":
            result = {"choices": [{"finish_reason": "stop", "message": {"content": text}}]}
        elif provider == "openai":
            result = {
                "status": "completed",
                "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}],
            }
        elif provider == "anthropic":
            result = {"stop_reason": "end_turn", "content": [{"type": "text", "text": text}]}
        else:
            result = {
                "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": text}]}}]
            }
        return httpx.Response(200, json=result)

    transport = httpx.MockTransport(handle)
    original = ProviderClient.__init__

    def init(self, settings, transport_override=None):
        original(self, settings, transport=transport)

    monkeypatch.setattr(ProviderClient, "__init__", init)
    generation.provider = ProviderClient(generation.settings)
    await AIPreferencesService(generation.storage, generation.settings).update(
        "u",
        AIPreferencesUpdate(
            provider=provider,
            model=model,
            api_key=None if provider == "anvil" else "user-only-private-key",
        ),
    )
    await generation.suggest_modules("u", SuggestModulesRequest(course_id="c", module_count=1))
    await generation.generate_module_content(
        "u",
        GenerateModuleContentRequest(
            course_id="c",
            module_title="Title",
            module_prompt="Detailed lesson content",
            flashcard_count=1,
            quiz_question_count=1,
        ),
    )
    await generation.generate_flashcards(
        "u", GenerateFlashcardsRequest(course_id="c", module_id="m", count=1)
    )
    await generation.generate_quiz(
        "u", GenerateQuizRequest(course_id="c", module_id="m", question_count=1)
    )
    coaching = AIService(generation.storage, generation.settings)
    await coaching.explain("u", ExplainRequest(concept="Concept"))
    await coaching.hint("u", HintRequest(question="Question"))
    await coaching.examples("u", ExamplesRequest(concept="Concept"))
    await coaching.simplify("u", SimplifyRequest(content="Content"))
    assert len(calls) == 10
    assert len(await generation.storage.list("generation_operations")) == 8
    assert (await generation.storage.get("users", "u"))["token_balance"] == (
        30 if provider == "anvil" else 100
    )


async def test_full_course_finalization_failure_rolls_back_everything(generation, monkeypatch):
    from models.ai_generation import GenerateFullCourseRequest, ModuleSuggestion
    from services.course_orchestrator import get_course_orchestrator

    orchestrator = get_course_orchestrator(generation.storage, generation.settings)
    monkeypatch.setattr(
        orchestrator.ai_service,
        "_call_llm",
        AsyncMock(return_value='{"content_markdown":"Useful lesson"}'),
    )
    original = generation.storage.create

    async def fail_ledger(collection, data):
        if collection == "generation_operations":
            raise RuntimeError("Storage unavailable")
        return await original(collection, data)

    monkeypatch.setattr(generation.storage, "create", fail_ledger)
    with pytest.raises(RuntimeError):
        await orchestrator.generate_request(
            "u",
            GenerateFullCourseRequest(
                course_id="c",
                module_suggestions=[
                    ModuleSuggestion(title="New", description="A detailed description")
                ],
                generate_flashcards=False,
                generate_quiz=False,
                replace_existing=True,
            ),
        )
    assert [m["id"] for m in await generation.storage.list("modules")] == ["m"]
    assert not await generation.storage.list("token_transactions")
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100


async def test_insufficient_funds_rejects_before_provider(generation, monkeypatch):
    await generation.storage.update("users", "u", {"token_balance": 0})
    call = AsyncMock()
    monkeypatch.setattr(generation, "_call_llm", call)
    with pytest.raises(InsufficientTokensException):
        await generation.suggest_modules("u", SuggestModulesRequest(course_id="c"))
    call.assert_not_awaited()


async def test_outline_only_save_needs_no_provider_credential(generation, monkeypatch):
    from models.ai_generation import GenerateFullCourseRequest, ModuleSuggestion
    from services.course_orchestrator import get_course_orchestrator

    await generation.storage.create(
        "ai_preferences", {"id": "u", "provider": "openai", "model": "gpt-test", "credentials": {}}
    )
    orchestrator = get_course_orchestrator(generation.storage, generation.settings)
    call = AsyncMock()
    monkeypatch.setattr(orchestrator.ai_service, "_call_llm", call)
    result = await orchestrator.generate_request(
        "u",
        GenerateFullCourseRequest(
            course_id="c",
            module_suggestions=[ModuleSuggestion(title="New", description="Description")],
            generate_content=False,
        ),
    )
    assert result.total_tokens_used == 0
    call.assert_not_awaited()


async def test_subscription_snapshot_zero_debit_replay_and_failed_output(generation, monkeypatch):
    from services.codex_subscription import ProcessBoundary

    generation.settings.codex_subscription_enabled = True
    generation.settings.codex_subscription_user_id = "u"
    generation.settings.codex_subscription_binary = "/synthetic/codex"
    await generation.storage.create(
        "ai_preferences",
        {
            "id": "u",
            "provider": "codex_subscription",
            "model": "gpt-6-luna",
            "credentials": {},
        },
    )
    calls = []
    bad = False

    async def process(argv, **kwargs):
        if "--version" in argv:
            return 0, b"codex-cli 0.162.1"
        if "login" in argv:
            return 0, b"Logged in using ChatGPT"
        calls.append(argv)
        # A concurrent preference change must not alter this operation's routing/accounting.
        await generation.storage.update("ai_preferences", "u", {"provider": "anvil"})
        text = "invalid" if bad else '[{"front":"Q","back":"A"}]'
        return 0, (
            json.dumps(
                {
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": json.dumps({"text": text})},
                }
            )
            + '\n{"type":"turn.completed"}'
        ).encode()

    monkeypatch.setattr(ProcessBoundary, "run", staticmethod(process))
    request = GenerateFlashcardsRequest(course_id="c", module_id="m", count=1, request_id="sub")
    result = await generation.generate_flashcards("u", request)
    assert result.tokens_used == 0
    assert await generation.generate_flashcards("u", request) == result
    assert len(calls) == 1
    ledger = await generation.storage.list("token_transactions")
    assert len(ledger) == 1 and ledger[0]["amount"] == 0
    assert "subscription" in ledger[0]["reason"]
    saved = (await generation.storage.list("generation_operations"))[0]
    assert saved["provider"] == "codex_subscription" and saved["model"] == "gpt-6-luna"
    bad = True
    await generation.storage.update("ai_preferences", "u", {"provider": "codex_subscription"})
    with pytest.raises(AIServiceException):
        await generation.generate_flashcards("u", request.model_copy(update={"request_id": "bad"}))
    assert len(await generation.storage.list("token_transactions")) == 1
    assert (await generation.storage.get("users", "u"))["token_balance"] == 100


async def test_outline_prompt_states_per_module_objective_bounds(generation, monkeypatch):
    async def call(prompt, system_prompt, max_tokens=4096):
        # A single course-level objective must not override per-module requirements.
        count = 2 if "2–4 nonempty learning objectives per module" in prompt else 1
        return json.dumps(
            [
                {
                    "title": "Module",
                    "description": "Description",
                    "objectives": [f"Objective {i}" for i in range(count)],
                }
            ]
        )

    monkeypatch.setattr(generation, "_call_llm", call)
    result = await generation.suggest_modules(
        "u", SuggestModulesRequest(course_id="c", module_count=1)
    )
    assert len(result.suggestions[0].objectives) == 2
