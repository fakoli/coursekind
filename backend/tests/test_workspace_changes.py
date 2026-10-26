"""Editorial isolation and compensating history on both concrete stores."""

import copy
from uuid import uuid4

import pytest
from pydantic import ValidationError

from exceptions import StudyBuddyException
from models.module import ModuleUpdate
from models.workspace_change import ResourcePatch, ResourceTarget
from services.module_service import ModuleService
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_context import WorkspaceContext
from tests.test_workspace_jobs import setup_job as setup_job
from tests.test_workspaces import workspace_store as workspace_store

QUIZ = {
    "questions": [
        {"question": "New?", "options": ["Yes", "No"], "correct_index": 0, "explanation": None}
    ]
}


async def patch_for(store, module, fields):
    target = ResourceTarget(kind="module", resource_id=module.id, course_id=module.course_id)
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    return ResourcePatch(target=target, expected_fingerprint=snapshot.fingerprint, fields=fields)


async def applied_quiz(setup):
    store, _, w, modules, _ = setup
    service = WorkspaceChangeService(store)
    change = await service.prepare(
        "owner", w.id, [await patch_for(store, modules[0], {"quiz": QUIZ})]
    )
    applied = await service.apply("owner", w.id, change.id, str(uuid4()))
    revision = (await service.history("owner", w.id))[0]
    return service, applied, revision


@pytest.mark.asyncio
async def test_quiz_only_revision_preserves_other_fields(setup_job):
    store, _, _, modules, _ = setup_job
    before = await store.get("modules", modules[0].id)
    await applied_quiz(setup_job)
    after = await store.get("modules", modules[0].id)
    assert after["quiz"] == QUIZ
    for field in ("content_markdown", "flashcards", "sandbox", "title", "objectives"):
        assert after[field] == before[field]


@pytest.mark.asyncio
async def test_baseline_manual_edit_conflicts_with_pending_change(setup_job):
    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    change = await service.prepare(
        "owner", w.id, [await patch_for(store, modules[0], {"quiz": QUIZ})]
    )
    await ModuleService(store).update_module(
        modules[0].course_id, modules[0].id, "owner", ModuleUpdate(content_markdown="Manual")
    )
    with pytest.raises(StudyBuddyException) as error:
        await service.apply("owner", w.id, change.id, "apply")
    assert error.value.status_code == 409
    assert (await store.get("modules", modules[0].id))["quiz"] is None
    assert not await store.list("workspace_revisions")


@pytest.mark.asyncio
async def test_two_resource_apply_rolls_back_on_second_conflict(setup_job):
    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    change = await service.prepare(
        "owner", w.id, [await patch_for(store, m, {"quiz": QUIZ}) for m in modules[:2]]
    )
    await ModuleService(store).update_module(
        modules[1].course_id, modules[1].id, "owner", ModuleUpdate(content_markdown="Manual")
    )
    with pytest.raises(StudyBuddyException):
        await service.apply("owner", w.id, change.id, "apply")
    assert (await store.get("modules", modules[0].id))["quiz"] is None
    assert not await store.list("workspace_revisions")


@pytest.mark.asyncio
async def test_restore_conflicts_after_later_edit(setup_job):
    store, _, w, modules, _ = setup_job
    service, _, revision = await applied_quiz(setup_job)
    await ModuleService(store).update_module(
        modules[0].course_id, modules[0].id, "owner", ModuleUpdate(quiz={"questions": []})
    )
    with pytest.raises(StudyBuddyException) as error:
        await service.restore("owner", w.id, revision.id, revision.current_fingerprint, "restore")
    assert error.value.status_code == 409
    assert len(await store.list("workspace_revisions")) == 1


@pytest.mark.asyncio
async def test_restore_preserves_personal_history_and_card_ids(setup_job):
    store, _, w, modules, _ = setup_job
    original = await store.get("modules", modules[0].id)
    service, _, revision = await applied_quiz(setup_job)
    collections = [
        "study_events",
        "quiz_attempts",
        "flashcard_ratings",
        "practice_runs",
        "sharing_grants",
        "token_transactions",
    ]
    for collection in collections:
        await store.create(
            collection,
            {"id": "personal", "module_id": modules[0].id, "user_id": "owner", "value": 7},
        )
    personal = {c: copy.deepcopy(await store.list(c)) for c in collections}
    await service.restore("owner", w.id, revision.id, revision.current_fingerprint, "restore")
    restored = await store.get("modules", modules[0].id)
    assert restored["quiz"] is None
    assert restored["flashcards"] == original["flashcards"]
    assert restored["sandbox"] == original["sandbox"]
    assert {c: await store.list(c) for c in collections} == personal
    history = await service.history("owner", w.id)
    assert len(history) == 2 and history[0].parent_revision_id == revision.id


@pytest.mark.asyncio
async def test_restore_idempotency(setup_job):
    store, _, w, _, state = setup_job
    service, _, revision = await applied_quiz(setup_job)
    result = await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore"
    )
    assert result == await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore"
    )
    assert len(await store.list("workspace_revisions")) == 2
    assert not state["calls"]
    assert (await store.get("users", "owner"))["token_balance"] == 100


@pytest.mark.parametrize("field", ["owner_id", "visibility", "progress", "sandbox"])
@pytest.mark.asyncio
async def test_forbidden_patch_fields_and_foreign_ids_rejected(setup_job, field):
    store, _, _, modules, _ = setup_job
    with pytest.raises(ValidationError):
        await patch_for(store, modules[0], {"quiz": QUIZ, field: {}})


@pytest.fixture
async def path_setup(setup_job):
    from models.learning_path import LearningPathCreate
    from models.workspace import WorkspaceCreate
    from services.course_service import CourseService
    from services.learning_path_service import LearningPathService
    from services.workspace_service import WorkspaceService

    store, _, _, modules, _ = setup_job
    path = await LearningPathService(store, CourseService(store)).create_path(
        "owner", LearningPathCreate(title="Path", course_ids=[modules[0].course_id])
    )
    w = await WorkspaceService(store).create(
        "owner",
        "Author",
        WorkspaceCreate(
            request_id="path-workspace",
            brief={"goal": "Path", "scope": "path"},
            source_path_id=path.id,
        ),
    )
    return w, path


@pytest.mark.asyncio
async def test_path_reference_remove_restore_never_deletes_course(setup_job, path_setup):
    from models.workspace_change import ManualChangeRequest

    store, _, _, modules, _ = setup_job
    w, path = path_setup
    service = WorkspaceChangeService(store)
    target = ResourceTarget(kind="path", resource_id=path.id)
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    course = copy.deepcopy(await store.get("courses", modules[0].course_id))
    await store.create("study_events", {"id": "event", "module_id": modules[0].id})
    change = await service.manual(
        "owner",
        w.id,
        ManualChangeRequest(
            request_id="manual-path",
            patches=[
                ResourcePatch(
                    target=target,
                    expected_fingerprint=snapshot.fingerprint,
                    fields={"course_ids": []},
                )
            ],
        ),
    )
    await service.apply("owner", w.id, change.id, "apply-path")
    assert (await store.get("learning_paths", path.id))["course_ids"] == []
    revision = (await service.history("owner", w.id))[0]
    await service.restore("owner", w.id, revision.id, revision.current_fingerprint, "restore-path")
    assert (await store.get("learning_paths", path.id))["course_ids"] == [modules[0].course_id]
    assert await store.get("courses", modules[0].course_id) == course
    assert await store.get("modules", modules[0].id)
    assert await store.get("study_events", "event")
    assert (await store.get("users", "owner"))["token_balance"] == 100
    assert not await store.list("generation_operations")


@pytest.mark.asyncio
async def test_manual_path_reference_change_costs_zero(setup_job, path_setup):
    await test_path_reference_remove_restore_never_deletes_course(setup_job, path_setup)


@pytest.mark.asyncio
async def test_path_revision_rejects_model_invented_course_ids(setup_job, path_setup, monkeypatch):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, _, modules, _ = setup_job
    w, path = path_setup
    calls = []

    async def reply(*args, **kwargs):
        calls.append(1)
        return json.dumps({"course_ids": [modules[0].course_id]})

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    # Even an accessible existing member must be explicitly selected for resulting membership.
    job = await jobs.start(
        "owner",
        w.id,
        "revision",
        RevisionRequest(
            request_id="path-ai",
            target=ResourceTarget(kind="path", resource_id=path.id),
            scope="path_references",
            instruction="Remove courses",
            reuse_course_ids=[],
        ),
    )
    await jobs.runner.wait_idle()
    assert (await jobs.get("owner", w.id, job.id)).state == "failed"
    assert len(calls) == 2
    assert (await store.get("users", "owner"))["token_balance"] == 100
    assert not await store.list("workspace_changes")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "scope,cost,fields,count",
    [
        ("lesson", 25, {"content_markdown": "Lesson"}, None),
        ("quiz", 10, {"quiz": QUIZ}, 1),
        ("flashcards", 8, {"flashcards": [{"front": "New", "back": "Card"}]}, 1),
    ],
)
async def test_scoped_job_costs_and_no_live_mutation(
    setup_job, monkeypatch, scope, cost, fields, count
):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, w, modules, _ = setup_job
    original = await store.get("modules", modules[0].id)

    async def reply(*args, **kwargs):
        return json.dumps(fields)

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    request = RevisionRequest(
        request_id="scoped-job",
        target=ResourceTarget(
            kind="module", resource_id=modules[0].id, course_id=modules[0].course_id
        ),
        scope=scope,
        instruction="Refine",
        count=count,
    )
    job = await jobs.start("owner", w.id, "revision", request)
    await jobs.runner.wait_idle()
    result = await jobs.get("owner", w.id, job.id)
    assert result.state == "ready"
    assert result.steps[0].credits == cost
    assert await store.get("modules", modules[0].id) == original
    change = await WorkspaceChangeService(store).get("owner", w.id, result.steps[0].output_ref)
    assert set(change.patches[0].fields.model_fields_set) == set(fields)
    await WorkspaceChangeService(store).apply("owner", w.id, change.id, "apply-ai")
    revision = (await WorkspaceChangeService(store).history("owner", w.id))[0]
    await WorkspaceChangeService(store).restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore-ai"
    )
    restored = await store.get("modules", modules[0].id)
    for key in ("content_markdown", "flashcards", "quiz", "sandbox"):
        assert restored[key] == original[key]


@pytest.mark.asyncio
async def test_revision_finalize_failure_retry_reuses_output(setup_job, monkeypatch):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, w, modules, _ = setup_job
    calls = []

    async def reply(*args, **kwargs):
        calls.append(1)
        return json.dumps({"quiz": QUIZ})

    create = store.create

    async def fail(collection, data):
        if collection == "generation_operations":
            raise RuntimeError("disk failure")
        return await create(collection, data)

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    monkeypatch.setattr(store, "create", fail)
    job = await jobs.start(
        "owner",
        w.id,
        "revision",
        RevisionRequest(
            request_id="retry-revision",
            target=ResourceTarget(
                kind="module", resource_id=modules[0].id, course_id=modules[0].course_id
            ),
            scope="quiz",
            instruction="Improve",
            count=1,
        ),
    )
    await jobs.runner.wait_idle()
    assert not await store.list("workspace_changes")
    assert (await store.get("users", "owner"))["token_balance"] == 100
    monkeypatch.setattr(store, "create", create)
    await jobs.retry("owner", w.id, job.id, "retry-ready", [job.steps[0].id])
    await jobs.runner.wait_idle()
    assert (await jobs.get("owner", w.id, job.id)).state == "ready"
    assert len(calls) == 1
    assert (await store.get("users", "owner"))["token_balance"] == 90


@pytest.mark.asyncio
async def test_restore_ignores_unrelated_editorial_edit_but_not_touched_edit(setup_job):
    store, _, w, modules, _ = setup_job
    service, _, revision = await applied_quiz(setup_job)
    await ModuleService(store).update_module(
        modules[0].course_id,
        modules[0].id,
        "owner",
        ModuleUpdate(content_markdown="Keep manual lesson"),
    )
    await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore-unrelated"
    )
    assert (await store.get("modules", modules[0].id))["content_markdown"] == "Keep manual lesson"


@pytest.mark.asyncio
async def test_history_and_restore_require_current_access(setup_job):
    store, _, w, modules, _ = setup_job
    service, _, revision = await applied_quiz(setup_job)
    await store.update("courses", modules[0].course_id, {"author_id": "other"})
    for call in [
        service.history("owner", w.id),
        service.restore("owner", w.id, revision.id, revision.current_fingerprint, "denied"),
    ]:
        with pytest.raises(StudyBuddyException):
            await call


@pytest.mark.asyncio
async def test_history_write_failure_rolls_back_all_resources(setup_job, monkeypatch):
    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    change = await service.prepare(
        "owner", w.id, [await patch_for(store, m, {"quiz": QUIZ}) for m in modules[:2]]
    )
    create = store.create

    async def fail(collection, data):
        if collection == "workspace_revisions":
            raise RuntimeError("history failure")
        return await create(collection, data)

    monkeypatch.setattr(store, "create", fail)
    with pytest.raises(RuntimeError):
        await service.apply("owner", w.id, change.id, "atomic")
    for m in modules[:2]:
        assert (await store.get("modules", m.id))["quiz"] is None
    assert (await service.get("owner", w.id, change.id)).status == "ready"
    assert not await store.list("workspace_revisions")


@pytest.mark.asyncio
async def test_course_outline_retains_exact_ids_and_restores_objectives(setup_job):
    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    target = ResourceTarget(kind="course", resource_id=modules[0].course_id)
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    outline = [
        {**item, "title": f"Revised {i}", "objectives": ["New objective"], "order_index": i}
        for i, item in enumerate(reversed(snapshot.fields["outline"]))
    ]
    change = await service.prepare(
        "owner",
        w.id,
        [
            ResourcePatch(
                target=target,
                expected_fingerprint=snapshot.fingerprint,
                fields={"outline": outline},
            )
        ],
    )
    await service.apply("owner", w.id, change.id, "outline")
    current = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    assert current.fields["module_ids"] == [m.id for m in reversed(modules)]
    assert current.fields["outline"][0]["objectives"] == ["New objective"]
    revision = (await service.history("owner", w.id))[0]
    await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore-outline"
    )
    assert (
        await WorkspaceContext(store).snapshot("owner", target, editable=True)
    ).fields == snapshot.fields
    with pytest.raises(StudyBuddyException):
        await service.prepare(
            "owner",
            w.id,
            [
                ResourcePatch(
                    target=target,
                    expected_fingerprint=snapshot.fingerprint,
                    fields={"outline": outline[:1]},
                )
            ],
        )


@pytest.mark.asyncio
async def test_foreign_private_path_reference_rejected_and_selected_source_revocation(
    setup_job, path_setup
):
    from models.course import CourseCreate
    from models.workspace_change import RevisionRequest
    from services.course_service import CourseService

    store, jobs, _, _, _ = setup_job
    w, path = path_setup
    foreign = await CourseService(store).create_course(
        "other", "Other", CourseCreate(title="Secret")
    )
    target = ResourceTarget(kind="path", resource_id=path.id)
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    with pytest.raises(StudyBuddyException):
        await WorkspaceChangeService(store).prepare(
            "owner",
            w.id,
            [
                ResourcePatch(
                    target=target,
                    expected_fingerprint=snapshot.fingerprint,
                    fields={"course_ids": [foreign.id]},
                )
            ],
        )
    with pytest.raises(StudyBuddyException):
        await jobs.start(
            "owner",
            w.id,
            "revision",
            RevisionRequest(
                request_id="private-source",
                target=target,
                scope="path_references",
                instruction="Reuse",
                reuse_course_ids=[foreign.id],
            ),
        )
    await store.update("courses", foreign.id, {"visibility": "public"})
    change = await WorkspaceChangeService(store).prepare(
        "owner",
        w.id,
        [
            ResourcePatch(
                target=target,
                expected_fingerprint=snapshot.fingerprint,
                fields={"course_ids": [foreign.id]},
            )
        ],
    )
    await store.update("courses", foreign.id, {"visibility": "private"})
    with pytest.raises(StudyBuddyException):
        await WorkspaceChangeService(store).get("owner", w.id, change.id)
    with pytest.raises(StudyBuddyException):
        await WorkspaceChangeService(store).apply("owner", w.id, change.id, "revoked")


@pytest.mark.parametrize(
    "fields",
    [
        {"quiz": {"questions": [], "owner_id": "bad"}},
        {
            "quiz": {
                "questions": [
                    {"question": "Q", "options": ["a", "b"], "correct_index": 0, "sandbox": {}}
                ]
            }
        },
        {"flashcards": [{"front": "a", "back": "b", "rating": 5}]},
    ],
)
def test_nested_forbidden_fields_are_not_silently_dropped(fields):
    with pytest.raises(ValidationError):
        ResourcePatch(
            target=ResourceTarget(kind="module", course_id="c", resource_id="m"),
            expected_fingerprint="x",
            fields=fields,
        )


@pytest.mark.asyncio
async def test_manual_replay_and_restore_response_loss_preserve_immutable_history(setup_job):
    from models.workspace_change import ManualChangeRequest

    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    request = ManualChangeRequest(
        request_id="manual-replay", patches=[await patch_for(store, modules[0], {"quiz": QUIZ})]
    )
    change = await service.manual("owner", w.id, request)
    assert (await service.manual("owner", w.id, request)).id == change.id
    await service.apply("owner", w.id, change.id, "apply-manual")
    original = copy.deepcopy(await store.list("workspace_revisions"))
    revision = (await service.history("owner", w.id))[0]
    result = await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore-loss"
    )
    assert (
        await service.restore(
            "owner", w.id, revision.id, revision.current_fingerprint, "restore-loss"
        )
    ).id == result.id
    assert await store.get("workspace_revisions", original[0]["id"]) == original[0]
    with pytest.raises(StudyBuddyException):
        await service.restore("owner", w.id, revision.id, "other-fingerprint", "restore-loss")


@pytest.mark.asyncio
async def test_http_manual_change_history_restore_and_snapshot(
    workspace_store, client, auth_headers
):
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Course"})
    ).json()
    module = (
        await client.post(
            f"/api/v1/courses/{course['id']}/modules",
            headers=auth_headers,
            json={"title": "Lesson", "order_index": 0},
        )
    ).json()
    w = (
        await client.post(
            "/api/v1/workspaces",
            headers=auth_headers,
            json={
                "request_id": "http-create",
                "brief": {"goal": "Learn"},
                "source_course_id": course["id"],
            },
        )
    ).json()
    base = f"/api/v1/workspaces/{w['id']}"
    target = ResourceTarget(kind="module", resource_id=module["id"], course_id=course["id"])
    snapshot = await WorkspaceContext(workspace_store).snapshot(
        w["owner_id"], target, editable=True
    )
    response = await client.post(
        base + "/changes",
        headers=auth_headers,
        json={
            "request_id": "http-change",
            "patches": [
                {
                    "target": target.model_dump(),
                    "expected_fingerprint": snapshot.fingerprint,
                    "fields": {"quiz": QUIZ},
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    change = response.json()
    assert (
        await client.post(
            base + f"/changes/{change['id']}/apply",
            headers=auth_headers,
            json={"request_id": "http-apply"},
        )
    ).status_code == 200
    revision = (await client.get(base + "/history", headers=auth_headers)).json()[0]
    response = await client.post(
        base + f"/history/{revision['id']}/restore",
        headers=auth_headers,
        json={
            "request_id": "http-restore",
            "expected_current_fingerprint": revision["current_fingerprint"],
        },
    )
    assert response.status_code == 200, response.text
    assert (await workspace_store.get("modules", module["id"]))["quiz"] is None
    assert (await client.get(base + "/snapshots", headers=auth_headers)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["course_metadata", "course_outline", "path_references"])
async def test_planning_revision_scopes_cost_ten_and_byok_zero(
    setup_job, path_setup, monkeypatch, scope
):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, course_workspace, modules, state = setup_job
    path_workspace, path = path_setup
    w = path_workspace if scope == "path_references" else course_workspace
    target = (
        ResourceTarget(kind="path", resource_id=path.id)
        if scope == "path_references"
        else ResourceTarget(kind="course", resource_id=modules[0].course_id)
    )
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    fields = (
        {"title": "Revised course"}
        if scope == "course_metadata"
        else {"outline": snapshot.fields["outline"]}
        if scope == "course_outline"
        else {"course_ids": snapshot.fields["course_ids"]}
    )

    async def reply(*args, **kwargs):
        return json.dumps(fields)

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    for provider, cost in [("anvil", 10), ("openai", 0)]:
        state["provider"] = provider
        request = RevisionRequest(
            request_id=str(uuid4()),
            target=target,
            scope=scope,
            instruction="Refine",
            reuse_course_ids=[modules[0].course_id] if scope == "path_references" else [],
        )
        job = await jobs.start("owner", w.id, "revision", request)
        await jobs.runner.wait_idle()
        ready = await jobs.get("owner", w.id, job.id)
        assert ready.state == "ready"
        assert ready.steps[0].credits == cost
    assert (await store.get("users", "owner"))["token_balance"] == 90


@pytest.mark.asyncio
async def test_wrong_scope_model_output_repairs_once_without_charge(setup_job, monkeypatch):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, w, modules, _ = setup_job
    calls = []

    async def reply(*args, **kwargs):
        calls.append(1)
        return json.dumps({"quiz": QUIZ, "content_markdown": "Unexpected lesson rewrite"})

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    job = await jobs.start(
        "owner",
        w.id,
        "revision",
        RevisionRequest(
            request_id="wrong-scope",
            target=ResourceTarget(
                kind="module", course_id=modules[0].course_id, resource_id=modules[0].id
            ),
            scope="quiz",
            instruction="Quiz only",
            count=1,
        ),
    )
    await jobs.runner.wait_idle()
    assert (await jobs.get("owner", w.id, job.id)).state == "failed"
    assert len(calls) == 2
    assert (await store.get("users", "owner"))["token_balance"] == 100
    assert not await store.list("workspace_changes")


@pytest.mark.asyncio
async def test_restore_write_failure_rolls_back_proposal_content_and_history(
    setup_job, monkeypatch
):
    store, _, w, modules, _ = setup_job
    service, _, revision = await applied_quiz(setup_job)
    old_changes = copy.deepcopy(await store.list("workspace_changes"))
    old_history = copy.deepcopy(await store.list("workspace_revisions"))
    create = store.create

    async def fail(collection, data):
        if collection == "workspace_revisions":
            raise RuntimeError("history unavailable")
        return await create(collection, data)

    monkeypatch.setattr(store, "create", fail)
    with pytest.raises(RuntimeError):
        await service.restore(
            "owner", w.id, revision.id, revision.current_fingerprint, "failed-restore"
        )
    assert await store.list("workspace_changes") == old_changes
    assert await store.list("workspace_revisions") == old_history
    assert (await store.get("modules", modules[0].id))["quiz"] == QUIZ


@pytest.mark.asyncio
async def test_manual_drafts_are_discoverable_after_reload(setup_job):
    from models.workspace_change import ManualChangeRequest

    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    change = await service.manual(
        "owner",
        w.id,
        ManualChangeRequest(
            request_id="persisted-manual",
            patches=[await patch_for(store, modules[0], {"quiz": QUIZ})],
        ),
    )
    reloaded = WorkspaceChangeService(store)
    assert (await reloaded.list_changes("owner", w.id))[0].id == change.id
    with pytest.raises(StudyBuddyException):
        await reloaded.list_changes("foreign", w.id)


@pytest.mark.asyncio
async def test_original_module_http_editor_conflicts_with_workspace_proposal(
    workspace_store, client, auth_headers
):
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Course"})
    ).json()
    url = f"/api/v1/courses/{course['id']}/modules"
    module = (
        await client.post(url, headers=auth_headers, json={"title": "Lesson", "order_index": 0})
    ).json()
    w = (
        await client.post(
            "/api/v1/workspaces",
            headers=auth_headers,
            json={
                "request_id": "create-conflict",
                "brief": {"goal": "Learn"},
                "source_course_id": course["id"],
            },
        )
    ).json()
    target = ResourceTarget(kind="module", resource_id=module["id"], course_id=course["id"])
    snapshot = await WorkspaceContext(workspace_store).snapshot(
        w["owner_id"], target, editable=True
    )
    base = f"/api/v1/workspaces/{w['id']}"
    change = (
        await client.post(
            base + "/changes",
            headers=auth_headers,
            json={
                "request_id": "draft-conflict",
                "patches": [
                    {
                        "target": target.model_dump(),
                        "expected_fingerprint": snapshot.fingerprint,
                        "fields": {"quiz": QUIZ},
                    }
                ],
            },
        )
    ).json()
    response = await client.put(
        url + f"/{module['id']}",
        headers=auth_headers,
        json={"content_markdown": "Baseline editor saves this"},
    )
    assert response.status_code == 200, response.text
    response = await client.post(
        base + f"/changes/{change['id']}/apply",
        headers=auth_headers,
        json={"request_id": "apply-conflict"},
    )
    assert response.status_code == 409, response.text
    assert (await workspace_store.get("modules", module["id"]))[
        "content_markdown"
    ] == "Baseline editor saves this"
    assert not await workspace_store.list("workspace_revisions")


@pytest.mark.asyncio
async def test_preexisting_task2_draft_null_activities_remain_omitted(setup_job):
    store, _, w, modules, _ = setup_job
    service = WorkspaceChangeService(store)
    original = await store.get("modules", modules[0].id)
    patch = await patch_for(store, modules[0], {"content_markdown": "Legacy saved draft"})
    # Exact shape written before scoped revisions existed, not a new action request.
    await store.create(
        "workspace_changes",
        {
            "id": "legacy-draft",
            "workspace_id": w.id,
            "owner_id": "owner",
            "patches": [
                {
                    **patch.model_dump(mode="json"),
                    "fields": {
                        "content_markdown": "Legacy saved draft",
                        "flashcards": None,
                        "quiz": None,
                    },
                }
            ],
            "base_snapshots": [
                (
                    await WorkspaceContext(store).snapshot("owner", patch.target, editable=True)
                ).model_dump(mode="json")
            ],
            "status": "ready",
            "origin_job_id": None,
            "revision_id": None,
            "created_at": "2026-10-26T00:00:00+00:00",
        },
    )
    await service.apply("owner", w.id, "legacy-draft", "legacy-apply")
    assert (await service.get("owner", w.id, "legacy-draft")).status == "applied"
    current = await store.get("modules", modules[0].id)
    assert current["content_markdown"] == "Legacy saved draft"
    assert current["flashcards"] == original["flashcards"]
    assert current["quiz"] == original["quiz"]
    revision = (await service.history("owner", w.id))[0]
    await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "legacy-restore"
    )
    assert (await store.get("modules", modules[0].id))["content_markdown"] == original[
        "content_markdown"
    ]


@pytest.mark.asyncio
async def test_model_cannot_reuse_rated_card_identity_for_replacement_text(setup_job, monkeypatch):
    import json

    from models.workspace_change import RevisionRequest
    from services.ai_generation_service import AIGenerationService

    store, jobs, w, modules, _ = setup_job
    original = (await store.get("modules", modules[0].id))["flashcards"][0]
    await store.create(
        "flashcard_ratings", {"id": "rating", "card_id": original["id"], "rating": "easy"}
    )

    async def reply(*args, **kwargs):
        return json.dumps(
            {"flashcards": [{**original, "front": "Completely different replacement"}]}
        )

    monkeypatch.setattr(AIGenerationService, "_call_llm", reply)
    job = await jobs.start(
        "owner",
        w.id,
        "revision",
        RevisionRequest(
            request_id="hostile-card-id",
            target=ResourceTarget(
                kind="module", course_id=modules[0].course_id, resource_id=modules[0].id
            ),
            scope="flashcards",
            instruction="Replace the card",
            count=1,
        ),
    )
    await jobs.runner.wait_idle()
    ready = await jobs.get("owner", w.id, job.id)
    assert ready.state == "ready"
    service = WorkspaceChangeService(store)
    change = await service.get("owner", w.id, ready.steps[0].output_ref)
    assert change.patches[0].fields.flashcards[0].id != original["id"]
    await service.apply("owner", w.id, change.id, "apply-replacement")
    revision = (await service.history("owner", w.id))[0]
    await service.restore(
        "owner", w.id, revision.id, revision.current_fingerprint, "restore-original-card"
    )
    assert (await store.get("modules", modules[0].id))["flashcards"][0] == original
    assert (await store.get("flashcard_ratings", "rating"))["card_id"] == original["id"]


@pytest.mark.asyncio
async def test_explicit_unchanged_card_identity_is_retained(setup_job):
    store, _, w, modules, _ = setup_job
    original = (await store.get("modules", modules[0].id))["flashcards"]
    service = WorkspaceChangeService(store)
    change = await service.prepare(
        "owner", w.id, [await patch_for(store, modules[0], {"flashcards": original})]
    )
    assert change.patches[0].fields.flashcards[0].id == original[0]["id"]


@pytest.mark.asyncio
async def test_path_proposal_add_remove_restore_reconciles_current_links(setup_job, path_setup):
    from models.course import CourseCreate
    from models.module import ModuleCreate
    from services.course_service import CourseService
    from services.module_service import ModuleService
    from services.workspace_service import WorkspaceService
    from tests.test_workspace_jobs import build

    store, jobs, _, modules, _ = setup_job
    w, path = path_setup
    b = await CourseService(store).create_course("owner", "Owner", CourseCreate(title="New course"))
    module = await ModuleService(store).create_module(
        b.id, "owner", ModuleCreate(title="New", order_index=0)
    )
    ctx = WorkspaceContext(store)
    target = ResourceTarget(kind="path", resource_id=path.id)
    snapshot = await ctx.snapshot("owner", target, editable=True)
    changes = WorkspaceChangeService(store)
    change = await changes.prepare(
        "owner",
        w.id,
        [
            ResourcePatch(
                target=target,
                expected_fingerprint=snapshot.fingerprint,
                fields={"course_ids": [b.id]},
            )
        ],
    )
    await changes.apply("owner", w.id, change.id, "replace")
    assert (await WorkspaceService(store).get("owner", w.id)).course_ids == [b.id]
    assert (await jobs._inputs("owner", w.id, "build", build([module])))[0]["target"][
        "resource_id"
    ] == module.id
    with pytest.raises(StudyBuddyException):
        await jobs._inputs("owner", w.id, "build", build(modules[:1]))
    revision = (await changes.history("owner", w.id))[0]
    await changes.restore("owner", w.id, revision.id, revision.current_fingerprint, "restore")
    assert (await ctx.workspace("owner", w.id)).course_ids == [modules[0].course_id]
    # Remove again, then delete the former source. Current editing recovers; old output does not.
    from services.learning_path_service import LearningPathService

    await LearningPathService(store, CourseService(store)).replace_course_references(
        path.id, "owner", [b.id]
    )
    await store.delete("courses", modules[0].course_id)
    assert (await ctx.workspace("owner", w.id, writable=True)).course_ids == [b.id]
    with pytest.raises(StudyBuddyException):
        await changes.get("owner", w.id, change.id)
    with pytest.raises(StudyBuddyException):
        await changes.restore("owner", w.id, revision.id, revision.current_fingerprint, "denied")
