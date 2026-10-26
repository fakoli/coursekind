"""Course API routes."""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from dependencies import CurrentUser, StorageDep
from models.course import (
    Course,
    CourseCreate,
    CourseDiscoveryFilters,
    CourseDiscoveryResponse,
    CourseResponse,
    CourseUpdate,
)
from models.module import ModuleSummary
from models.sharing import ShareRequest, SharingResponse
from services.access_service import AccessService
from services.course_service import CourseService

router = APIRouter()


def get_course_service(storage: StorageDep) -> CourseService:
    return CourseService(storage)


class CourseWithModulesResponse(BaseModel):
    """Course with module summaries."""

    course: Course
    modules: list[ModuleSummary]


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """List all courses accessible to the current user."""
    user_id = user.id if user else None
    return await course_service.list_courses(user_id)


@router.get("/mine", response_model=list[CourseResponse])
async def list_my_courses(
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """List courses authored by the current user."""
    return await course_service.list_user_courses(user.id)


@router.get("/shared", response_model=list[CourseResponse])
async def list_shared_courses(
    user: CurrentUser,
    storage: StorageDep,
    course_service: CourseService = Depends(get_course_service),
):
    shared_ids = {
        c["id"]
        for c in await storage.list("courses")
        if user.id in c.get("shared_with", []) and c.get("author_id") != user.id
    }
    return [c for c in await course_service.list_courses(user.id) if c.id in shared_ids]


@router.get("/discover", response_model=CourseDiscoveryResponse)
async def discover_courses(
    user: CurrentUser,
    q: str | None = Query(None, description="Search query"),
    tags: str | None = Query(None, description="Comma-separated tags"),
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = Query(None),
    author_id: str | None = Query(None),
    sort: Literal["popular", "newest", "alphabetical"] = Query("popular"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    course_service: CourseService = Depends(get_course_service),
):
    """Browse and search public courses."""
    filters = CourseDiscoveryFilters(
        q=q,
        tags=tags.split(",") if tags else None,
        difficulty=difficulty,
        author_id=author_id,
        sort=sort,
        page=page,
        limit=limit,
    )
    return await course_service.discover_courses(filters)


@router.post("", response_model=Course)
async def create_course(
    course_data: CourseCreate,
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """Create a new course."""
    return await course_service.create_course(user.id, user.name, course_data)


@router.get("/{course_id}", response_model=CourseWithModulesResponse)
async def get_course(
    course_id: str,
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """Get a course with its modules."""
    user_id = user.id if user else None
    course, modules = await course_service.get_course_with_modules(course_id, user_id)
    return CourseWithModulesResponse(course=course, modules=modules)


@router.put("/{course_id}", response_model=Course)
async def update_course(
    course_id: str,
    update_data: CourseUpdate,
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """Update course metadata (author only)."""
    return await course_service.update_course(course_id, user.id, update_data)


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    user: CurrentUser,
    course_service: CourseService = Depends(get_course_service),
):
    """Delete a course and all its modules (author only)."""
    await course_service.delete_course(course_id, user.id)
    return {"message": "Course deleted successfully"}


@router.get("/{course_id}/sharing", response_model=SharingResponse)
async def get_sharing(course_id: str, user: CurrentUser, storage: StorageDep):
    return await AccessService(storage).sharing("courses", course_id, user.id)


@router.post("/{course_id}/sharing", response_model=SharingResponse)
async def grant_sharing(course_id: str, data: ShareRequest, user: CurrentUser, storage: StorageDep):
    return await AccessService(storage).grant("courses", course_id, user.id, str(data.email))


@router.delete("/{course_id}/sharing/{recipient_id}", response_model=SharingResponse)
async def revoke_sharing(course_id: str, recipient_id: str, user: CurrentUser, storage: StorageDep):
    return await AccessService(storage).revoke("courses", course_id, user.id, recipient_id)
