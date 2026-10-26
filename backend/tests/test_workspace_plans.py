"""Bounded plans and atomic additive materialization on both concrete stores."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from config import Settings
from exceptions import StudyBuddyException
from models.course import CourseCreate
from models.module import ModuleCreate
from models.workspace import WorkspaceCreate
from models.workspace_plan import ApplyPlanRequest, PlanRequest, PlanUpdateRequest, WorkspacePlan
from services.course_service import CourseService
from services.module_service import ModuleService
from services.workspace_plan_service import WorkspacePlanService
from services.workspace_service import WorkspaceService
from tests.test_workspaces import workspace_store as workspace_store


def plan_data(scope="course", count=1):
    return dict(
        scope=scope,
        title="Python",
        description="Learn Python",
        assumptions=["Beginner"],
        courses=[
            dict(
                kind="new",
                temp_id=f"c{i}",
                title=f"Course {i}",
                description="Course",
                difficulty="beginner",
                modules=[
                    dict(
                        temp_id=f"m{i}",
                        title="Basics",
                        description="Start here",
                        objectives=["Learn basics"],
                    )
                ],
            )
            for i in range(count)
        ],
    )


def test_plan_bounds_and_duplicate_ids():
    WorkspacePlan(**plan_data())
    WorkspacePlan(**plan_data("path", 3))
    maximum = plan_data("path", 3)
    for course in maximum["courses"]:
        course["modules"] = [
            {**course["modules"][0], "temp_id": f"{course['temp_id']}-m{i}"} for i in range(6)
        ]
    assert sum(len(c.modules) for c in WorkspacePlan(**maximum).courses) == 18
    maximum["courses"][0]["modules"].append(
        {**maximum["courses"][0]["modules"][0], "temp_id": "extra"}
    )
    with pytest.raises(ValidationError):
        WorkspacePlan(**maximum)
    for data in [plan_data("course", 2), plan_data("path", 4), plan_data("path", 0)]:
        with pytest.raises(ValidationError):
            WorkspacePlan(**data)
    data = plan_data()
    data["courses"][0]["modules"] *= 2
    with pytest.raises(ValidationError):
        WorkspacePlan(**data)
    data["courses"][0]["modules"] = []
    with pytest.raises(ValidationError):
        WorkspacePlan(**data)
    with pytest.raises(ValidationError):
        WorkspacePlan(**{**plan_data(), "courses": [{"kind": "reuse", "course_id": ""}]})


async def proposal(store, scope="course", count=1, **kwargs):
    await store.create("users", {"id": "owner", "name": "Author", "token_balance": 100})
    w = await WorkspaceService(store).create(
        "owner",
        "Author",
        WorkspaceCreate(request_id=str(uuid4()), brief={"goal": "Learn", "scope": scope}, **kwargs),
    )
    service = WorkspacePlanService(store, Settings(debug=True))
    request = PlanRequest(request_id=str(uuid4()))
    context = await service.context("owner", w.id, request)
    p = await service.save_proposal(
        "owner", w.id, WorkspacePlan(**plan_data(scope, count)), context, None
    )
    return service, w, p


@pytest.mark.asyncio
async def test_apply_plan_replays_same_ids(workspace_store):
    service, w, p = await proposal(workspace_store, "path", 2)
    request = ApplyPlanRequest(request_id=str(uuid4()), expected_proposal_version=1)
    result = await service.apply("owner", w.id, p.id, request)
    assert result.applied_workspace is not None
    assert result.applied_workspace.version == w.version + 1
    assert result.applied_workspace.brief == w.brief
    assert result == await service.apply("owner", w.id, p.id, request)
    assert len(await workspace_store.list("courses")) == 2
    assert len(await workspace_store.list("modules")) == 2
    assert all(c["visibility"] == "private" for c in await workspace_store.list("courses"))
    assert (await workspace_store.list("learning_paths"))[0]["visibility"] == "private"


@pytest.mark.asyncio
async def test_apply_failure_rolls_back_every_object(workspace_store, monkeypatch):
    service, w, p = await proposal(workspace_store, "path", 2)
    create = workspace_store.create
    calls = 0

    async def fail(collection, data):
        nonlocal calls
        if collection == "courses":
            calls += 1
            if calls == 2:
                raise RuntimeError("Synthetic failure")
        return await create(collection, data)

    monkeypatch.setattr(workspace_store, "create", fail)
    with pytest.raises(RuntimeError):
        await service.apply(
            "owner", w.id, p.id, ApplyPlanRequest(request_id="apply", expected_proposal_version=1)
        )
    assert not await workspace_store.list("courses")
    assert not await workspace_store.list("modules")
    assert (await service.get("owner", w.id, p.id)).status == "ready"


@pytest.mark.asyncio
async def test_existing_course_plan_is_additive(workspace_store):
    course = await CourseService(workspace_store).create_course(
        "owner", "Author", CourseCreate(title="Existing")
    )
    original = await ModuleService(workspace_store).create_module(
        course.id,
        "owner",
        ModuleCreate(title="Old", order_index=10, content_markdown="Keep content"),
    )
    service, w, p = await proposal(workspace_store, source_course_id=course.id)
    applied = await service.apply(
        "owner", w.id, p.id, ApplyPlanRequest(request_id="apply", expected_proposal_version=1)
    )
    assert applied.applied_ids["c0"] == course.id
    assert len(await workspace_store.list("courses")) == 1
    assert (await workspace_store.get("modules", original.id))["content_markdown"] == "Keep content"
    assert (await workspace_store.get("modules", applied.applied_ids["m0"]))["order_index"] == 11


@pytest.mark.asyncio
async def test_reuse_requires_selection_access_and_never_edits_source(workspace_store):
    service, w, p = await proposal(workspace_store, "path", 1)
    source = await CourseService(workspace_store).create_course(
        "other", "Original author", CourseCreate(title="Shared", visibility="public")
    )
    data = plan_data("path")
    data["courses"].append({"kind": "reuse", "course_id": source.id})
    context = await service.context("owner", w.id, PlanRequest(request_id="plan"))
    with pytest.raises(StudyBuddyException):
        await service.save_proposal("owner", w.id, WorkspacePlan(**data), context, None)
    context = await service.context(
        "owner", w.id, PlanRequest(request_id="plan", reuse_course_ids=[source.id])
    )
    saved = await service.save_proposal("owner", w.id, WorkspacePlan(**data), context, None)
    before = await workspace_store.get("courses", source.id)
    await service.apply(
        "owner", w.id, saved.id, ApplyPlanRequest(request_id="apply", expected_proposal_version=1)
    )
    assert await workspace_store.get("courses", source.id) == before
    path = (await workspace_store.list("learning_paths"))[0]
    assert source.id in path["course_ids"]
    await workspace_store.update("courses", source.id, {"visibility": "private"})
    for call in [
        service.get("owner", w.id, saved.id),
        service.list("owner", w.id),
        service.context(
            "owner", w.id, PlanRequest(request_id="another", reuse_course_ids=[source.id])
        ),
    ]:
        with pytest.raises(StudyBuddyException):
            await call


@pytest.mark.asyncio
async def test_manual_plan_edit_replay_before_version_and_stale_apply(workspace_store):
    service, w, p = await proposal(workspace_store)
    edited = p.plan.model_copy(update={"title": "Edited"})
    request = PlanUpdateRequest(request_id="edit", expected_proposal_version=1, plan=edited)
    result = await service.update("owner", w.id, p.id, request)
    assert result.version == 2
    assert await service.update("owner", w.id, p.id, request) == result
    assert not await workspace_store.list("token_transactions")
    with pytest.raises(StudyBuddyException):
        await service.apply(
            "owner", w.id, p.id, ApplyPlanRequest(request_id="apply", expected_proposal_version=1)
        )
    assert not await workspace_store.list("courses")


@pytest.mark.asyncio
async def test_refinement_keeps_prior_source_dependency_after_deselection(workspace_store):
    service, w, _ = await proposal(workspace_store, "path", 1)
    source = await CourseService(workspace_store).create_course(
        "other", "Original", CourseCreate(title="Shared", visibility="public")
    )
    request = PlanRequest(request_id="first", reuse_course_ids=[source.id])
    context = await service.context("owner", w.id, request)
    first = await service.save_proposal(
        "owner", w.id, WorkspacePlan(**plan_data("path")), context, None
    )
    context = await service.context(
        "owner", w.id, PlanRequest(request_id="refinement", previous_proposal_id=first.id)
    )
    second = await service.save_proposal(
        "owner", w.id, WorkspacePlan(**plan_data("path")), context, None
    )
    await workspace_store.update("courses", source.id, {"visibility": "private"})
    with pytest.raises(StudyBuddyException):
        await service.get("owner", w.id, second.id)
