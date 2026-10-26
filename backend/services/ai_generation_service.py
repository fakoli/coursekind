"""AI Generation Service for course content creation.

Generates module structure, content, flashcards, quizzes, and visuals
using the self-hosted Anvil Serving router (OpenAI-compatible) for text.

Optimizations:
- Course context caching (30-min TTL) to reduce redundant context building
- Request deduplication for concurrent identical requests
- Model routing to use appropriate models for different task complexities
"""

import asyncio
import functools
import json
import re
import time
from pathlib import Path
from typing import Callable, ParamSpec, TypeVar
from uuid import uuid4

from config import Settings
from exceptions import AIServiceException, ErrorCode, InsufficientTokensException, NotFoundException
from logging_config import clear_operation_context, get_logger, set_operation_context
from models.ai_generation import (
    GeneratedModuleContent,
    GeneratedVisual,
    GenerateFlashcardsRequest,
    GenerateFlashcardsResponse,
    GenerateModuleContentRequest,
    GenerateQuizRequest,
    GenerateQuizResponse,
    GenerateVisualRequest,
    ModuleSuggestion,
    SuggestModulesRequest,
    SuggestModulesResponse,
)
from models.course import Course
from models.module import FlashcardData, Module, QuizData, QuizQuestionData
from services.access_service import AccessService
from services.anvil_client import get_anvil_client
from services.auth_service import AuthService
from services.base_service import BaseService
from services.course_service import CourseService
from services.module_service import ModuleService
from services.request_deduplication import get_request_deduplicator
from storage.base import StorageBackend

logger = get_logger(__name__)

# Type variables for the decorator
P = ParamSpec("P")
R = TypeVar("R")


def log_ai_operation(
    operation_name: str,
    resource_type: str | None = None,
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator to log AI operations with timing and context.

    Args:
        operation_name: Name of the operation for logging
        resource_type: Type of resource being operated on (e.g., "course", "module")
    """

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            # Extract context from arguments
            # First arg is self, second is user_id, third is request
            user_id = args[1] if len(args) > 1 else kwargs.get("user_id")
            request = args[2] if len(args) > 2 else kwargs.get("request")

            # Extract resource_id from request if available
            resource_id = None
            if request and hasattr(request, "course_id"):
                resource_id = request.course_id
            elif request and hasattr(request, "module_id"):
                resource_id = request.module_id

            # Set operation context
            set_operation_context(
                operation=operation_name,
                user_id=user_id,
                resource_type=resource_type,
                resource_id=resource_id,
            )

            start_time = time.perf_counter()
            logger.info(f"AI operation started: {operation_name}")

            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000

                # Extract tokens_used from result if available
                tokens_used = getattr(result, "tokens_used", None)

                logger.info(
                    f"AI operation completed: {operation_name}",
                    duration_ms=round(duration_ms, 2),
                    tokens_used=tokens_used,
                )
                return result

            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                logger.error(
                    f"AI operation failed: {operation_name}",
                    duration_ms=round(duration_ms, 2),
                    error_type=type(e).__name__,
                    error_message=str(e),
                )
                raise

            finally:
                clear_operation_context()

        return wrapper

    return decorator


# Token costs for each operation
TOKEN_COSTS = {
    "suggest_modules": 10,
    "generate_content": 25,
    "generate_flashcards": 8,
    "generate_quiz": 10,
    "generate_visual": 5,
}


class AIGenerationService(BaseService):
    """Generates course content using AI.

    Uses the self-hosted Anvil Serving router (OpenAI-compatible) for text
    generation. No external API keys are required.

    Optimizations:
    - Course context caching (30-min TTL) to reduce redundant context building
    - Request deduplication for concurrent identical requests
    """

    # Course context cache TTL (30 minutes)
    CONTEXT_CACHE_TTL_SECONDS = 1800

    def __init__(
        self,
        storage: StorageBackend,
        settings: Settings,
        content_path: str = "./content/courses",
        uploads_path: str = "./uploads",
    ):
        super().__init__(storage)
        self.settings = settings
        self.content_path = Path(content_path)
        self.uploads_path = Path(uploads_path)
        self.auth_service = AuthService(storage, settings)

        # Course context cache: course_id -> (context_string, expiry_time)
        self._course_context_cache: dict[str, tuple[str, float]] = {}
        self._deduplicator = get_request_deduplicator()

    async def _check_token_balance(self, user_id: str, amount: int) -> None:
        """Check if user has sufficient tokens."""
        balance = await self.auth_service.get_token_balance(user_id)
        if balance < amount:
            raise InsufficientTokensException(
                f"Insufficient tokens. Required: {amount}, Available: {balance}"
            )

    async def _consume_tokens(self, user_id: str, amount: int) -> None:
        """Consume tokens after successful AI operation."""
        await self.auth_service.consume_tokens(user_id, amount)

    async def _call_llm(
        self,
        prompt: str,
        system_prompt: str,
        max_tokens: int = 4096,
    ) -> str:
        """Call the Anvil router for text generation.

        Args:
            prompt: The user prompt to send
            system_prompt: The system prompt for context
            max_tokens: Maximum tokens in response

        Raises:
            AIServiceException: If the router is not configured or the call fails.
        """
        client = get_anvil_client(self.settings)
        if not client.is_configured:
            logger.error("AI service not configured: missing Anvil router settings")
            raise AIServiceException(
                "AI service not configured: ANVIL_ROUTER_BASE_URL and ANVIL_ROUTER_TOKEN required",
                code=ErrorCode.AI_SERVICE_UNAVAILABLE,
            )

        model = self.settings.anvil_model
        prompt_length = len(prompt)
        system_length = len(system_prompt)

        logger.debug(
            "Anvil router call starting",
            model=model,
            max_tokens=max_tokens,
            prompt_length=prompt_length,
            system_length=system_length,
        )

        return await client.complete(
            prompt,
            system_prompt=system_prompt,
            model=model,
            max_tokens=max_tokens,
        )

    def _build_course_context(self, course: Course) -> str:
        """Build context string from course instructions with caching.

        Caches the context for 30 minutes to avoid rebuilding for repeated
        operations on the same course.
        """
        # Check cache first
        cached = self._course_context_cache.get(course.id)
        if cached:
            context, expiry = cached
            if time.monotonic() < expiry:
                logger.debug("Using cached course context", course_id=course.id)
                return context
            # Expired, remove from cache
            del self._course_context_cache[course.id]

        # Build context
        if not course.instructions:
            context = (
                f"Course: {course.title}\nDescription: {course.description or 'No description'}"
            )
        else:
            inst = course.instructions
            context = f"""Course: {course.title}
Description: {course.description or "No description"}
Difficulty: {course.difficulty}

PURPOSE: {inst.purpose}
TARGET AUDIENCE: {inst.target_audience}
TONE: {inst.tone}

LEARNING OBJECTIVES:
{chr(10).join(f"- {obj}" for obj in inst.learning_objectives)}
"""
            if inst.additional_context:
                context += f"\nADDITIONAL CONTEXT: {inst.additional_context}"

        # Cache the context
        expiry = time.monotonic() + self.CONTEXT_CACHE_TTL_SECONDS
        self._course_context_cache[course.id] = (context, expiry)
        logger.debug("Cached course context", course_id=course.id)

        return context

    def invalidate_course_context_cache(self, course_id: str) -> None:
        """Invalidate cached context for a course.

        Should be called when course instructions are updated.
        """
        if course_id in self._course_context_cache:
            del self._course_context_cache[course_id]
            logger.debug("Invalidated course context cache", course_id=course_id)

    async def _get_course(self, course_id: str) -> Course:
        """Get a course by ID from database."""
        course_data = await self.storage.get("courses", course_id)
        if not course_data:
            raise NotFoundException(
                "Course not found",
                code=ErrorCode.COURSE_NOT_FOUND,
                details={"course_id": course_id},
            )
        return Course(**course_data)

    async def _get_module(self, course_id: str, module_id: str) -> Module:
        """Get a module by ID from database."""
        module_data = await self.storage.get("modules", module_id)
        if not module_data or module_data.get("course_id") != course_id:
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
                details={"module_id": module_id},
            )
        return Module(**module_data)

    @log_ai_operation("suggest_modules", resource_type="course")
    async def suggest_modules(
        self, user_id: str, request: SuggestModulesRequest
    ) -> SuggestModulesResponse:
        """Generate suggested module structure based on course instructions.

        Args:
            user_id: User ID for token management
            request: Request containing course_id

        Returns:
            SuggestModulesResponse with list of suggested modules
        """
        await AccessService(self.storage).require_course_owner(request.course_id, user_id)
        cost = TOKEN_COSTS["suggest_modules"]
        await self._check_token_balance(user_id, cost)

        # Get course with instructions
        course = await CourseService(self.storage).get_course(request.course_id, user_id)
        if not course.ai_enabled:
            raise AIServiceException(
                "AI generation is not enabled for this course",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        context = self._build_course_context(course)

        system_prompt = """You are an expert curriculum designer. Your task is to suggest
a logical module structure for an educational course.

Output a JSON array of modules. Each module should have:
- title: A clear, descriptive title
- description: 1-2 sentences explaining what this module covers
- objectives: 2-4 specific learning objectives

Consider logical progression from fundamental concepts to advanced topics.
Ensure modules build upon each other appropriately.

IMPORTANT: Output ONLY valid JSON, no additional text."""

        prompt = f"""Based on the following course information, suggest 6-10 modules
that would comprehensively cover the subject matter.

{context}

Output format:
[
  {{
    "title": "Module Title",
    "description": "Brief description of what this module covers",
    "objectives": ["Objective 1", "Objective 2", "Objective 3"]
  }},
  ...
]"""

        response = await self._call_llm(prompt, system_prompt)
        await self._consume_tokens(user_id, cost)

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r"\[.*\]", response, re.DOTALL)
            if json_match:
                modules_data = json.loads(json_match.group())
            else:
                modules_data = json.loads(response)

            suggestions = [
                ModuleSuggestion(
                    title=m.get("title", "Untitled Module"),
                    description=m.get("description", ""),
                    objectives=m.get("objectives", []),
                    suggested=True,
                )
                for m in modules_data
            ]
        except (json.JSONDecodeError, KeyError) as e:
            raise AIServiceException(
                f"Failed to parse AI response: {e}",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        return SuggestModulesResponse(suggestions=suggestions, tokens_used=cost)

    @log_ai_operation("generate_content", resource_type="course")
    async def generate_module_content(
        self, user_id: str, request: GenerateModuleContentRequest
    ) -> GeneratedModuleContent:
        """Generate full module content: markdown, flashcards, and quiz.

        Args:
            user_id: User ID for token management
            request: Request with course_id, module_title, module_prompt, and options

        Returns:
            GeneratedModuleContent with markdown, flashcards, quiz, and visual suggestions
        """
        await AccessService(self.storage).require_course_owner(request.course_id, user_id)
        cost = TOKEN_COSTS["generate_content"]
        await self._check_token_balance(user_id, cost)

        # Get course with instructions
        course = await CourseService(self.storage).get_course(request.course_id, user_id)
        if not course.ai_enabled:
            raise AIServiceException(
                "AI generation is not enabled for this course",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        context = self._build_course_context(course)

        system_prompt = """You are an expert educational content writer. Create comprehensive
learning material that is engaging, clear, and pedagogically sound.

Your output should be a JSON object with the following structure:
{
  "content_markdown": "Full markdown content for the module...",
  "flashcards": [
    {"front": "Question or term", "back": "Answer or definition"},
    ...
  ],
  "quiz": {
    "questions": [
      {
        "question": "Question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_index": 0,
        "explanation": "Why this is correct"
      },
      ...
    ]
  },
  "suggested_visuals": [
    "Description of a diagram that would help explain concept X",
    ...
  ]
}

Guidelines for content:
- Use clear headings and subheadings
- Include code examples where appropriate (use proper markdown code blocks)
- Add practical examples and real-world applications
- Break complex concepts into digestible pieces
- Use bullet points and lists for clarity

Guidelines for flashcards:
- Focus on key concepts, definitions, and important facts
- Make questions clear and specific
- Keep answers concise but complete

Guidelines for quiz:
- Test understanding, not memorization
- Include a mix of difficulty levels
- Write clear, unambiguous questions
- Provide educational explanations

IMPORTANT: Output ONLY valid JSON, no additional text."""

        flashcard_instruction = ""
        if request.generate_flashcards:
            flashcard_instruction = f"\n- Generate {request.flashcard_count} flashcards"
        else:
            flashcard_instruction = "\n- Do not generate flashcards (set to empty array)"

        quiz_instruction = ""
        if request.generate_quiz:
            quiz_instruction = f"\n- Generate a quiz with {request.quiz_question_count} questions"
        else:
            quiz_instruction = "\n- Do not generate quiz (set to null)"

        prompt = f"""Create learning content for the following module.

COURSE CONTEXT:
{context}

MODULE TITLE: {request.module_title}

MODULE PROMPT (what this module should cover):
{request.module_prompt}

Requirements:
- Create comprehensive markdown content (1500-3000 words){flashcard_instruction}{quiz_instruction}
- Suggest 2-4 visuals/diagrams that would enhance learning

Output the complete JSON object as specified."""

        response = await self._call_llm(prompt, system_prompt, max_tokens=8192)
        await self._consume_tokens(user_id, cost)

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r"\{.*\}", response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = json.loads(response)

            # Parse flashcards
            flashcards = []
            if request.generate_flashcards and "flashcards" in data:
                for card in data["flashcards"]:
                    flashcards.append(
                        FlashcardData(
                            front=card.get("front", ""),
                            back=card.get("back", ""),
                        )
                    )

            # Parse quiz
            quiz = None
            if request.generate_quiz and "quiz" in data and data["quiz"]:
                questions = []
                for q in data["quiz"].get("questions", []):
                    questions.append(
                        QuizQuestionData(
                            question=q.get("question", ""),
                            options=q.get("options", []),
                            correct_index=q.get("correct_index", 0),
                            explanation=q.get("explanation"),
                        )
                    )
                quiz = QuizData(questions=questions)

            return GeneratedModuleContent(
                content_markdown=data.get("content_markdown", ""),
                flashcards=flashcards,
                quiz=quiz,
                suggested_visuals=data.get("suggested_visuals", []),
                tokens_used=cost,
            )

        except (json.JSONDecodeError, KeyError) as e:
            raise AIServiceException(
                f"Failed to parse AI response: {e}",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

    @log_ai_operation("generate_flashcards", resource_type="module")
    async def generate_flashcards(
        self, user_id: str, request: GenerateFlashcardsRequest
    ) -> GenerateFlashcardsResponse:
        """Generate flashcards from existing module content.

        Args:
            user_id: User ID for token management
            request: Request with course_id, module_id, and count

        Returns:
            GenerateFlashcardsResponse with list of flashcards
        """
        await AccessService(self.storage).require_course(request.course_id, user_id)
        cost = TOKEN_COSTS["generate_flashcards"]
        await self._check_token_balance(user_id, cost)

        # Get course and module
        course = await CourseService(self.storage).get_course(request.course_id, user_id)
        module = await ModuleService(self.storage).get_module(
            request.course_id, request.module_id, user_id
        )

        context = self._build_course_context(course)

        system_prompt = """You are an expert at creating educational flashcards.
Create flashcards that test understanding of key concepts.

Output a JSON array of flashcards:
[
  {"front": "Question or term", "back": "Answer or definition"},
  ...
]

Guidelines:
- Focus on key concepts, definitions, and important facts
- Make questions clear and specific
- Keep answers concise but complete
- Vary the types of questions (definitions, applications, comparisons)
- Ensure cards are self-contained and understandable

IMPORTANT: Output ONLY valid JSON, no additional text."""

        prompt = f"""Create {request.count} flashcards based on the following module content.

COURSE CONTEXT:
{context}

MODULE: {module.title}

MODULE CONTENT:
{module.content_markdown[:8000]}  # Limit content length for prompt

Generate {request.count} high-quality flashcards that cover the key concepts in this module."""

        response = await self._call_llm(prompt, system_prompt)
        await self._consume_tokens(user_id, cost)

        # Parse JSON response
        try:
            json_match = re.search(r"\[.*\]", response, re.DOTALL)
            if json_match:
                cards_data = json.loads(json_match.group())
            else:
                cards_data = json.loads(response)

            flashcards = [
                FlashcardData(
                    front=card.get("front", ""),
                    back=card.get("back", ""),
                )
                for card in cards_data
            ]

        except (json.JSONDecodeError, KeyError) as e:
            raise AIServiceException(
                f"Failed to parse AI response: {e}",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        return GenerateFlashcardsResponse(flashcards=flashcards, tokens_used=cost)

    @log_ai_operation("generate_quiz", resource_type="module")
    async def generate_quiz(
        self, user_id: str, request: GenerateQuizRequest
    ) -> GenerateQuizResponse:
        """Generate a quiz from existing module content.

        Args:
            user_id: User ID for token management
            request: Request with course_id, module_id, and question_count

        Returns:
            GenerateQuizResponse with quiz data
        """
        await AccessService(self.storage).require_course(request.course_id, user_id)
        cost = TOKEN_COSTS["generate_quiz"]
        await self._check_token_balance(user_id, cost)

        # Get course and module
        course = await CourseService(self.storage).get_course(request.course_id, user_id)
        module = await ModuleService(self.storage).get_module(
            request.course_id, request.module_id, user_id
        )

        context = self._build_course_context(course)

        # Include existing flashcards for context
        flashcards_context = ""
        if module.flashcards:
            flashcards_context = "\n\nEXISTING FLASHCARDS:\n"
            for i, card in enumerate(module.flashcards[:10], 1):
                flashcards_context += f"{i}. Q: {card.front} A: {card.back}\n"

        system_prompt = """You are an expert at creating educational quizzes.
Create multiple-choice questions that test understanding, not just memorization.

Output a JSON object with quiz questions:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Why this is correct"
    },
    ...
  ]
}

Guidelines:
- Test understanding, not memorization
- Include a mix of difficulty levels
- Write clear, unambiguous questions
- Make all options plausible (avoid obviously wrong answers)
- Provide educational explanations
- Use 4 options per question

IMPORTANT: Output ONLY valid JSON, no additional text."""

        prompt = f"""Create a {request.question_count}-question quiz based on this module content.

COURSE CONTEXT:
{context}

MODULE: {module.title}

MODULE CONTENT:
{module.content_markdown[:8000]}{flashcards_context}

Generate {request.question_count} high-quality multiple-choice questions."""

        response = await self._call_llm(prompt, system_prompt)
        await self._consume_tokens(user_id, cost)

        # Parse JSON response
        try:
            json_match = re.search(r"\{.*\}", response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = json.loads(response)

            questions = []
            for q in data.get("questions", []):
                questions.append(
                    QuizQuestionData(
                        question=q.get("question", ""),
                        options=q.get("options", []),
                        correct_index=q.get("correct_index", 0),
                        explanation=q.get("explanation"),
                    )
                )
            quiz = QuizData(questions=questions)

        except (json.JSONDecodeError, KeyError) as e:
            raise AIServiceException(
                f"Failed to parse AI response: {e}",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        return GenerateQuizResponse(quiz=quiz, tokens_used=cost)

    @log_ai_operation("generate_visual", resource_type="module")
    async def generate_visual(
        self, user_id: str, request: GenerateVisualRequest
    ) -> GeneratedVisual:
        """Generate a visual/image using the Anvil router's vision tier.

        Args:
            user_id: User ID for token management
            request: Request with description, style, model, and aspect

        Returns:
            GeneratedVisual with path and markdown reference
        """
        await AccessService(self.storage).require_course_owner(request.course_id, user_id)
        cost = TOKEN_COSTS["generate_visual"]
        await self._check_token_balance(user_id, cost)

        client = get_anvil_client(self.settings)
        if not client.is_configured:
            raise AIServiceException(
                "Image generation not configured: ANVIL_ROUTER_BASE_URL and "
                "ANVIL_ROUTER_TOKEN required",
                code=ErrorCode.AI_SERVICE_UNAVAILABLE,
            )

        # Map style to description
        style_descriptions = {
            "educational_diagram": "clean, minimalist educational diagram with white background",
            "technical_illustration": "detailed technical illustration with labels",
            "flowchart": "clear flowchart with boxes and arrows",
            "infographic": "informative infographic with icons and text",
            "conceptual": "abstract conceptual illustration",
        }
        style_desc = style_descriptions.get(request.style, "educational diagram")

        aspect_sizes = {
            "square": "square (1:1)",
            "landscape": "landscape (16:9)",
            "portrait": "portrait (9:16)",
        }
        aspect_desc = aspect_sizes.get(request.aspect, "landscape (16:9)")

        # Build the image prompt
        image_prompt = f"""{request.description}

Style: {style_desc}
Aspect ratio: {aspect_desc}
Requirements:
- Clean, professional design
- White or light background
- Suitable for studying and learning
- Clear and easy to understand
- No text that might be misspelled
"""

        # Ensure directory exists
        image_dir = (
            self.uploads_path / "courses" / request.course_id / request.module_id / "visuals"
        )
        image_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        filename = f"{uuid4()}.png"
        output_path = image_dir / filename

        try:
            result = await client.generate_image(
                image_prompt,
                model=self.settings.anvil_image_model,
            )

            if not result:
                raise AIServiceException(
                    "Image generation failed: empty response from vision model",
                    code=ErrorCode.AI_SERVICE_ERROR,
                )

            # Persist whatever the vision tier returned. If it produced an
            # image URL (data URI or http), keep the reference; if it produced
            # text (a detailed description), save that as a .txt fallback so
            # downstream rendering still has something to show.
            if result.startswith("data:image") or result.startswith("http"):
                output_path.write_text(result)
            else:
                text_path = image_dir / f"{uuid4()}.txt"
                text_path.write_text(result)
                output_path = text_path

        except AIServiceException:
            raise
        except Exception as e:
            logger.error(
                "Image generation error",
                error_type=type(e).__name__,
                error_message=str(e),
            )
            raise AIServiceException(
                f"Image generation error: {e}",
                code=ErrorCode.AI_SERVICE_ERROR,
            )

        # Consume tokens on success
        await self._consume_tokens(user_id, cost)

        # Build response
        url = (
            f"/api/v1/uploads/courses/{request.course_id}/{request.module_id}"
            f"/visuals/{output_path.name}"
        )
        markdown_ref = f"![{request.description[:50]}]({url})"

        return GeneratedVisual(
            description=request.description,
            local_path=str(output_path),
            url=url,
            markdown_reference=markdown_ref,
            tokens_used=cost,
        )

    async def generate_visuals_batch(
        self, user_id: str, requests: list[GenerateVisualRequest]
    ) -> list[GeneratedVisual | Exception]:
        """Generate multiple images in parallel with rate limiting.

        Args:
            user_id: User ID for token management
            requests: List of visual generation requests

        Returns:
            List of GeneratedVisual objects or Exception for failed generations.
            The order matches the input requests.

        Note:
            Uses a semaphore to limit concurrent image generations to avoid
            overwhelming the Gemini API. Failed generations return the
            exception instead of raising, allowing partial success.
        """
        if not requests:
            return []

        # Limit concurrent image generations
        semaphore = asyncio.Semaphore(2)

        async def generate_with_semaphore(
            request: GenerateVisualRequest,
        ) -> GeneratedVisual | Exception:
            async with semaphore:
                try:
                    return await self.generate_visual(user_id, request)
                except Exception as e:
                    logger.error(
                        "Batch visual generation failed for item",
                        description=request.description[:50],
                        error_type=type(e).__name__,
                        error_message=str(e),
                    )
                    return e

        # Execute all requests in parallel with semaphore limiting
        tasks = [generate_with_semaphore(req) for req in requests]
        results = await asyncio.gather(*tasks)

        # Log summary
        success_count = sum(1 for r in results if not isinstance(r, Exception))
        logger.info(
            "Batch visual generation completed",
            total=len(requests),
            success=success_count,
            failed=len(requests) - success_count,
        )

        return list(results)
