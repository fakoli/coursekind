import asyncio
from uuid import uuid4

import pytest
from pydantic import ValidationError

from config import Settings
from exceptions import StudyBuddyException
from models.ai_generation import GeneratedModuleContent
from models.course import CourseCreate
from models.module import ModuleCreate
from models.workspace import WorkspaceCreate
from models.workspace_job import BuildRequest
from models.workspace_plan import PlanRequest
from services.ai_generation_service import AIGenerationService
from services.ai_preferences_service import AIPreferencesService
from services.ai_provider import ProviderSnapshot
from services.course_service import CourseService
from services.generation_operation import active_provider
from services.module_service import ModuleService
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_job_service import WorkspaceJobService
from services.workspace_runner import WorkspaceRunner
from services.workspace_service import WorkspaceService
from tests.test_workspaces import workspace_store as workspace_store


def test_batch_default_and_limit():
    assert BuildRequest(request_id="build", module_ids=["a"]).flashcard_count == 5
    assert BuildRequest(request_id="build", module_ids=["a"]).quiz_question_count == 3
    for ids in [[], ["a", "a"], ["a", "b", "c", "d"]]:
        with pytest.raises(ValidationError):
            BuildRequest(request_id="build", module_ids=ids)


@pytest.fixture
async def setup_job(workspace_store, monkeypatch):
    store = workspace_store
    await store.create("users", {"id": "owner", "name": "Author", "token_balance": 100})
    course = await CourseService(store).create_course(
        "owner", "Author", CourseCreate(title="Course")
    )
    modules = [
        await ModuleService(store).create_module(
            course.id,
            "owner",
            ModuleCreate(
                title=f"Module {i}",
                order_index=i,
                sandbox={"instructions": "Preserve practice"},
                flashcards=[{"front": "Old", "back": "Answer"}],
            ),
        )
        for i in range(3)
    ]
    w = await WorkspaceService(store).create(
        "owner",
        "Author",
        WorkspaceCreate(request_id="create", brief={"goal": "Learn"}, source_course_id=course.id),
    )
    state = {
        "calls": [],
        "fail": None,
        "provider": "anvil",
        "model": "llm.primary",
        "active": 0,
        "max_active": 0,
    }

    async def snapshot(self, user_id):
        return ProviderSnapshot(state["provider"], state["model"], "synthetic-only")

    async def stage(self, user_id, request, **kwargs):
        state["calls"].append(active_provider.get())
        state["active"] += 1
        state["max_active"] = max(state["max_active"], state["active"])
        await asyncio.sleep(0)
        state["active"] -= 1
        if state["fail"] == len(state["calls"]):
            raise RuntimeError("Sensitive provider failure must be scrubbed")
        return GeneratedModuleContent(
            content_markdown="# Draft lesson",
            flashcards=[{"front": "New", "back": "Answer"}],
            tokens_used=0,
        )

    monkeypatch.setattr(AIPreferencesService, "snapshot", snapshot)
    monkeypatch.setattr(AIGenerationService, "stage_content", stage)
    service = WorkspaceJobService(store, Settings(debug=True, _env_file=None))
    yield store, service, w, modules, state
    await service.runner.shutdown()


def build(modules, **kwargs):
    return BuildRequest(
        request_id=str(uuid4()), module_ids=[m.id for m in modules], generate_quiz=False, **kwargs
    )


@pytest.mark.asyncio
async def test_second_step_failure_retains_first_ready_output(setup_job):
    store, service, w, modules, state = setup_job
    state["fail"] = 2
    job = await service.start("owner", w.id, "build", build(modules))
    await service.runner.wait_idle()
    job = await service.get("owner", w.id, job.id)
    assert job.state == "partial"
    assert [s.state for s in job.steps] == ["ready", "failed", "interrupted"]
    assert [s.credits for s in job.steps] == [25, 0, 0]
    assert state["max_active"] == 1
    assert (await store.get("users", "owner"))["token_balance"] == 75
    for m in modules:
        assert (await store.get("modules", m.id))["content_markdown"] == ""
    assert "Sensitive" not in job.model_dump_json()
    assert "synthetic-only" not in job.model_dump_json()
    assert "staged_output" not in job.model_dump_json()


@pytest.mark.asyncio
async def test_receipt_replay_after_response_loss(setup_job):
    store, service, w, modules, state = setup_job
    request = build(modules[:1])
    job = await service.start("owner", w.id, "build", request)
    await service.runner.wait_idle()
    result = await service.start("owner", w.id, "build", request)
    assert result.id == job.id and result.steps[0].output_ref
    assert len(state["calls"]) == 1
    assert (await store.get("users", "owner"))["token_balance"] == 75
    with pytest.raises(StudyBuddyException):
        await service.start(
            "owner", w.id, "build", request.model_copy(update={"module_ids": [modules[1].id]})
        )


@pytest.mark.asyncio
async def test_finalize_failure_retry_reuses_staged_output(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    original = store.create

    async def fail(collection, data):
        if collection == "generation_operations":
            raise RuntimeError("Receipt disk failure")
        return await original(collection, data)

    monkeypatch.setattr(store, "create", fail)
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    failed = await service.get("owner", w.id, job.id)
    assert failed.steps[0].state == "failed"
    assert "finalize" in failed.steps[0].safe_error
    assert (await store.get("users", "owner"))["token_balance"] == 100
    assert not await store.list("workspace_changes")
    monkeypatch.setattr(store, "create", original)
    # A preference change cannot alter original output provenance or debit.
    state.update(provider="openai", model="gpt-test")
    await service.retry("owner", w.id, job.id, "retry", [job.steps[0].id])
    await service.runner.wait_idle()
    ready = await service.get("owner", w.id, job.id)
    assert ready.state == "ready"
    assert len(state["calls"]) == 1
    assert ready.steps[0].credits == 25
    assert (await store.get("users", "owner"))["token_balance"] == 75


@pytest.mark.asyncio
async def test_restart_marks_unfinished_interrupted_without_calls(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    monkeypatch.setattr(service.runner, "submit", lambda *args: None)
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    runner = WorkspaceRunner(store, service.settings)
    assert await runner.recover_interrupted() == 1
    assert not state["calls"]
    interrupted = await service.get("owner", w.id, job.id)
    assert interrupted.state == "interrupted"
    assert "external" in interrupted.steps[0].safe_error
    await service.retry("owner", w.id, job.id, "retry", [job.steps[0].id])
    await runner.wait_idle()
    assert len(state["calls"]) == 1
    assert (await service.get("owner", w.id, job.id)).steps[0].attempt == 2


@pytest.mark.asyncio
async def test_cancel_during_valid_result_stops_next_step(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    started, release = asyncio.Event(), asyncio.Event()
    original = AIGenerationService.stage_content

    async def paused(self, *args, **kwargs):
        started.set()
        await release.wait()
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(AIGenerationService, "stage_content", paused)
    job = await service.start("owner", w.id, "build", build(modules))
    await started.wait()
    await service.cancel("owner", w.id, job.id, "cancel")
    release.set()
    await service.runner.wait_idle()
    result = await service.get("owner", w.id, job.id)
    assert [s.state for s in result.steps] == ["ready", "cancelled", "cancelled"]
    assert len(state["calls"]) == 1
    assert (await store.get("users", "owner"))["token_balance"] == 75
    assert (await store.get("modules", modules[0].id))["content_markdown"] == ""


@pytest.mark.asyncio
async def test_job_provider_snapshot_survives_settings_change(setup_job):
    store, service, w, modules, state = setup_job
    job = await service.start("owner", w.id, "build", build(modules))
    state.update(provider="openai", model="changed")
    await service.runner.wait_idle()
    assert len(state["calls"]) == 3
    assert all(s.provider == "anvil" and s.model == "llm.primary" for s in state["calls"])
    assert (await service.get("owner", w.id, job.id)).state == "ready"


@pytest.mark.asyncio
async def test_insufficient_credit_and_byok_zero_debit(setup_job):
    store, service, w, modules, state = setup_job
    await store.update("users", "owner", {"token_balance": 0})
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    assert (await service.get("owner", w.id, job.id)).state == "failed"
    assert not state["calls"]
    state.update(provider="openai", model="gpt-test")
    await service.retry("owner", w.id, job.id, "retry", [job.steps[0].id])
    await service.runner.wait_idle()
    result = await service.get("owner", w.id, job.id)
    assert result.state == "ready" and result.steps[0].credits == 0
    assert (await store.get("users", "owner"))["token_balance"] == 0


@pytest.mark.asyncio
async def test_explicit_apply_preserves_optional_fields_and_records_history(setup_job):
    store, service, w, modules, state = setup_job
    job = await service.start("owner", w.id, "build", build(modules[:1], generate_flashcards=False))
    await service.runner.wait_idle()
    job = await service.get("owner", w.id, job.id)
    changes = WorkspaceChangeService(store)
    change = await changes.get("owner", w.id, job.steps[0].output_ref)
    assert (await store.get("modules", modules[0].id))["content_markdown"] == ""
    applied = await changes.apply("owner", w.id, change.id, "apply")
    assert applied == await changes.apply("owner", w.id, change.id, "apply")
    saved = await store.get("modules", modules[0].id)
    assert saved["content_markdown"] == "# Draft lesson"
    assert saved["flashcards"][0]["id"] == modules[0].flashcards[0].id
    assert saved["sandbox"]["instructions"] == "Preserve practice"
    revisions = await store.list("workspace_revisions")
    assert len(revisions) == 1
    assert revisions[0]["before"][0]["fields"]["content_markdown"] == ""
    assert revisions[0]["after"][0]["fields"]["content_markdown"] == "# Draft lesson"


@pytest.mark.asyncio
async def test_apply_conflict_does_not_overwrite_manual_edit(setup_job):
    store, service, w, modules, state = setup_job
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    job = await service.get("owner", w.id, job.id)
    await store.update("modules", modules[0].id, {"content_markdown": "Manual edit"})
    with pytest.raises(StudyBuddyException):
        await WorkspaceChangeService(store).apply("owner", w.id, job.steps[0].output_ref, "apply")
    assert not await store.list("workspace_revisions")
    assert (await store.get("modules", modules[0].id))["content_markdown"] == "Manual edit"


@pytest.mark.asyncio
async def test_poll_revocation_denies_saved_output(setup_job):
    store, service, w, modules, state = setup_job
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    ready = await service.get("owner", w.id, job.id)
    await store.update("courses", modules[0].course_id, {"author_id": "new-owner"})
    for call in [
        service.get("owner", w.id, job.id),
        service.list("owner", w.id),
        WorkspaceChangeService(store).get("owner", w.id, ready.steps[0].output_ref),
    ]:
        with pytest.raises(StudyBuddyException):
            await call


@pytest.mark.asyncio
async def test_workspace_reload_discovers_jobs_and_plans_without_client_ids(setup_job, monkeypatch):
    import json

    from tests.test_workspace_plans import plan_data

    store, service, w, modules, state = setup_job

    async def reply(self, *args, **kwargs):
        return json.dumps(plan_data())

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    job = await service.start("owner", w.id, "plan", PlanRequest(request_id="plan"))
    await service.runner.wait_idle()
    from services.workspace_plan_service import WorkspacePlanService

    reloaded = WorkspaceJobService(store, service.settings)
    jobs = await reloaded.list("owner", w.id)
    plans = await WorkspacePlanService(store, service.settings).list("owner", w.id)
    assert jobs[0].id == job.id
    assert jobs[0].steps[0].output_ref == plans[0].id
    assert (await store.get("users", "owner"))["token_balance"] == 90
    with pytest.raises(StudyBuddyException):
        await reloaded.get("unrelated", w.id, job.id)
    with pytest.raises(StudyBuddyException):
        await WorkspacePlanService(store, service.settings).get("unrelated", w.id, plans[0].id)


@pytest.mark.asyncio
async def test_malformed_plan_repairs_once_and_never_charges(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    count = 0

    async def malformed(self, *args, **kwargs):
        nonlocal count
        count += 1
        return '{"scope":"course"'

    monkeypatch.setattr(AIGenerationService, "_call_llm", malformed)
    job = await service.start("owner", w.id, "plan", PlanRequest(request_id="plan"))
    await service.runner.wait_idle()
    assert count == 2
    assert (await service.get("owner", w.id, job.id)).state == "failed"
    assert not await store.list("workspace_plans")
    assert (await store.get("users", "owner"))["token_balance"] == 100


@pytest.mark.asyncio
async def test_generated_cards_get_new_identity_and_apply_rollback(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    ready = await service.get("owner", w.id, job.id)
    changes = WorkspaceChangeService(store)
    change = await changes.get("owner", w.id, ready.steps[0].output_ref)
    assert change.patches[0].fields.flashcards[0].id != modules[0].flashcards[0].id
    create = store.create

    async def fail(collection, data):
        if collection == "workspace_revisions":
            raise RuntimeError("Synthetic history failure")
        return await create(collection, data)

    monkeypatch.setattr(store, "create", fail)
    with pytest.raises(RuntimeError):
        await changes.apply("owner", w.id, change.id, "apply")
    assert (await store.get("modules", modules[0].id))["content_markdown"] == ""
    assert (await changes.get("owner", w.id, change.id)).status == "ready"


@pytest.mark.asyncio
async def test_truncated_plan_repairs_once_without_debit(setup_job, monkeypatch):
    from services.ai_provider import ProviderOutputError

    store, service, w, modules, state = setup_job
    count = 0

    async def truncated(self, *args, **kwargs):
        nonlocal count
        count += 1
        raise ProviderOutputError("anvil", "incomplete", 8192)

    monkeypatch.setattr(AIGenerationService, "_call_llm", truncated)
    job = await service.start("owner", w.id, "plan", PlanRequest(request_id="truncated"))
    await service.runner.wait_idle()
    assert count == 2
    assert (await service.get("owner", w.id, job.id)).state == "failed"
    assert (await store.get("users", "owner"))["token_balance"] == 100


@pytest.mark.asyncio
async def test_http_workspace_loop_lists_outputs_after_reload(
    workspace_store, client, auth_headers, monkeypatch
):
    import json

    from main import app
    from tests.test_workspace_plans import plan_data

    async def snapshot(self, user_id):
        return ProviderSnapshot("anvil", "llm.primary", "synthetic-only")

    async def reply(self, prompt, system, **kwargs):
        if "Create a workspace learning plan." in prompt:
            return json.dumps(plan_data())
        return json.dumps({"content_markdown": "# Ready lesson", "suggested_visuals": []})

    monkeypatch.setattr(AIPreferencesService, "snapshot", snapshot)
    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    async with app.router.lifespan_context(app):
        response = await client.post(
            "/api/v1/workspaces",
            headers=auth_headers,
            json={"request_id": "create-http", "brief": {"goal": "Learn"}},
        )
        assert response.status_code == 200
        url = f"/api/v1/workspaces/{response.json()['id']}"
        response = await client.post(
            url + "/plans", headers=auth_headers, json={"request_id": "plan-http"}
        )
        assert response.status_code == 202, response.text
        await workspace_store.workspace_runner.wait_idle()
        plans = (await client.get(url + "/plans", headers=auth_headers)).json()
        assert len(plans) == 1
        jobs = (await client.get(url + "/jobs", headers=auth_headers)).json()
        assert jobs[0]["steps"][0]["output_ref"] == plans[0]["id"]
        applied = await client.post(
            url + f"/plans/{plans[0]['id']}/apply",
            headers=auth_headers,
            json={"request_id": "apply-http", "expected_proposal_version": 1},
        )
        assert applied.status_code == 200, applied.text
        module_id = applied.json()["applied_ids"]["m0"]
        built = await client.post(
            url + "/build",
            headers=auth_headers,
            json={
                "request_id": "build-http",
                "module_ids": [module_id],
                "generate_flashcards": False,
                "generate_quiz": False,
            },
        )
        assert built.status_code == 202, built.text
        await workspace_store.workspace_runner.wait_idle()
        ready = (await client.get(url + f"/jobs/{built.json()['id']}", headers=auth_headers)).json()
        assert ready["state"] == "ready"
        change_id = ready["steps"][0]["output_ref"]
        assert (await workspace_store.get("modules", module_id))["content_markdown"] == ""
        change = await client.post(
            url + f"/changes/{change_id}/apply",
            headers=auth_headers,
            json={"request_id": "apply-content-http"},
        )
        assert change.status_code == 200, change.text
        assert change.json()["revision_id"]
        assert (await workspace_store.get("modules", module_id))[
            "content_markdown"
        ] == "# Ready lesson"


@pytest.mark.asyncio
async def test_two_jobs_share_one_runner_provider_slot(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    started, release = asyncio.Event(), asyncio.Event()
    original = AIGenerationService.stage_content
    count = 0

    async def blocked(self, *args, **kwargs):
        nonlocal count
        count += 1
        if count == 1:
            started.set()
            await release.wait()
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(AIGenerationService, "stage_content", blocked)
    first = await service.start("owner", w.id, "build", build(modules[:1]))
    await started.wait()
    second = await service.start("owner", w.id, "build", build(modules[1:2]))
    await asyncio.sleep(0)
    assert count == 1
    assert (await service.get("owner", w.id, second.id)).state == "queued"
    release.set()
    await service.runner.wait_idle()
    assert count == 2
    assert all(j.state == "ready" for j in await service.list("owner", w.id))
    assert first.id != second.id


@pytest.mark.asyncio
async def test_finalize_only_retry_needs_no_current_credential(setup_job, monkeypatch):
    store, service, w, modules, state = setup_job
    create = store.create

    async def fail(collection, doc):
        if collection == "generation_operations":
            raise RuntimeError("Receipt unavailable")
        return await create(collection, doc)

    monkeypatch.setattr(store, "create", fail)
    job = await service.start("owner", w.id, "build", build(modules[:1]))
    await service.runner.wait_idle()
    monkeypatch.setattr(store, "create", create)

    async def unavailable(*args):
        raise AssertionError("Finalize must not retrieve credentials")

    monkeypatch.setattr(AIPreferencesService, "snapshot", unavailable)
    await service.retry("owner", w.id, job.id, "finalize", [job.steps[0].id])
    await service.runner.wait_idle()
    assert (await service.get("owner", w.id, job.id)).state == "ready"
    assert len(state["calls"]) == 1
