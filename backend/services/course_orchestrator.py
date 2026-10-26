"""Stage complete courses, then atomically persist modules, result and accounting."""

import asyncio
import time

from exceptions import AIServiceException, ConflictException
from models.ai_generation import (
    GenerateFullCourseResponse,
    GenerateModuleContentRequest,
    ModuleGenerationStatus,
    SuggestModulesRequest,
)
from models.module import ModuleCreate
from services.access_service import AccessService
from services.ai_generation_service import TOKEN_COSTS, AIGenerationService
from services.generation_operation import GenerationOperation
from services.module_service import ModuleService


class CourseOrchestrator:
    def __init__(self, storage, settings, ai_service, module_service):
        self.storage = storage
        self.settings = settings
        self.ai_service = ai_service
        self.module_service = module_service

    async def generate_request(self, user_id, request):
        async def access():
            await AccessService(self.storage).require_course_owner(request.course_id, user_id)

        await access()
        if request.generate_visuals:
            raise AIServiceException(
                "Image generation is unavailable; disable visuals to generate this course"
            )
        supplied = request.module_suggestions
        if supplied is not None and not 1 <= len(supplied) <= 20:
            raise AIServiceException("Select between 1 and 20 modules")
        planning = supplied is None and request.suggest_modules
        count = len(supplied) if supplied is not None else request.module_count
        cost = (TOKEN_COSTS["suggest_modules"] if planning else 0) + (
            count * TOKEN_COSTS["generate_content"] if request.generate_content else 0
        )
        staged = []
        started = time.monotonic()

        async def action():
            suggestions = supplied
            if planning:
                result = await self.ai_service.stage_suggestions(
                    user_id, SuggestModulesRequest(course_id=request.course_id, module_count=count)
                )
                suggestions = result.suggestions
            if not suggestions:
                raise AIServiceException("No module suggestions supplied")
            semaphore = asyncio.Semaphore(request.max_concurrent_modules)

            async def stage(suggestion):
                data = ModuleCreate(
                    title=suggestion.title,
                    description=suggestion.description,
                    objectives=suggestion.objectives,
                    order_index=0,
                )
                if request.generate_content:
                    async with semaphore:
                        generated = await self.ai_service.stage_content(
                            user_id,
                            GenerateModuleContentRequest(
                                course_id=request.course_id,
                                module_title=suggestion.title,
                                module_prompt=f"{suggestion.description}\nObjectives: "
                                + "; ".join(suggestion.objectives),
                                generate_flashcards=request.generate_flashcards,
                                flashcard_count=request.flashcard_count_per_module,
                                generate_quiz=request.generate_quiz,
                                quiz_question_count=request.quiz_questions_per_module,
                            ),
                        )
                    data.content_markdown = generated.content_markdown
                    data.flashcards = generated.flashcards
                    data.quiz = generated.quiz
                return data

            # Collect all outcomes before raising; no background work survives failure.
            outcomes = await asyncio.gather(
                *(stage(s) for s in suggestions), return_exceptions=True
            )
            for outcome in outcomes:
                if isinstance(outcome, BaseException):
                    raise outcome
                staged.append(outcome)
            return GenerateFullCourseResponse(
                course_id=request.course_id,
                phase="completed",
                modules_generated=len(staged),
                modules_failed=0,
                total_tokens_used=0,
                duration_seconds=round(time.monotonic() - started, 3),
            )

        async def save(result):
            current = await self.storage.list("modules", {"course_id": request.course_id})
            if request.expected_module_ids is not None and set(request.expected_module_ids) != {
                m["id"] for m in current
            }:
                raise ConflictException(
                    "Course modules changed. Refresh before applying suggestions."
                )
            start = (
                0
                if request.replace_existing
                else max((m["order_index"] for m in current), default=-1) + 1
            )
            created = []
            for index, data in enumerate(staged):
                data.order_index = start + index
                created.append(
                    await self.module_service.create_module(request.course_id, user_id, data)
                )
            if request.replace_existing:
                for module in current:
                    await self.storage.delete("modules", module["id"])
            result.module_statuses = [
                ModuleGenerationStatus(
                    module_id=m.id,
                    title=m.title,
                    success=True,
                    flashcard_count=len(m.flashcards),
                    has_quiz=m.quiz is not None,
                )
                for m in created
            ]
            return result

        return await GenerationOperation(self.storage, self.settings).run(
            user_id,
            "generate_full_course",
            request,
            cost,
            GenerateFullCourseResponse,
            action,
            access=access,
            save=save,
        )


def get_course_orchestrator(storage, settings):
    return CourseOrchestrator(
        storage, settings, AIGenerationService(storage, settings), ModuleService(storage)
    )
