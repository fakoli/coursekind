import pytest

from exceptions import StudyBuddyException
from models.course import CourseCreate
from models.workspace_change import ResourceTarget
from services.course_service import CourseService
from services.workspace_context import WorkspaceContext
from tests.test_workspaces import workspace_store as workspace_store


@pytest.mark.asyncio
async def test_snapshot_excludes_sharing_progress_and_rechecks_access(workspace_store):
    c = await CourseService(workspace_store).create_course(
        "owner", "Author", CourseCreate(title="Course", visibility="public")
    )
    ctx = WorkspaceContext(workspace_store)
    target = ResourceTarget(kind="course", resource_id=c.id)
    before = await ctx.snapshot("reader", target, editable=False)
    await workspace_store.update("courses", c.id, {"times_added": 20, "shared_with": ["x"]})
    assert (await ctx.snapshot("reader", target, editable=False)).fingerprint == before.fingerprint
    assert "shared_with" not in before.fields
    await workspace_store.update("courses", c.id, {"visibility": "private"})
    with pytest.raises(StudyBuddyException):
        await ctx.snapshot("reader", target, editable=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("removed", ["deleted", "revoked"])
async def test_current_path_links_follow_baseline_edits_but_history_stays_access_checked(
    workspace_store, removed
):
    from models.learning_path import LearningPathCreate
    from models.workspace import WorkspaceCreate, WorkspaceUpdate
    from services.learning_path_service import LearningPathService
    from services.workspace_service import WorkspaceService

    store = workspace_store
    courses = CourseService(store)
    a = await courses.create_course("other", "Other", CourseCreate(title="A", visibility="public"))
    b = await courses.create_course("owner", "Owner", CourseCreate(title="B"))
    paths = LearningPathService(store, courses)
    path = await paths.create_path("owner", LearningPathCreate(title="Path", course_ids=[a.id]))
    service = WorkspaceService(store)
    w = await service.create(
        "owner",
        "Owner",
        WorkspaceCreate(
            request_id="open",
            brief={"goal": "Learn", "scope": "path"},
            source_path_id=path.id,
        ),
    )
    ctx = WorkspaceContext(store)
    old = await ctx.snapshot(
        "owner", ResourceTarget(kind="path", resource_id=path.id), editable=True
    )
    if removed == "deleted":
        await store.delete("courses", a.id)
    else:
        await store.update("courses", a.id, {"visibility": "private"})
    with pytest.raises(StudyBuddyException):
        await ctx.workspace("owner", w.id)
    # This is the baseline path editor's operation, not a workspace proposal.
    await paths.replace_course_references(path.id, "owner", [b.id])
    assert (await ctx.workspace("owner", w.id, writable=True)).course_ids == [b.id]
    assert (await service.list("owner"))[0].course_ids == [b.id]
    reopened = await service.create(
        "owner",
        "Owner",
        WorkspaceCreate(
            request_id="reopen",
            brief={"goal": "Learn", "scope": "path"},
            source_path_id=path.id,
        ),
    )
    assert reopened.id == w.id and reopened.course_ids == [b.id]
    saved = await service.update(
        "owner",
        w.id,
        WorkspaceUpdate(
            request_id="save",
            expected_version=w.version,
            brief={"goal": "Updated"},
        ),
    )
    assert saved.course_ids == [b.id]
    with pytest.raises(StudyBuddyException):
        await ctx.check("owner", [old])
