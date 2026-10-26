"""Progress API routes - track progress through modules, courses, and paths."""

from fastapi import APIRouter, Depends, Query

from dependencies import CurrentUser, StorageDep
from models.progress import (
    CourseProgressStatus,
    DashboardStats,
    ModuleProgress,
    ModuleProgressCreate,
    NextUpResponse,
    PathProgressStatus,
    ProgressStats,
    RecentActivityResponse,
    SessionsResponse,
    TopicMasteryResponse,
)
from services.progress_service import ProgressService

router = APIRouter()


def get_progress_service(storage: StorageDep) -> ProgressService:
    return ProgressService(storage)


# New endpoints for path/course/module progress


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get overall dashboard statistics for the current user.

    Returns aggregated progress data including:
    - Active learning paths
    - Courses in progress/completed
    - Modules completed (this week/month/total)
    - Quiz performance
    - Study time
    - Streak data
    """
    return await progress_service.get_dashboard_stats(user.id)


@router.post(
    "/modules/{course_id}/{module_id}",
    response_model=ModuleProgress,
)
async def update_module_progress(
    course_id: str,
    module_id: str,
    data: ModuleProgressCreate,
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Update progress for a specific module.

    Actions:
    - start: Passive compatibility action; no study credit
    - complete: Mark module as completed
    - read_content: Mark content as read
    - review_flashcard: Append a review and track distinct stable card identity
    - submit_quiz: Record quiz attempt and score
    - practice: Record an execution and its result, without assessment credit
    - save_state: Save personal drafts/questions without study credit

    Supply event_id to retry a meaningful action without duplicate events or time.
    """
    return await progress_service.update_module_progress(user.id, module_id, course_id, data)


@router.get(
    "/modules/{course_id}/{module_id}",
    response_model=ModuleProgress | None,
)
async def get_module_progress(
    course_id: str,
    module_id: str,
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get progress for a specific module."""
    return await progress_service.get_module_progress(user.id, module_id, course_id)


@router.get("/courses/{course_id}", response_model=CourseProgressStatus)
async def get_course_progress(
    course_id: str,
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get progress for a course including all modules.

    Returns:
    - Course-level completion percentage
    - Per-module progress status
    - Average quiz score
    - Total time spent
    """
    return await progress_service.get_course_progress(user.id, course_id)


@router.get("/paths/{path_id}", response_model=PathProgressStatus)
async def get_path_progress(
    path_id: str,
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get progress for a learning path including all courses.

    Returns:
    - Path-level completion percentage
    - Per-course progress status
    - Total time spent across path
    """
    return await progress_service.get_path_progress(user.id, path_id)


@router.get("/activity", response_model=RecentActivityResponse)
async def get_recent_activity(
    user: CurrentUser,
    limit: int = Query(20, ge=1, le=100),
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get recent learning activity.

    Returns a list of recent actions like:
    - module_started
    - module_completed
    - quiz_submitted
    - content_read
    """
    return await progress_service.get_recent_activity(user.id, limit)


@router.get("/next-up", response_model=NextUpResponse)
async def get_next_up(
    user: CurrentUser,
    limit: int = Query(3, ge=1, le=10),
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get recommended next modules/courses to study.

    Prioritizes:
    1. In-progress modules (continue where you left off)
    2. Next modules in learning paths
    3. Modules in user-owned courses
    """
    return await progress_service.get_next_up(user.id, limit)


# Legacy endpoints - kept for backward compatibility


@router.get("/stats", response_model=ProgressStats)
async def get_stats(
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """DEPRECATED: Get overall progress statistics.

    Use /progress/dashboard instead for more comprehensive stats.
    """
    return await progress_service.get_stats(user.id)


@router.get("/sessions", response_model=SessionsResponse)
async def get_sessions(
    user: CurrentUser,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    progress_service: ProgressService = Depends(get_progress_service),
):
    """Get session history.

    Note: Now returns activity-based sessions rather than explicit sessions.
    """
    return await progress_service.get_sessions(user.id, limit, offset)


@router.get("/topics", response_model=TopicMasteryResponse)
async def get_topic_mastery(
    user: CurrentUser,
    progress_service: ProgressService = Depends(get_progress_service),
):
    """DEPRECATED: Returns empty response.

    Use /progress/courses/{course_id} instead for per-module mastery.
    """
    return await progress_service.get_topic_mastery(user.id)
