"""Recovered work must remain durably reviewable despite denied historical sources."""

import asyncio
import json

import pytest

from exceptions import StudyBuddyException
from models.course import CourseCreate
from models.learning_path import LearningPathUpdate
from models.workspace_change import ManualChangeRequest, ResourcePatch, ResourceTarget
from models.workspace_plan import ApplyPlanRequest, PlanRequest
from services.ai_generation_service import AIGenerationService
from services.course_service import CourseService
from services.learning_path_service import LearningPathService
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_context import WorkspaceContext
from services.workspace_job_service import WorkspaceJobService
from services.workspace_plan_service import WorkspacePlanService
from tests.test_workspace_changes import path_setup as path_setup
from tests.test_workspace_jobs import build
from tests.test_workspace_jobs import setup_job as setup_job
from tests.test_workspace_plans import plan_data
from tests.test_workspaces import workspace_store as workspace_store


@pytest.mark.asyncio
@pytest.mark.parametrize("removed", ["revoked", "deleted"])
async def test_repaired_path_discovers_new_paid_work_and_withholds_old_history(
    setup_job, path_setup, monkeypatch, removed
):
    store, jobs, _, modules, state = setup_job
    w, path = path_setup
    courses = CourseService(store)
    paths = LearningPathService(store, courses)
    foreign = await courses.create_course(
        "other", "Other", CourseCreate(title="FORBIDDEN_SOURCE", visibility="public")
    )
    await paths.add_course_to_path(path.id, "owner", foreign.id)
    changes = WorkspaceChangeService(store)
    target = ResourceTarget(kind="path", resource_id=path.id)
    snapshot = await WorkspaceContext(store).snapshot("owner", target, editable=True)
    manual_request = ManualChangeRequest(
        request_id="old-manual",
        patches=[
            ResourcePatch(
                target=target,
                expected_fingerprint=snapshot.fingerprint,
                fields={"description": "FORBIDDEN_HISTORY"},
            )
        ],
    )
    old_change = await changes.manual("owner", w.id, manual_request)
    await changes.apply("owner", w.id, old_change.id, "old-apply")
    old_revision = (await changes.history("owner", w.id))[0]
    plan_calls = []

    async def plan_response(*args, **kwargs):
        plan_calls.append(1)
        data = plan_data("path")
        data["title"] = "FORBIDDEN_PLAN" if len(plan_calls) == 1 else "Current plan"
        return json.dumps(data)

    monkeypatch.setattr(AIGenerationService, "_call_llm", plan_response)
    old_request = PlanRequest(request_id="old-plan")
    old_job = await jobs.start("owner", w.id, "plan", old_request)
    await jobs.runner.wait_idle()
    old_plan_id = (await jobs.get("owner", w.id, old_job.id)).steps[0].output_ref
    if removed == "deleted":
        await store.delete("courses", foreign.id)
    else:
        await store.update("courses", foreign.id, {"visibility": "private"})
    with pytest.raises(StudyBuddyException):
        await jobs.discover("owner", w.id)
    await paths.replace_course_references(path.id, "owner", [modules[0].course_id])
    await paths.update_path(
        path.id, "owner", LearningPathUpdate(description="Repaired description")
    )

    # Previously saved, inaccessible records cannot block durable new plan discovery.
    new_request = PlanRequest(request_id="new-plan")
    new_job = await jobs.start("owner", w.id, "plan", new_request)
    await jobs.runner.wait_idle()
    plans = WorkspacePlanService(store, jobs.settings)
    discovered_jobs = await jobs.discover("owner", w.id)
    assert discovered_jobs.unavailable_count == 1
    assert [job.id for job in discovered_jobs.items] == [new_job.id]
    discovered_plans = await plans.discover("owner", w.id)
    assert discovered_plans.unavailable_count == 1
    assert len(discovered_plans.items) == 1
    proposal = discovered_plans.items[0]
    apply = ApplyPlanRequest(request_id="new-apply", expected_proposal_version=proposal.version)
    applied = await plans.apply("owner", w.id, proposal.id, apply)
    assert await plans.apply("owner", w.id, proposal.id, apply) == applied
    assert (await jobs.start("owner", w.id, "plan", new_request)).id == new_job.id

    # Observe the queued/running build, then discover and apply its single saved output.
    stage = AIGenerationService.stage_content
    entered, release = asyncio.Event(), asyncio.Event()

    async def delayed_stage(self, *args, **kwargs):
        entered.set()
        await release.wait()
        return await stage(self, *args, **kwargs)

    monkeypatch.setattr(AIGenerationService, "stage_content", delayed_stage)
    request = build(modules[:1])
    new_build = await jobs.start("owner", w.id, "build", request)
    await entered.wait()
    polling = await jobs.discover("owner", w.id)
    assert any(j.id == new_build.id and j.state in ("queued", "running") for j in polling.items)
    release.set()
    await jobs.runner.wait_idle()
    completed = next(j for j in (await jobs.discover("owner", w.id)).items if j.id == new_build.id)
    assert completed.state == "ready" and completed.steps[0].credits == 25
    output = completed.steps[0].output_ref
    assert (await changes.get("owner", w.id, output)).status == "ready"
    result = await changes.apply("owner", w.id, output, "build-apply")
    assert (
        await changes.apply("owner", w.id, output, "build-apply")
    ).revision_id == result.revision_id
    assert (await jobs.start("owner", w.id, "build", request)).steps[0].output_ref == output

    # Fresh services emulate page reload discovery, including an output saved before reload.
    reloaded_jobs = WorkspaceJobService(store, jobs.settings)
    reloaded_changes = WorkspaceChangeService(store)
    all_visible = [
        await reloaded_jobs.discover("owner", w.id),
        await WorkspacePlanService(store, jobs.settings).discover("owner", w.id),
        await reloaded_changes.discover_changes("owner", w.id),
        await reloaded_changes.discover_history("owner", w.id),
    ]
    assert all(batch.unavailable_count == 1 for batch in all_visible)
    assert {j.id for j in all_visible[0].items} == {new_job.id, new_build.id}
    assert all_visible[1].items[0].status == "applied"
    assert [c.id for c in all_visible[2].items] == [output]
    assert len(all_visible[3].items) == 2  # New plan creation and module application.
    assert all("FORBIDDEN" not in batch.model_dump_json() for batch in all_visible)
    assert all(foreign.id not in batch.model_dump_json() for batch in all_visible)
    assert len(plan_calls) == 2 and len(state["calls"]) == 1
    assert (await store.get("users", "owner"))["token_balance"] == 55
    assert len(await store.list("generation_operations")) == 3
    assert len(await store.list("workspace_changes")) == 2

    # Collection recovery must not relax any old direct-read, replay, apply or restore gate.
    for denied in [
        jobs.get("owner", w.id, old_job.id),
        jobs.start("owner", w.id, "plan", old_request),
        plans.get("owner", w.id, old_plan_id),
        plans.apply(
            "owner",
            w.id,
            old_plan_id,
            ApplyPlanRequest(request_id="denied", expected_proposal_version=1),
        ),
        changes.manual("owner", w.id, manual_request),
        changes.get("owner", w.id, old_change.id),
        changes.restore(
            "owner", w.id, old_revision.id, old_revision.current_fingerprint, "denied-restore"
        ),
        jobs.discover("other", w.id),
    ]:
        with pytest.raises(StudyBuddyException):
            await denied


@pytest.mark.asyncio
async def test_discovery_does_not_swallow_non_access_failures(setup_job, monkeypatch):
    _, jobs, w, modules, _ = setup_job
    await jobs.start("owner", w.id, "build", build(modules[:1]))
    await jobs.runner.wait_idle()

    async def broken_read(*args):
        raise RuntimeError("Storage failed")

    monkeypatch.setattr(jobs, "get", broken_read)
    with pytest.raises(RuntimeError, match="Storage failed"):
        await jobs.discover("owner", w.id)


@pytest.mark.asyncio
async def test_partial_http_envelopes_preserve_default_array_contract(
    workspace_store, client, auth_headers
):
    response = await client.post(
        "/api/v1/workspaces",
        headers=auth_headers,
        json={
            "request_id": "empty-discovery",
            "brief": {"goal": "Learn"},
        },
    )
    base = f"/api/v1/workspaces/{response.json()['id']}"
    for collection in ("jobs", "plans", "changes", "history"):
        assert (await client.get(f"{base}/{collection}", headers=auth_headers)).json() == []
        response = await client.get(f"{base}/{collection}?partial=true", headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.json() == {"items": [], "unavailable_count": 0}
