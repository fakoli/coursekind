"""Learning Path API routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dependencies import CurrentUser, OptionalUser, StorageDep
from models.learning_path import (
    AddCourseToPath,
    LearningPath,
    LearningPathCreate,
    LearningPathResponse,
    LearningPathUpdate,
    ReorderCoursesInPath,
)
from models.course import CourseResponse
from services.course_service import CourseService
from services.learning_path_service import LearningPathService

router = APIRouter()


def get_course_service(storage: StorageDep) -> CourseService:
    return CourseService(storage)


def get_learning_path_service(
    storage: StorageDep,
    course_service: CourseService = Depends(get_course_service),
) -> LearningPathService:
    return LearningPathService(storage, course_service)


class LearningPathWithCoursesResponse(BaseModel):
    """Learning path with expanded course data."""

    path: LearningPath
    courses: list[CourseResponse]


@router.get("", response_model=list[LearningPathResponse])
async def list_paths(
    user: OptionalUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """List all learning paths accessible to the current user."""
    user_id = user.id if user else None
    return await path_service.list_paths(user_id)


@router.get("/mine", response_model=list[LearningPathResponse])
async def list_my_paths(
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """List learning paths owned by the current user."""
    return await path_service.list_user_paths(user.id)


@router.post("", response_model=LearningPath)
async def create_path(
    path_data: LearningPathCreate,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Create a new learning path."""
    return await path_service.create_path(user.id, path_data)


@router.get("/{path_id}", response_model=LearningPathWithCoursesResponse)
async def get_path(
    path_id: str,
    user: OptionalUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
    course_service: CourseService = Depends(get_course_service),
):
    """Get a learning path with its courses."""
    user_id = user.id if user else None
    path = await path_service.get_path(path_id, user_id)

    # Fetch course details
    courses = []
    for course_id in path.course_ids:
        try:
            course, modules = await course_service.get_course_with_modules(course_id, user_id)
            # Convert to CourseResponse
            courses.append(
                CourseResponse(
                    **course.model_dump(),
                    module_count=len(modules),
                )
            )
        except Exception:
            # Skip courses that are no longer accessible
            pass

    return LearningPathWithCoursesResponse(path=path, courses=courses)


@router.put("/{path_id}", response_model=LearningPath)
async def update_path(
    path_id: str,
    update_data: LearningPathUpdate,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Update learning path metadata (owner only)."""
    return await path_service.update_path(path_id, user.id, update_data)


@router.delete("/{path_id}")
async def delete_path(
    path_id: str,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Delete a learning path (owner only)."""
    await path_service.delete_path(path_id, user.id)
    return {"message": "Learning path deleted successfully"}


@router.post("/{path_id}/courses", response_model=LearningPath)
async def add_course_to_path(
    path_id: str,
    data: AddCourseToPath,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Add a course to a learning path."""
    return await path_service.add_course_to_path(path_id, user.id, data.course_id)


@router.delete("/{path_id}/courses/{course_id}", response_model=LearningPath)
async def remove_course_from_path(
    path_id: str,
    course_id: str,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Remove a course from a learning path."""
    return await path_service.remove_course_from_path(path_id, user.id, course_id)


@router.put("/{path_id}/courses/reorder", response_model=LearningPath)
async def reorder_courses_in_path(
    path_id: str,
    data: ReorderCoursesInPath,
    user: CurrentUser,
    path_service: LearningPathService = Depends(get_learning_path_service),
):
    """Reorder courses in a learning path."""
    return await path_service.reorder_courses(path_id, user.id, data.course_ids)
