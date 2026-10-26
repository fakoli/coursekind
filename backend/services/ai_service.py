from functools import wraps

from pydantic import BaseModel, Field

from config import Settings
from exceptions import AIServiceException
from services.ai_provider import ProviderClient
from services.auth_service import AuthService
from services.generation_operation import GenerationOperation, active_provider
from storage.base import StorageBackend


class CoachingRequest(BaseModel):
    request_id: str | None = Field(default=None, min_length=1, max_length=128)


class ExplainRequest(CoachingRequest):
    concept: str
    context: str | None = None


class HintRequest(CoachingRequest):
    question: str
    current_answer: str | None = None
    hint_level: int = 1


class ExamplesRequest(CoachingRequest):
    concept: str
    num_examples: int = 3


class SimplifyRequest(CoachingRequest):
    content: str


class AIResponse(BaseModel):
    content: str
    tokens_used: int


def accounted(operation, cost):
    def decorate(method):
        @wraps(method)
        async def wrapped(self, user_id, request):
            return await GenerationOperation(self.storage, self.settings).run(
                user_id,
                operation,
                request,
                cost,
                AIResponse,
                lambda: method(self, user_id, request),
            )

        return wrapped

    return decorate


class AIService:
    def __init__(self, storage: StorageBackend, settings: Settings):
        self.storage = storage
        self.settings = settings
        self.auth_service = AuthService(storage, settings)

    async def _call_ai(self, prompt: str, system_prompt: str | None = None) -> str:
        provider = ProviderClient(self.settings)
        snapshot = active_provider.get()
        if snapshot.model not in await provider.models(snapshot):
            raise AIServiceException(
                "Selected model is unavailable. Choose another model in Settings."
            )
        return await provider.complete(
            snapshot, prompt, system_prompt or "You are a helpful study assistant.", 4096
        )

    @accounted("explain", 5)
    async def explain(self, user_id: str, request: ExplainRequest) -> AIResponse:
        """Explain a concept."""
        tokens_cost = 5

        prompt = f"Explain the following concept clearly and concisely:\n\n{request.concept}"
        if request.context:
            prompt += f"\n\nContext: {request.context}"

        system = (
            "You are a patient tutor explaining concepts to a learner. "
            "Use simple language, provide examples, and break down complex ideas. "
            "Use bullet points and structure for clarity."
        )

        # Call AI first - only consume tokens on success
        content = await self._call_ai(prompt, system)
        if not isinstance(content, str) or not content.strip():
            raise AIServiceException("Provider returned empty output")

        return AIResponse(content=content, tokens_used=tokens_cost)

    @accounted("hint", 3)
    async def hint(self, user_id: str, request: HintRequest) -> AIResponse:
        """Provide a progressive hint."""
        tokens_cost = 3

        hint_instructions = {
            1: "Give a subtle hint without revealing the answer.",
            2: "Give a moderate hint that narrows down the possibilities.",
            3: "Give a strong hint that still requires some thinking.",
        }

        level = min(max(request.hint_level, 1), 3)

        prompt = f"Question: {request.question}\n\n{hint_instructions[level]}"
        if request.current_answer:
            prompt += f"\n\nThe learner's current attempt: {request.current_answer}"

        system = (
            "You are a Socratic tutor. Guide learners toward the answer "
            "without simply giving it away. Encourage thinking."
        )

        # Call AI first - only consume tokens on success
        content = await self._call_ai(prompt, system)
        if not isinstance(content, str) or not content.strip():
            raise AIServiceException("Provider returned empty output")

        return AIResponse(content=content, tokens_used=tokens_cost)

    @accounted("examples", 5)
    async def examples(self, user_id: str, request: ExamplesRequest) -> AIResponse:
        """Generate examples for a concept."""
        tokens_cost = 5

        prompt = (
            f"Generate {request.num_examples} clear, practical examples "
            f"demonstrating the concept: {request.concept}\n\n"
            "Make each example distinct and progressively more complex."
        )

        system = (
            "You are an educational content creator. "
            "Create examples that are relatable, memorable, and instructive."
        )

        # Call AI first - only consume tokens on success
        content = await self._call_ai(prompt, system)
        if not isinstance(content, str) or not content.strip():
            raise AIServiceException("Provider returned empty output")

        return AIResponse(content=content, tokens_used=tokens_cost)

    @accounted("simplify", 4)
    async def simplify(self, user_id: str, request: SimplifyRequest) -> AIResponse:
        """Simplify complex content."""
        tokens_cost = 4

        prompt = (
            f"Simplify the following content for a beginner learner:\n\n{request.content}\n\n"
            "Use simpler words, shorter sentences, and analogies where helpful."
        )

        system = (
            "You are an expert at making complex topics accessible. "
            "Explain like you're talking to a curious 12-year-old."
        )

        # Call AI first - only consume tokens on success
        content = await self._call_ai(prompt, system)
        if not isinstance(content, str) or not content.strip():
            raise AIServiceException("Provider returned empty output")

        return AIResponse(content=content, tokens_used=tokens_cost)
