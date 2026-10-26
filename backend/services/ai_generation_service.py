"""Validated, staged generation using an immutable per-operation provider selection."""

import asyncio
import json
import re

from pydantic import ValidationError

from exceptions import AIServiceException
from models.ai_generation import (
    GeneratedModuleContent,
    GenerateFlashcardsResponse,
    GenerateQuizResponse,
    ModuleSuggestion,
    SuggestModulesResponse,
)
from models.module import FlashcardData, QuizData
from services.access_service import AccessService
from services.ai_provider import ProviderClient, ProviderOutputError
from services.course_service import CourseService
from services.generation_operation import GenerationOperation, active_provider
from services.module_service import ModuleService

TOKEN_COSTS = {
    "suggest_modules": 10,
    "generate_content": 25,
    "generate_flashcards": 8,
    "generate_quiz": 10,
    "generate_visual": 5,
}


def nonempty(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Required text is empty")
    return value


def validate_cards(data, count):
    if not isinstance(data, list) or len(data) != count:
        raise ValueError("Wrong flashcard count")
    cards = [FlashcardData.model_validate(c) for c in data]
    for card in cards:
        nonempty(card.front)
        nonempty(card.back)
    return cards


def validate_quiz(data, count):
    quiz = QuizData.model_validate(data)
    if len(quiz.questions) != count:
        raise ValueError("Wrong question count")
    for question in quiz.questions:
        nonempty(question.question)
        for option in question.options:
            nonempty(option)
        if question.correct_index >= len(question.options):
            raise ValueError("Invalid answer index")
    return quiz


class AIGenerationService:
    def __init__(
        self,
        storage,
        settings,
        content_path="./content/courses",
        uploads_path="./uploads",
        *,
        repair_provider_output=False,
    ):
        self.storage = storage
        self.repair_provider_output = repair_provider_output
        self.settings = settings
        self.operations = GenerationOperation(storage, settings)
        self.provider = ProviderClient(settings)

    async def _call_llm(self, prompt, system_prompt, max_tokens=4096):
        snapshot = active_provider.get()
        if snapshot is None:
            raise AIServiceException("Missing generation provider context")
        if snapshot.model not in await self.provider.models(snapshot):
            raise AIServiceException(
                "Selected model is unavailable. Choose another model in Settings."
            )
        return await self.provider.complete(snapshot, prompt, system_prompt, max_tokens)

    async def _structured(self, prompt, shape, validate, max_tokens=4096):
        system = (
            "You are an expert educational author. Return ONLY valid JSON "
            f"matching this shape: {shape}. Follow all requested counts exactly. "
            "Use nonempty text and valid zero-based answer indices."
        )
        for attempt in range(2):
            try:
                response = await self._call_llm(prompt, system, max_tokens=max_tokens)
            except ProviderOutputError as exc:
                if (
                    not self.repair_provider_output
                    or exc.reason not in ("incomplete", "malformed", "empty")
                    or attempt == 1
                ):
                    raise
                prompt += "\nRegenerate complete valid JSON; the prior output was incomplete."
                continue
            try:
                text = response.strip()
                if text.startswith("```"):
                    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
                return validate(json.loads(text))
            except (ValueError, KeyError, TypeError, AttributeError, ValidationError):
                if attempt == 1:
                    raise AIServiceException(
                        "AI output failed validation after two attempts. "
                        "No application credits charged."
                    ) from None
                prompt += (
                    "\nPrevious output failed validation. Regenerate complete JSON, "
                    "with exactly the requested counts, nonempty fields, "
                    "and valid answer indices."
                )

    async def _access(self, user_id, request, owner=False):
        access = AccessService(self.storage)
        if owner:
            await access.require_course_owner(request.course_id, user_id)
        else:
            await access.require_course(request.course_id, user_id)
        if getattr(request, "module_id", None):
            await ModuleService(self.storage).get_module(
                request.course_id, request.module_id, user_id
            )

    async def _context(self, user_id, course_id):
        course = await CourseService(self.storage).get_course(course_id, user_id)
        return course, json.dumps(
            {
                "title": course.title,
                "description": course.description,
                "instructions": course.instructions.model_dump() if course.instructions else None,
            }
        )

    def invalidate_course_context_cache(self, course_id):
        pass  # Context is read fresh; edits must be reflected immediately.

    async def _run(self, user_id, request, operation, response, action, owner=False):
        return await self.operations.run(
            user_id,
            operation,
            request,
            TOKEN_COSTS[operation],
            response,
            action,
            access=lambda: self._access(user_id, request, owner),
        )

    async def suggest_modules(self, user_id, request):
        return await self._run(
            user_id,
            request,
            "suggest_modules",
            SuggestModulesResponse,
            lambda: self.stage_suggestions(user_id, request),
            owner=True,
        )

    async def stage_suggestions(self, user_id, request):
        course, context = await self._context(user_id, request.course_id)
        if not course.ai_enabled:
            raise AIServiceException("AI generation is not enabled for this course")
        count = request.module_count

        def validate(data):
            if not isinstance(data, list) or len(data) != count:
                raise ValueError("Wrong module count")
            items = [ModuleSuggestion.model_validate(item) for item in data]
            for item in items:
                nonempty(item.title)
                nonempty(item.description)
                if not 2 <= len(item.objectives) <= 4:
                    raise ValueError("Expected 2–4 objectives")
                for objective in item.objectives:
                    nonempty(objective)
            return items

        suggestions = await self._structured(
            f"Design exactly {count} logically ordered course modules. "
            f"Include 2–4 nonempty learning objectives per module. Course: {context}",
            '[{"title":"Title","description":"Description","objectives":["Objective","Objective"]}]',
            validate,
        )
        return SuggestModulesResponse(suggestions=suggestions, tokens_used=0)

    async def generate_module_content(self, user_id, request):
        return await self._run(
            user_id,
            request,
            "generate_content",
            GeneratedModuleContent,
            lambda: self.stage_content(user_id, request),
            owner=True,
        )

    async def stage_content(self, user_id, request, *, require_enabled=True):
        course, context = await self._context(user_id, request.course_id)
        if require_enabled and not course.ai_enabled:
            raise AIServiceException("AI generation is not enabled for this course")
        prompt = (
            "Create a clear, useful 600–1000 word lesson with examples and headings. "
            f"Course: {context}\nModule: {request.module_title}"
            f"\nRequirements: {request.module_prompt}"
        )

        def validate(data):
            nonempty(data["content_markdown"])
            visuals = data.get("suggested_visuals", [])
            if not isinstance(visuals, list) or any(not isinstance(v, str) for v in visuals):
                raise ValueError("Invalid visual suggestions")
            return data

        data = await self._structured(
            prompt,
            '{"content_markdown":"Markdown lesson", "suggested_visuals":["Diagram"]}',
            validate,
            max_tokens=8192,
        )
        content = data["content_markdown"]
        cards = (
            await self._cards(content, request.flashcard_count)
            if request.generate_flashcards
            else []
        )
        quiz = (
            await self._quiz(content, request.quiz_question_count)
            if request.generate_quiz
            else None
        )
        return GeneratedModuleContent(
            content_markdown=content,
            flashcards=cards,
            quiz=quiz,
            suggested_visuals=data.get("suggested_visuals", []),
            tokens_used=0,
        )

    async def _cards(self, content, count):
        result = []
        for offset in range(0, count, 10):
            size = min(10, count - offset)
            result.extend(
                await self._structured(
                    f"Create exactly {size} distinct flashcards from this lesson. "
                    f"Already covered: {[c.front for c in result]}\n{content[:16000]}",
                    '[{"front":"Question","back":"Answer"}]',
                    lambda d: validate_cards(d, size),
                )
            )
        return result

    async def _quiz(self, content, count):
        questions = []
        for offset in range(0, count, 5):
            size = min(5, count - offset)
            quiz = await self._structured(
                f"Create exactly {size} distinct multiple-choice questions. "
                f"Already covered: {[q.question for q in questions]}"
                f"\nLesson: {content[:16000]}",
                '{"questions":[{"question":"Question","options":["A","B","C","D"],"correct_index":0,"explanation":"Explanation"}]}',
                lambda d: validate_quiz(d, size),
            )
            questions.extend(quiz.questions)
        return QuizData(questions=questions)

    async def generate_flashcards(self, user_id, request):
        async def action():
            module = await ModuleService(self.storage).get_module(
                request.course_id, request.module_id, user_id
            )
            return GenerateFlashcardsResponse(
                flashcards=await self._cards(module.content_markdown, request.count), tokens_used=0
            )

        return await self._run(
            user_id, request, "generate_flashcards", GenerateFlashcardsResponse, action
        )

    async def generate_quiz(self, user_id, request):
        async def action():
            module = await ModuleService(self.storage).get_module(
                request.course_id, request.module_id, user_id
            )
            return GenerateQuizResponse(
                quiz=await self._quiz(module.content_markdown, request.question_count),
                tokens_used=0,
            )

        return await self._run(user_id, request, "generate_quiz", GenerateQuizResponse, action)

    async def generate_visual(self, user_id, request):
        await self._access(user_id, request, owner=True)
        raise AIServiceException(
            "Image generation is unavailable: no image output adapter is configured. "
            "Text models cannot generate saved images."
        )

    async def generate_visuals_batch(self, user_id, requests):
        return list(
            await asyncio.gather(
                *(self.generate_visual(user_id, r) for r in requests), return_exceptions=True
            )
        )
