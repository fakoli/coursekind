"""Models for AI-powered content generation."""

from typing import Literal

from pydantic import BaseModel, Field

from models.module import FlashcardData, QuizData


class ModuleSuggestion(BaseModel):
    """AI-suggested module for a course."""

    title: str
    description: str
    objectives: list[str] = Field(default_factory=list)
    suggested: bool = True  # True if AI suggested, False if user-added


class GenerationRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=128)


class SuggestModulesRequest(GenerationRequest):
    """Request to generate module suggestions for a course."""

    module_count: int = Field(default=8, ge=1, le=20)

    course_id: str = Field(..., description="Course ID to suggest modules for")


class SuggestModulesResponse(BaseModel):
    """Response containing module suggestions."""

    suggestions: list[ModuleSuggestion]
    tokens_used: int


class GenerateModuleContentRequest(GenerationRequest):
    """Request to generate full module content."""

    course_id: str = Field(..., description="Course ID the module belongs to")
    module_title: str = Field(..., min_length=1, description="Title for the module")
    module_prompt: str = Field(
        ..., min_length=10, description="Prompt describing what this module should cover"
    )
    generate_flashcards: bool = True
    flashcard_count: int = Field(default=15, ge=1, le=50)
    generate_quiz: bool = True
    quiz_question_count: int = Field(default=10, ge=1, le=30)


class GeneratedModuleContent(BaseModel):
    """Generated content for a module."""

    content_markdown: str
    flashcards: list[FlashcardData] = Field(default_factory=list)
    quiz: QuizData | None = None
    suggested_visuals: list[str] = Field(
        default_factory=list, description="Descriptions for images to generate"
    )
    tokens_used: int


class GenerateFlashcardsRequest(GenerationRequest):
    """Request to generate flashcards from module content."""

    course_id: str = Field(..., description="Course ID for context")
    module_id: str = Field(..., description="Module ID to generate flashcards for")
    count: int = Field(default=15, ge=1, le=50, description="Number of flashcards to generate")


class GenerateFlashcardsResponse(BaseModel):
    """Response containing generated flashcards."""

    flashcards: list[FlashcardData]
    tokens_used: int


class GenerateQuizRequest(GenerationRequest):
    """Request to generate a quiz from module content."""

    course_id: str = Field(..., description="Course ID for context")
    module_id: str = Field(..., description="Module ID to generate quiz for")
    question_count: int = Field(default=10, ge=1, le=30, description="Number of questions")


class GenerateQuizResponse(BaseModel):
    """Response containing generated quiz."""

    quiz: QuizData
    tokens_used: int


class GenerateVisualRequest(GenerationRequest):
    """Request to generate a visual/image using AI."""

    course_id: str = Field(..., description="Course ID for storage path")
    module_id: str = Field(..., description="Module ID for storage path")
    description: str = Field(..., min_length=10, description="Description of the image to generate")
    style: Literal[
        "educational_diagram",
        "technical_illustration",
        "flowchart",
        "infographic",
        "conceptual",
    ] = Field(default="educational_diagram")
    model: Literal["flash", "pro"] = Field(
        default="flash", description="Image model: flash (fast) or pro (high quality)"
    )
    aspect: Literal["square", "landscape", "portrait"] = Field(default="landscape")


class GeneratedVisual(BaseModel):
    """Generated visual/image result."""

    description: str
    local_path: str
    url: str  # URL to access the image via API
    markdown_reference: str  # e.g., ![diagram](url)
    tokens_used: int


class GenerateFullCourseRequest(GenerationRequest):
    """Request to generate a complete course with all content.

    Uses the course orchestrator to execute a multi-phase generation pipeline.
    """

    replace_existing: bool = False
    expected_module_ids: list[str] | None = None

    course_id: str = Field(..., description="Course ID to generate content for")

    # Module planning options
    suggest_modules: bool = Field(
        default=True, description="Generate module structure from course instructions"
    )
    module_count: int = Field(default=8, ge=1, le=20, description="Target number of modules")

    # Content generation options
    generate_content: bool = Field(default=True, description="Generate markdown content")
    max_concurrent_modules: int = Field(
        default=3, ge=1, le=5, description="Parallel module generation limit"
    )

    # Enrichment options
    generate_flashcards: bool = Field(default=True, description="Generate flashcards")
    flashcard_count_per_module: int = Field(
        default=10, ge=1, le=50, description="Flashcards per module"
    )
    generate_quiz: bool = Field(default=True, description="Generate quizzes")
    quiz_questions_per_module: int = Field(
        default=5, ge=1, le=30, description="Quiz questions per module"
    )

    # Visual generation options
    generate_visuals: bool = Field(
        default=False, description="Generate educational images (currently unavailable)"
    )
    max_visuals_per_module: int = Field(default=2, ge=0, le=5, description="Max visuals per module")

    # Optional pre-existing suggestions (skip planning phase)
    module_suggestions: list[ModuleSuggestion] | None = Field(
        default=None,
        description="Optional module suggestions to use instead of generating new ones",
    )


class ModuleGenerationStatus(BaseModel):
    """Status of individual module generation."""

    module_id: str
    title: str
    success: bool
    tokens_used: int = 0
    error: str | None = None
    flashcard_count: int = 0
    has_quiz: bool = False


class GenerateFullCourseResponse(BaseModel):
    """Response from full course generation.

    Includes detailed status for each phase and module.
    """

    course_id: str
    phase: str = Field(
        description="Final phase: planning/content/enrichment/visuals/finalization/completed/failed"
    )
    modules_generated: int
    modules_failed: int
    total_tokens_used: int
    visuals_generated: int = 0
    visuals_failed: int = 0
    module_statuses: list[ModuleGenerationStatus] = Field(default_factory=list)
    error: str | None = None
    duration_seconds: float | None = None
