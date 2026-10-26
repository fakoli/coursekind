from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CourseInstructions(BaseModel):
    """AI instructions for generating course content."""

    purpose: str = Field(..., min_length=1, description="What is this course for?")
    target_audience: str = Field(..., min_length=1, description="Who is this course for?")
    learning_objectives: list[str] = Field(
        default_factory=list, description="What will learners achieve?"
    )
    tone: str = Field(
        default="Technical but approachable, visual-first",
        description="Writing tone and style",
    )
    additional_context: str | None = Field(
        default=None, description="Any other guidance for AI generation"
    )


class CourseBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    thumbnail_url: str | None = None
    difficulty: Literal["beginner", "intermediate", "advanced"] = "beginner"
    tags: list[str] = Field(default_factory=list)


class CourseCreate(CourseBase):
    visibility: Literal["private", "unlisted", "public"] = "private"
    ai_enabled: bool = False
    instructions: CourseInstructions | None = None


class CourseUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    tags: list[str] | None = None
    visibility: Literal["private", "unlisted", "public"] | None = None
    ai_enabled: bool | None = None
    instructions: CourseInstructions | None = None


class Course(CourseBase):
    id: str
    visibility: Literal["private", "unlisted", "public"] = "private"
    source: Literal["filesystem", "database"] = "database"

    # Authorship
    author_id: str
    author_name: str

    # AI generation
    ai_enabled: bool = False
    instructions: CourseInstructions | None = None

    # Stats
    times_added: int = 0
    own_path_count: int = 0
    other_path_count: int = 0

    # Timestamps
    created_at: datetime
    updated_at: datetime


class CourseResponse(Course):
    module_count: int = 0


class CourseDiscoveryFilters(BaseModel):
    q: str | None = None
    tags: list[str] | None = None
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None
    author_id: str | None = None
    sort: Literal["popular", "newest", "alphabetical"] = "popular"
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


class CourseDiscoveryResponse(BaseModel):
    courses: list[CourseResponse]
    total: int
    page: int
    limit: int
    total_pages: int
