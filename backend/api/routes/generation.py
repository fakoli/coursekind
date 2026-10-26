"""AI Generation API routes for course content creation."""

from fastapi import APIRouter, Depends

from config import Settings, get_settings
from dependencies import CurrentUser, StorageDep
from models.ai_generation import (
    GeneratedModuleContent,
    GeneratedVisual,
    GenerateFlashcardsRequest,
    GenerateFlashcardsResponse,
    GenerateFullCourseRequest,
    GenerateFullCourseResponse,
    GenerateModuleContentRequest,
    GenerateQuizRequest,
    GenerateQuizResponse,
    GenerateVisualRequest,
    SuggestModulesRequest,
    SuggestModulesResponse,
)
from services.ai_generation_service import AIGenerationService
from services.course_orchestrator import (
    CourseOrchestrator,
    get_course_orchestrator,
)

router = APIRouter(prefix="/generate", tags=["generation"])


def get_generation_service(
    storage: StorageDep,
    settings: Settings = Depends(get_settings),
) -> AIGenerationService:
    """Dependency to create AIGenerationService instance."""
    return AIGenerationService(storage, settings)


def get_orchestrator(
    storage: StorageDep,
    settings: Settings = Depends(get_settings),
) -> CourseOrchestrator:
    """Dependency to create CourseOrchestrator instance."""
    return get_course_orchestrator(storage, settings)


@router.post("/suggest-modules", response_model=SuggestModulesResponse)
async def suggest_modules(
    request: SuggestModulesRequest,
    user: CurrentUser,
    service: AIGenerationService = Depends(get_generation_service),
) -> SuggestModulesResponse:
    """Generate suggested module structure for an AI-enabled course.

    Uses the course's instructions (purpose, audience, objectives) to suggest
    a logical module structure.

    Anvil application-credit cost (BYOK: 0): 10
    """
    return await service.suggest_modules(user.id, request)


@router.post("/module-content", response_model=GeneratedModuleContent)
async def generate_module_content(
    request: GenerateModuleContentRequest,
    user: CurrentUser,
    service: AIGenerationService = Depends(get_generation_service),
) -> GeneratedModuleContent:
    """Generate full module content including markdown, flashcards, and quiz.

    Uses the course's instructions and the provided module prompt to generate
    comprehensive learning content.

    Anvil application-credit cost (BYOK: 0): 25
    """
    return await service.generate_module_content(user.id, request)


@router.post("/flashcards", response_model=GenerateFlashcardsResponse)
async def generate_flashcards(
    request: GenerateFlashcardsRequest,
    user: CurrentUser,
    service: AIGenerationService = Depends(get_generation_service),
) -> GenerateFlashcardsResponse:
    """Generate flashcards from existing module content.

    Creates flashcards based on the module's markdown content and the
    course's instructions.

    Anvil application-credit cost (BYOK: 0): 8
    """
    return await service.generate_flashcards(user.id, request)


@router.post("/quiz", response_model=GenerateQuizResponse)
async def generate_quiz(
    request: GenerateQuizRequest,
    user: CurrentUser,
    service: AIGenerationService = Depends(get_generation_service),
) -> GenerateQuizResponse:
    """Generate a quiz from existing module content.

    Creates multiple-choice questions based on the module's content
    and existing flashcards.

    Anvil application-credit cost (BYOK: 0): 10
    """
    return await service.generate_quiz(user.id, request)


@router.post("/visual", response_model=GeneratedVisual)
async def generate_visual(
    request: GenerateVisualRequest,
    user: CurrentUser,
    service: AIGenerationService = Depends(get_generation_service),
) -> GeneratedVisual:
    """Image generation is unavailable until an image output adapter is configured."""
    return await service.generate_visual(user.id, request)


@router.post("/full-course", response_model=GenerateFullCourseResponse)
async def generate_full_course(
    request: GenerateFullCourseRequest,
    user: CurrentUser,
    orchestrator: CourseOrchestrator = Depends(get_orchestrator),
) -> GenerateFullCourseResponse:
    """Stage all modules, then atomically save with one debit and replayable result.

    Anvil credits: planning 10 when requested, content 25 per module.
    BYOK records successful usage with zero application-credit debit.
    Any staging or finalization failure preserves the previous modules and balance.
    """
    return await orchestrator.generate_request(user.id, request)
