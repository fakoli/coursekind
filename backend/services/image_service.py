"""Image service - handles image uploads, downloads, and markdown rewriting."""

import warnings
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import aiofiles
from PIL import Image, UnidentifiedImageError

from exceptions import ErrorCode, StudyBuddyException

# Supported image formats
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB


def validate_raster(content: bytes) -> tuple[str, str]:
    """Validate decoded raster structure, never trust a user filename or MIME type."""
    if len(content) > MAX_IMAGE_SIZE:
        raise StudyBuddyException("Image too large (maximum 10MB)", status_code=400)
    formats = {
        "PNG": (".png", "image/png"),
        "JPEG": (".jpg", "image/jpeg"),
        "GIF": (".gif", "image/gif"),
        "WEBP": (".webp", "image/webp"),
    }
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                result = formats.get(image.format)
                if not result:
                    raise ValueError("Unsupported image")
                image.verify()
            with Image.open(BytesIO(content)) as image:
                image.load()
            return result
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ):
        raise StudyBuddyException(
            "Use a valid PNG, JPEG, GIF or WebP raster image. SVG is unavailable.",
            status_code=400,
            code=ErrorCode.INVALID_IMAGE_FORMAT,
        ) from None


class ImageService:
    """Handles image upload, download from URLs, and markdown rewriting."""

    def __init__(self, uploads_path: str = "./uploads"):
        self.uploads_path = Path(uploads_path)
        self.uploads_path.mkdir(parents=True, exist_ok=True)

    def get_course_images_path(self, course_id: str) -> Path:
        """Get the images directory for a course."""
        images_path = self.uploads_path / "courses" / course_id / "images"
        images_path.mkdir(parents=True, exist_ok=True)
        return images_path

    async def upload_image(self, file_content: bytes, filename: str, course_id: str) -> str:
        """Upload an image file and return the local URL.

        Args:
            file_content: Image bytes
            filename: Original filename
            course_id: Course ID for organizing uploads

        Returns:
            Local URL path for the image

        Raises:
            StudyBuddyException: If file format is invalid or too large
        """
        # Validate extension
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise StudyBuddyException(
                f"Invalid image format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
                status_code=400,
                code=ErrorCode.INVALID_IMAGE_FORMAT,
            )

        # Validate size
        if len(file_content) > MAX_IMAGE_SIZE:
            raise StudyBuddyException(
                f"Image too large. Maximum size: {MAX_IMAGE_SIZE // 1024 // 1024}MB",
                status_code=400,
                code=ErrorCode.VALIDATION_ERROR,
            )

        ext, _ = validate_raster(file_content)

        # Generate unique filename
        unique_filename = f"{uuid4()}{ext}"
        images_path = self.get_course_images_path(course_id)
        file_path = images_path / unique_filename

        # Write file
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(file_content)

        # Return local URL
        return f"/api/v1/uploads/courses/{course_id}/images/{unique_filename}"

    async def download_external_image(self, url: str, course_id: str) -> str:
        """Server URL imports are disabled; the browser may render remote references."""
        raise StudyBuddyException(
            "Server image URL import is disabled. "
            "Upload a raster file or insert a remote image reference.",
            status_code=400,
            code=ErrorCode.IMAGE_DOWNLOAD_FAILED,
        )

    async def process_markdown(self, content: str, course_id: str) -> str:
        """Keep browser-rendered image references without server network access."""
        return content

    def get_image_path(self, course_id: str, filename: str) -> Path | None:
        """Get the full path to an uploaded image.

        Args:
            course_id: Course ID
            filename: Image filename

        Returns:
            Path to the image file, or None if not found
        """
        # Validate filename (security: prevent path traversal)
        if "/" in filename or "\\" in filename or ".." in filename:
            return None

        images_path = self.uploads_path / "courses" / course_id / "images"
        file_path = images_path / filename

        if file_path.exists():
            return file_path

        return None

    async def delete_course_images(self, course_id: str) -> None:
        """Delete all images for a course.

        Args:
            course_id: Course ID
        """
        images_path = self.uploads_path / "courses" / course_id

        if images_path.exists():
            import shutil

            shutil.rmtree(images_path)
