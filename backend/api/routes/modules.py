"""Module API routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from dependencies import CurrentUser, OptionalUser, StorageDep
from models.module import (
    Module,
    ModuleCreate,
    ModuleSummary,
    ModuleUpdate,
)
from services.course_service import CourseService
from services.image_service import ImageService
from services.module_service import ModuleService

router = APIRouter()


def get_module_service(storage: StorageDep) -> ModuleService:
    return ModuleService(storage)


def get_course_service(storage: StorageDep) -> CourseService:
    return CourseService(storage)


def get_image_service() -> ImageService:
    return ImageService()


class ReorderModulesRequest(BaseModel):
    """Request to reorder modules."""

    module_ids: list[str]


class BatchModuleCreateRequest(BaseModel):
    """Request to batch create modules."""

    modules: list[ModuleCreate]


@router.get("/{course_id}/modules", response_model=list[ModuleSummary])
async def list_modules(
    course_id: str,
    user: OptionalUser,
    course_service: CourseService = Depends(get_course_service),
):
    """List all modules for a course (visibility-enforced).

    Anonymous callers may list modules only for public courses; private
    courses are visible only to their author. (Previously this endpoint
    had no ownership check and leaked module metadata for any course.)
    """
    user_id = user.id if user else None
    _course, modules = await course_service.get_course_with_modules(course_id, user_id)
    return modules


@router.post("/{course_id}/modules", response_model=Module)
async def create_module(
    course_id: str,
    module_data: ModuleCreate,
    user: CurrentUser,
    module_service: ModuleService = Depends(get_module_service),
    image_service: ImageService = Depends(get_image_service),
):
    """Create a new module in a course."""
    await module_service._get_editable_course(course_id, user.id)
    # Process markdown to download external images
    if module_data.content_markdown:
        module_data.content_markdown = await image_service.process_markdown(
            module_data.content_markdown, course_id
        )

    return await module_service.create_module(course_id, user.id, module_data)


@router.post("/{course_id}/modules/batch")
async def batch_create_modules(
    course_id: str,
    data: BatchModuleCreateRequest,
    user: CurrentUser,
    module_service: ModuleService = Depends(get_module_service),
):
    """Create multiple modules in a single request."""
    created = await module_service.batch_create_modules(course_id, user.id, data.modules)
    return {"created": created, "count": len(created)}


@router.put("/{course_id}/modules/reorder", response_model=list[ModuleSummary])
async def reorder_modules(
    course_id: str,
    data: ReorderModulesRequest,
    user: CurrentUser,
    module_service: ModuleService = Depends(get_module_service),
):
    """Reorder modules in a course (course author only)."""
    return await module_service.reorder_modules(course_id, user.id, data.module_ids)


@router.get("/{course_id}/modules/{module_id}", response_model=Module)
async def get_module(
    course_id: str,
    module_id: str,
    user: OptionalUser,
    module_service: ModuleService = Depends(get_module_service),
):
    """Get a module by ID."""
    user_id = user.id if user else None
    return await module_service.get_module(course_id, module_id, user_id)


@router.put("/{course_id}/modules/{module_id}", response_model=Module)
async def update_module(
    course_id: str,
    module_id: str,
    update_data: ModuleUpdate,
    user: CurrentUser,
    module_service: ModuleService = Depends(get_module_service),
    image_service: ImageService = Depends(get_image_service),
):
    """Update a module (course author only)."""
    await module_service._get_editable_course(course_id, user.id)
    # Process markdown to download external images
    if update_data.content_markdown:
        update_data.content_markdown = await image_service.process_markdown(
            update_data.content_markdown, course_id
        )

    return await module_service.update_module(course_id, module_id, user.id, update_data)


@router.delete("/{course_id}/modules/{module_id}")
async def delete_module(
    course_id: str,
    module_id: str,
    user: CurrentUser,
    module_service: ModuleService = Depends(get_module_service),
):
    """Delete a module from a course (course author only)."""
    await module_service.delete_module(course_id, module_id, user.id)
    return {"message": "Module deleted successfully"}
