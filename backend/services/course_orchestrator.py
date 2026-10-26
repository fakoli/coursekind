"""Course Orchestrator - Multi-phase course generation pipeline.

Orchestrates the generation of a complete course with parallel execution
for maximum efficiency. Coordinates multiple services to generate:
1. Module structure (planning)
2. Module content (parallel markdown generation)
3. Flashcards and quizzes (parallel enrichment)
4. Educational visuals (batch image generation)

Expected performance:
- 60-70% latency reduction through parallel execution
- Token optimization through model routing
- Automatic progress tracking and error recovery
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from config import Settings
from exceptions import AIServiceException, ErrorCode, NotFoundException
from logging_config import get_logger
from models.ai_generation import (
    GenerateModuleContentRequest,
    GenerateVisualRequest,
    ModuleSuggestion,
    SuggestModulesRequest,
)
from models.module import FlashcardData, ModuleCreate, QuizData

if TYPE_CHECKING:
    from models.course import Course
    from services.ai_generation_service import AIGenerationService
    from services.module_service import ModuleService
    from storage.base import StorageBackend
from services.access_service import AccessService

logger = get_logger(__name__)


class GenerationPhase(str, Enum):
    """Phases of full course generation."""

    PLANNING = "planning"
    CONTENT = "content"
    ENRICHMENT = "enrichment"
    VISUALS = "visuals"
    FINALIZATION = "finalization"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ModuleGenerationResult:
    """Result for a single module's generation."""

    module_id: str
    title: str
    success: bool
    content_markdown: str = ""
    flashcards: list[FlashcardData] = field(default_factory=list)
    quiz: QuizData | None = None
    suggested_visuals: list[str] = field(default_factory=list)
    tokens_used: int = 0
    error: str | None = None


@dataclass
class FullCourseGenerationResult:
    """Result of full course generation."""

    course_id: str
    phase: GenerationPhase
    modules_generated: int
    modules_failed: int
    total_tokens_used: int
    visuals_generated: int
    visuals_failed: int
    module_results: list[ModuleGenerationResult] = field(default_factory=list)
    error: str | None = None

    # Timing information
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @property
    def duration_seconds(self) -> float | None:
        """Get generation duration in seconds."""
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None


@dataclass
class GenerationOptions:
    """Options for full course generation."""

    # Module planning
    suggest_modules: bool = True
    module_count: int = 8  # Target number of modules

    # Content generation
    generate_content: bool = True
    max_concurrent_modules: int = 3  # Parallel content generation limit

    # Enrichment
    generate_flashcards: bool = True
    flashcard_count_per_module: int = 10
    generate_quiz: bool = True
    quiz_questions_per_module: int = 5

    # Visuals
    generate_visuals: bool = False
    max_visuals_per_module: int = 2


class CourseOrchestrator:
    """Orchestrates multi-phase course generation.

    Coordinates AI generation services and module services to create
    a complete course with all content, flashcards, quizzes, and visuals.

    Uses parallel execution where possible to minimize total generation time.

    Usage:
        orchestrator = CourseOrchestrator(
            storage=storage,
            settings=settings,
            ai_service=ai_service,
            module_service=module_service,
        )

        result = await orchestrator.generate_full_course(
            user_id="user-123",
            course_id="course-456",
            options=GenerationOptions(generate_visuals=True),
        )

        if result.phase == GenerationPhase.COMPLETED:
            print(f"Generated {result.modules_generated} modules")
    """

    def __init__(
        self,
        storage: "StorageBackend",
        settings: Settings,
        ai_service: "AIGenerationService",
        module_service: "ModuleService",
    ):
        self.storage = storage
        self.settings = settings
        self.ai_service = ai_service
        self.module_service = module_service

    async def generate_full_course(
        self,
        user_id: str,
        course_id: str,
        options: GenerationOptions | None = None,
        module_suggestions: list[ModuleSuggestion] | None = None,
    ) -> FullCourseGenerationResult:
        """Generate a complete course with all content.

        Args:
            user_id: User ID for token management
            course_id: ID of the course to generate content for
            options: Generation options (defaults provided if not specified)
            module_suggestions: Optional pre-existing module suggestions to use
                instead of generating new ones

        Returns:
            FullCourseGenerationResult with generation status and details

        Phases:
            1. Planning: Generate module structure (if not provided)
            2. Content: Parallel markdown generation for each module
            3. Enrichment: Parallel flashcards and quiz generation
            4. Visuals: Batch image generation (optional)
            5. Finalization: Save all modules to database
        """
        await AccessService(self.storage).require_course_owner(course_id, user_id)
        options = options or GenerationOptions()
        result = FullCourseGenerationResult(
            course_id=course_id,
            phase=GenerationPhase.PLANNING,
            modules_generated=0,
            modules_failed=0,
            total_tokens_used=0,
            visuals_generated=0,
            visuals_failed=0,
            started_at=datetime.now(timezone.utc),
        )

        try:
            # Verify course exists and is AI-enabled
            course = await self._get_course(course_id)
            if not course.ai_enabled:
                raise AIServiceException(
                    "AI generation is not enabled for this course",
                    code=ErrorCode.AI_SERVICE_ERROR,
                )

            logger.info(
                "Starting full course generation",
                user_id=user_id,
                course_id=course_id,
                options=options.__dict__,
            )

            # Phase 1: Planning - Generate module structure
            if module_suggestions is None and options.suggest_modules:
                result.phase = GenerationPhase.PLANNING
                module_suggestions, tokens = await self._phase_planning(
                    user_id, course_id, options.module_count
                )
                result.total_tokens_used += tokens

            if not module_suggestions:
                raise AIServiceException(
                    "No module suggestions available",
                    code=ErrorCode.AI_SERVICE_ERROR,
                )

            # Phase 2: Content - Parallel module content generation
            if options.generate_content:
                result.phase = GenerationPhase.CONTENT
                module_results, tokens = await self._phase_content(
                    user_id,
                    course,
                    module_suggestions,
                    options,
                )
                result.module_results = module_results
                result.total_tokens_used += tokens

                # Count successes and failures
                result.modules_generated = sum(1 for r in module_results if r.success)
                result.modules_failed = sum(1 for r in module_results if not r.success)

            # Phase 3: Enrichment - Already done in content phase
            # (generate_module_content generates flashcards and quiz)
            result.phase = GenerationPhase.ENRICHMENT

            # Phase 4: Visuals - Batch image generation
            if options.generate_visuals:
                result.phase = GenerationPhase.VISUALS
                visuals_success, visuals_failed, tokens = await self._phase_visuals(
                    user_id, course_id, result.module_results, options
                )
                result.visuals_generated = visuals_success
                result.visuals_failed = visuals_failed
                result.total_tokens_used += tokens

            # Phase 5: Finalization - Save modules to database
            result.phase = GenerationPhase.FINALIZATION
            await self._phase_finalization(course_id, user_id, result.module_results)

            result.phase = GenerationPhase.COMPLETED
            result.completed_at = datetime.now(timezone.utc)

            logger.info(
                "Full course generation completed",
                course_id=course_id,
                modules_generated=result.modules_generated,
                modules_failed=result.modules_failed,
                total_tokens=result.total_tokens_used,
                duration_seconds=result.duration_seconds,
            )

        except Exception as e:
            result.phase = GenerationPhase.FAILED
            result.error = str(e)
            result.completed_at = datetime.now(timezone.utc)

            logger.error(
                "Full course generation failed",
                course_id=course_id,
                phase=result.phase.value,
                error_type=type(e).__name__,
                error_message=str(e),
            )

            # Re-raise AI-specific exceptions
            if isinstance(e, AIServiceException):
                raise

        return result

    async def _get_course(self, course_id: str) -> "Course":
        """Get course by ID."""
        from models.course import Course

        course_data = await self.storage.get("courses", course_id)
        if not course_data:
            raise NotFoundException(
                "Course not found",
                code=ErrorCode.COURSE_NOT_FOUND,
            )
        return Course(**course_data)

    async def _phase_planning(
        self,
        user_id: str,
        course_id: str,
        module_count: int,
    ) -> tuple[list[ModuleSuggestion], int]:
        """Phase 1: Generate module structure.

        Returns:
            Tuple of (module_suggestions, tokens_used)
        """
        logger.info("Phase 1: Planning - generating module structure")

        request = SuggestModulesRequest(course_id=course_id)
        response = await self.ai_service.suggest_modules(user_id, request)

        # Limit to requested count
        suggestions = response.suggestions[:module_count]

        logger.info(
            "Planning complete",
            modules_suggested=len(suggestions),
            tokens_used=response.tokens_used,
        )

        return suggestions, response.tokens_used

    async def _phase_content(
        self,
        user_id: str,
        course: "Course",
        suggestions: list[ModuleSuggestion],
        options: GenerationOptions,
    ) -> tuple[list[ModuleGenerationResult], int]:
        """Phase 2: Generate content for all modules in parallel.

        Returns:
            Tuple of (module_results, total_tokens_used)
        """
        logger.info(
            "Phase 2: Content - generating module content",
            module_count=len(suggestions),
            max_concurrent=options.max_concurrent_modules,
        )

        semaphore = asyncio.Semaphore(options.max_concurrent_modules)

        async def generate_module_content(
            suggestion: ModuleSuggestion,
        ) -> ModuleGenerationResult:
            """Generate content for a single module."""
            module_id = str(uuid4())

            async with semaphore:
                try:
                    request = GenerateModuleContentRequest(
                        course_id=course.id,
                        module_title=suggestion.title,
                        module_prompt=suggestion.description,
                        generate_flashcards=options.generate_flashcards,
                        generate_quiz=options.generate_quiz,
                        flashcard_count=options.flashcard_count_per_module,
                        quiz_question_count=options.quiz_questions_per_module,
                    )

                    result = await self.ai_service.generate_module_content(user_id, request)

                    logger.debug(
                        "Module content generated",
                        module_title=suggestion.title,
                        tokens_used=result.tokens_used,
                    )

                    return ModuleGenerationResult(
                        module_id=module_id,
                        title=suggestion.title,
                        success=True,
                        content_markdown=result.content_markdown,
                        flashcards=result.flashcards,
                        quiz=result.quiz,
                        suggested_visuals=result.suggested_visuals,
                        tokens_used=result.tokens_used,
                    )

                except Exception as e:
                    logger.error(
                        "Module content generation failed",
                        module_title=suggestion.title,
                        error_type=type(e).__name__,
                        error_message=str(e),
                    )

                    return ModuleGenerationResult(
                        module_id=module_id,
                        title=suggestion.title,
                        success=False,
                        error=str(e),
                    )

        # Execute all module generations in parallel
        tasks = [generate_module_content(suggestion) for suggestion in suggestions]
        results = await asyncio.gather(*tasks)

        total_tokens = sum(r.tokens_used for r in results)

        logger.info(
            "Phase 2: Content complete",
            modules_successful=sum(1 for r in results if r.success),
            modules_failed=sum(1 for r in results if not r.success),
            total_tokens=total_tokens,
        )

        return list(results), total_tokens

    async def _phase_visuals(
        self,
        user_id: str,
        course_id: str,
        module_results: list[ModuleGenerationResult],
        options: GenerationOptions,
    ) -> tuple[int, int, int]:
        """Phase 4: Generate visuals for modules in batch.

        Returns:
            Tuple of (visuals_success, visuals_failed, tokens_used)
        """
        # Collect all visual requests
        visual_requests: list[GenerateVisualRequest] = []

        for result in module_results:
            if not result.success:
                continue

            # Take up to max_visuals_per_module suggestions
            for visual_desc in result.suggested_visuals[: options.max_visuals_per_module]:
                visual_requests.append(
                    GenerateVisualRequest(
                        course_id=course_id,
                        module_id=result.module_id,
                        description=visual_desc,
                        style="educational_diagram",
                    )
                )

        if not visual_requests:
            logger.info("Phase 4: Visuals skipped - no visual suggestions")
            return 0, 0, 0

        logger.info(
            "Phase 4: Visuals - generating images",
            visual_count=len(visual_requests),
        )

        # Use batch generation
        results = await self.ai_service.generate_visuals_batch(user_id, visual_requests)

        success_count = sum(1 for r in results if not isinstance(r, Exception))
        failed_count = len(results) - success_count
        tokens_used = sum(
            r.tokens_used
            for r in results
            if not isinstance(r, Exception) and hasattr(r, "tokens_used")
        )

        logger.info(
            "Phase 4: Visuals complete",
            visuals_success=success_count,
            visuals_failed=failed_count,
            tokens_used=tokens_used,
        )

        return success_count, failed_count, tokens_used

    async def _phase_finalization(
        self,
        course_id: str,
        user_id: str,
        module_results: list[ModuleGenerationResult],
    ) -> None:
        """Phase 5: Save all generated modules to database.

        Uses batch create for efficiency.
        """
        # Filter to successful modules only
        successful_modules = [r for r in module_results if r.success]

        if not successful_modules:
            logger.info("Phase 5: Finalization skipped - no successful modules")
            return

        logger.info(
            "Phase 5: Finalization - saving modules",
            module_count=len(successful_modules),
        )

        # Build ModuleCreate objects
        modules_to_create = [
            ModuleCreate(
                title=result.title,
                order_index=i,
                content_markdown=result.content_markdown,
                flashcards=result.flashcards,
                quiz=result.quiz,
            )
            for i, result in enumerate(successful_modules)
        ]

        # Use batch create
        await self.module_service.batch_create_modules(course_id, user_id, modules_to_create)

        logger.info(
            "Phase 5: Finalization complete",
            modules_saved=len(modules_to_create),
        )


def get_course_orchestrator(
    storage: "StorageBackend",
    settings: Settings,
) -> CourseOrchestrator:
    """Factory function to create CourseOrchestrator with dependencies.

    Args:
        storage: Storage backend instance
        settings: Application settings

    Returns:
        Configured CourseOrchestrator instance
    """
    from services.ai_generation_service import AIGenerationService
    from services.module_service import ModuleService

    ai_service = AIGenerationService(storage, settings)
    module_service = ModuleService(storage)

    return CourseOrchestrator(
        storage=storage,
        settings=settings,
        ai_service=ai_service,
        module_service=module_service,
    )
