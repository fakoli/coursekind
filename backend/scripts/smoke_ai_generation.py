"""Opt-in real Anvil smoke, disposable storage only. Run from backend/."""

import asyncio
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dotenv import load_dotenv

load_dotenv(Path.home() / ".env")

from config import Settings
from models.ai_generation import SuggestModulesRequest, GenerateModuleContentRequest
from models.module import ModuleCreate, ModuleUpdate
from models.course import CourseCreate
from services.course_service import CourseService
from services.module_service import ModuleService
from services.ai_generation_service import AIGenerationService
from storage.json_storage import JSONStorage


async def main():
    with tempfile.TemporaryDirectory(prefix="study-buddy-ai-smoke-") as directory:
        settings = Settings(debug=True, storage_path=directory)
        storage = JSONStorage(directory)
        await storage.create(
            "users", {"id": "smoke-user", "name": "Disposable smoke", "token_balance": 100}
        )
        course = await CourseService(storage).create_course(
            "smoke-user",
            "Disposable smoke",
            CourseCreate(
                title="Python collections",
                description="Lists, tuples, dictionaries for beginners",
                ai_enabled=True,
            ),
        )
        service = AIGenerationService(storage, settings)
        start = time.monotonic()
        outline = await service.suggest_modules(
            "smoke-user",
            SuggestModulesRequest(course_id=course.id, module_count=1, request_id="smoke-outline"),
        )
        outline_duration = time.monotonic() - start
        suggestion = outline.suggestions[0]
        start = time.monotonic()
        generated = await service.generate_module_content(
            "smoke-user",
            GenerateModuleContentRequest(
                course_id=course.id,
                module_title=suggestion.title,
                module_prompt=suggestion.description,
                flashcard_count=2,
                quiz_question_count=2,
                request_id="smoke-module",
            ),
        )
        module_duration = time.monotonic() - start
        modules = ModuleService(storage)
        saved = await modules.create_module(
            course.id,
            "smoke-user",
            ModuleCreate(
                title=suggestion.title,
                description=suggestion.description,
                objectives=suggestion.objectives,
                order_index=0,
                content_markdown=generated.content_markdown,
                flashcards=generated.flashcards,
                quiz=generated.quiz,
            ),
        )
        saved.flashcards[0].back += " (edited smoke check)"
        await modules.update_module(
            course.id, saved.id, "smoke-user", ModuleUpdate(flashcards=saved.flashcards)
        )
        persisted = await modules.get_module(course.id, saved.id, "smoke-user")
        assert persisted.flashcards[0].back.endswith("(edited smoke check)")
        assert len(persisted.quiz.questions) == 2 and len(persisted.flashcards) == 2
        print(
            json.dumps(
                {
                    "model": "llm.primary",
                    "outline_seconds": round(outline_duration, 2),
                    "module_seconds": round(module_duration, 2),
                    "markdown_chars": len(persisted.content_markdown),
                    "cards": len(persisted.flashcards),
                    "questions": len(persisted.quiz.questions),
                    "balance": (await storage.get("users", "smoke-user"))["token_balance"],
                    "editable_save": "passed",
                }
            )
        )


asyncio.run(main())
