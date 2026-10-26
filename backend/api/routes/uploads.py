"""Upload API routes for images and files."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from dependencies import CurrentUser, OptionalUser, StorageDep
from services.access_service import AccessService
from services.course_service import CourseService
from services.image_service import ImageService

router = APIRouter()


def get_image_service() -> ImageService:
    return ImageService()


def get_course_service(storage: StorageDep) -> CourseService:
    return CourseService(storage)


class ImageUploadResponse(BaseModel):
    """Response after image upload."""

    url: str
    filename: str


class ImageUrlRequest(BaseModel):
    """Request to download image from URL."""

    url: str


@router.post("/images/{course_id}", response_model=ImageUploadResponse)
async def upload_image(
    course_id: str,
    user: CurrentUser,
    file: UploadFile = File(...),
    image_service: ImageService = Depends(get_image_service),
    course_service: CourseService = Depends(get_course_service),
):
    """Upload an image file for a course.

    The user must be the author of the course.
    """
    # Verify user owns the course
    await course_service._get_editable_course(course_id, user.id)

    # Read file content
    content = await file.read()

    # Upload image
    filename = file.filename or "image.jpg"
    url = await image_service.upload_image(content, filename, course_id)

    return ImageUploadResponse(url=url, filename=filename)


@router.post("/images/{course_id}/from-url", response_model=ImageUploadResponse)
async def upload_image_from_url(
    course_id: str,
    data: ImageUrlRequest,
    user: CurrentUser,
    image_service: ImageService = Depends(get_image_service),
    course_service: CourseService = Depends(get_course_service),
):
    """Download an image from URL and store it for a course.

    The user must be the author of the course.
    """
    # Verify user owns the course
    await course_service._get_editable_course(course_id, user.id)

    # Download and store image
    url = await image_service.download_external_image(data.url, course_id)

    # Extract filename from URL
    from pathlib import Path

    filename = Path(url).name

    return ImageUploadResponse(url=url, filename=filename)


@router.get("/courses/{course_id}/images/{filename}")
async def get_image(
    course_id: str,
    filename: str,
    user: OptionalUser,
    storage: StorageDep,
    image_service: ImageService = Depends(get_image_service),
):
    """Serve uploaded images under the same live policy as their course."""
    await AccessService(storage).require_course(course_id, user.id if user else None)
    file_path = image_service.get_image_path(course_id, filename)

    if not file_path:
        raise HTTPException(status_code=404, detail="Image not found")

    # Determine media type
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
    }
    ext = file_path.suffix.lower()
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(file_path, media_type=media_type, headers={"Cache-Control": "no-store"})


@router.get("/courses/{course_id}/{module_id}/visuals/{filename}")
async def get_generated_visual(
    course_id: str,
    module_id: str,
    filename: str,
    user: OptionalUser,
    storage: StorageDep,
    image_service: ImageService = Depends(get_image_service),
):
    """Serve generated visuals, including author drafts, using course access."""
    from pathlib import Path

    await AccessService(storage).require_course(course_id, user.id if user else None)
    if any(Path(value).name != value or value in (".", "..") for value in (module_id, filename)):
        raise HTTPException(status_code=404, detail="Image not found")
    root = (image_service.uploads_path / "courses" / course_id).resolve()
    file = (root / module_id / "visuals" / filename).resolve()
    if (
        not file.is_relative_to(root)
        or not file.is_file()
        or file.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
    ):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(file, headers={"Cache-Control": "no-store"})
