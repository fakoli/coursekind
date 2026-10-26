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
