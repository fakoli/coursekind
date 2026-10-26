"""Module service - manages module CRUD for database courses."""

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from exceptions import ErrorCode, ForbiddenException, NotFoundException, StudyBuddyException
from models.module import (
    FlashcardData,
    Module,
    ModuleCreate,
    ModuleSummary,
    ModuleUpdate,
    QuizData,
    QuizQuestionData,
)
from services.access_service import AccessService
from services.base_service import BaseService
from storage.base import StorageBackend


class ModuleService(BaseService):
    """Manages module CRUD operations for database courses."""

    def __init__(self, storage: StorageBackend, content_path: str = "./content/courses"):
        super().__init__(storage)
        self.content_path = Path(content_path)

    async def get_module(
        self, course_id: str, module_id: str, user_id: str | None = None
    ) -> Module:
        """Get a module by ID.

        For filesystem courses, reads from disk.
        For database courses, reads from storage.
        """
        course_data = await AccessService(self.storage, str(self.content_path)).require_course(
            course_id, user_id
        )
        if course_data.get("source") == "filesystem":
            return await self._get_filesystem_module(course_id, module_id)

        # Get database module
        module_data = await self.storage.get("modules", module_id)
        if not module_data or module_data.get("course_id") != course_id:
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )

        return self._parse_module(module_data)

    async def list_modules(self, course_id: str) -> list[ModuleSummary]:
        """List all modules for a course as summaries."""
        # Check if filesystem course
        course_path = self.content_path / course_id
        if course_path.exists():
            return await self._list_filesystem_modules(course_id)

        # List database modules
        modules_data = await self.storage.list("modules", {"course_id": course_id})
        modules = []

        for module_data in sorted(modules_data, key=lambda x: x.get("order_index", 0)):
            flashcards = module_data.get("flashcards", [])
            quiz = module_data.get("quiz")

            modules.append(
                ModuleSummary(
                    id=module_data["id"],
                    title=module_data["title"],
                    description=module_data.get("description", ""),
                    order_index=module_data.get("order_index", 0),
                    flashcard_count=len(flashcards) if flashcards else 0,
                    has_quiz=quiz is not None and len(quiz.get("questions", [])) > 0,
                )
            )

        return modules

    async def create_module(self, course_id: str, user_id: str, data: ModuleCreate) -> Module:
        """Create a new module in a database course."""
        # Verify course ownership (call raises if not authorized)
        await self._get_editable_course(course_id, user_id)

        now = datetime.now(timezone.utc)

        module = Module(
            id=str(uuid4()),
            course_id=course_id,
            title=data.title,
            description=data.description,
            order_index=data.order_index,
            content_markdown=data.content_markdown,
            flashcards=data.flashcards,
            quiz=data.quiz,
            sandbox=data.sandbox,
            created_at=now,
            updated_at=now,
        )

        await self.storage.create("modules", module.model_dump(mode="json"))
        return module

    async def batch_create_modules(
        self, course_id: str, user_id: str, modules: list[ModuleCreate]
    ) -> list[Module]:
        """Create multiple modules using batch storage operation."""
        await self._get_editable_course(course_id, user_id)

        now = datetime.now(timezone.utc)
        module_data_list = []

        for data in modules:
            module = Module(
                id=str(uuid4()),
                course_id=course_id,
                title=data.title,
                description=data.description,
                order_index=data.order_index,
                content_markdown=data.content_markdown,
                flashcards=data.flashcards,
                quiz=data.quiz,
                sandbox=data.sandbox,
                created_at=now,
                updated_at=now,
            )
            module_data_list.append(module.model_dump(mode="json"))

        results = await self.storage.batch_create("modules", module_data_list)
        return [self._parse_module(r) for r in results]

    async def update_module(
        self, course_id: str, module_id: str, user_id: str, data: ModuleUpdate
    ) -> Module:
        """Update a module in a database course."""
        # Verify course ownership
        await self._get_editable_course(course_id, user_id)

        # Get existing module
        module_data = await self.storage.get("modules", module_id)
        if not module_data or module_data.get("course_id") != course_id:
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )

        # Apply updates
        updates = data.model_dump(exclude_unset=True, mode="json")
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        updated_data = await self.storage.update("modules", module_id, updates)
        if not updated_data:
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )

        return self._parse_module(updated_data)

    async def delete_module(self, course_id: str, module_id: str, user_id: str) -> bool:
        """Delete a module from a database course."""
        # Verify course ownership
        await self._get_editable_course(course_id, user_id)

        # Verify module belongs to course
        module_data = await self.storage.get("modules", module_id)
        if not module_data or module_data.get("course_id") != course_id:
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )

        return await self.storage.delete("modules", module_id)

    async def reorder_modules(
        self, course_id: str, user_id: str, module_ids: list[str]
    ) -> list[ModuleSummary]:
        """Reorder modules in a course."""
        async with self.storage.transaction():
            # Verify course ownership
            await self._get_editable_course(course_id, user_id)

            # Get all modules for this course
            modules_data = await self.storage.list("modules", {"course_id": course_id})
            module_ids_set = {m["id"] for m in modules_data}

            if len(module_ids) != len(module_ids_set) or set(module_ids) != module_ids_set:
                raise StudyBuddyException(
                    "Module IDs must match existing membership exactly",
                    code=ErrorCode.INVALID_MODULE_ORDER,
                )
            # Verify all provided IDs belong to this course
            for idx, module_id in enumerate(module_ids):
                if module_id not in module_ids_set:
                    raise NotFoundException(
                        f"Module {module_id} not found in course",
                        code=ErrorCode.MODULE_NOT_FOUND,
                    )
                # Update order
                await self.storage.update("modules", module_id, {"order_index": idx})

            # Return updated summaries
            return await self.list_modules(course_id)

    # Private helpers

    async def _get_editable_course(self, course_id: str, user_id: str) -> dict:
        """Verify user can edit this course."""
        course_data = await self.storage.get("courses", course_id)

        if not course_data:
            # Check if filesystem course
            course_path = self.content_path / course_id
            if course_path.exists():
                raise ForbiddenException(
                    "Filesystem courses cannot be edited",
                    code=ErrorCode.COURSE_NOT_EDITABLE,
                )
            raise NotFoundException(
                "Course not found",
                code=ErrorCode.COURSE_NOT_FOUND,
            )

        if course_data.get("source") == "filesystem":
            raise ForbiddenException(
                "Filesystem courses cannot be edited",
                code=ErrorCode.COURSE_NOT_EDITABLE,
            )

        if course_data.get("author_id") != user_id:
            raise ForbiddenException(
                "Access denied",
                code=ErrorCode.ACCESS_DENIED,
            )

        return course_data

    async def _get_filesystem_module(self, course_id: str, module_id: str) -> Module:
        """Load a module from filesystem."""
        if Path(module_id).name != module_id or module_id in (".", ".."):
            raise NotFoundException("Module not found")
        module_path = self.content_path / course_id / "modules" / module_id

        if not module_path.exists():
            raise NotFoundException(
                "Module not found",
                code=ErrorCode.MODULE_NOT_FOUND,
            )

        # Read content
        content = ""
        content_file = module_path / "content.md"
        if content_file.exists():
            with open(content_file) as f:
                content = f.read()

        # Read flashcards
        flashcards = []
        flashcards_file = module_path / "flashcards.json"
        if flashcards_file.exists():
            with open(flashcards_file) as f:
                data = json.load(f)
                for card in data.get("cards", []):
                    flashcards.append(
                        FlashcardData(
                            front=card.get("front", ""),
                            back=card.get("back", ""),
                            visual=card.get("visual"),
                        )
                    )

        # Read quiz
        quiz = None
        quiz_file = module_path / "quiz.json"
        if quiz_file.exists():
            with open(quiz_file) as f:
                quiz_data = json.load(f)
                questions = []
                for q in quiz_data.get("questions", []):
                    questions.append(
                        QuizQuestionData(
                            question=q.get("question", ""),
                            options=q.get("options", []),
                            correct_index=q.get("correct_index", 0),
                            explanation=q.get("explanation"),
                        )
                    )
                quiz = QuizData(questions=questions)

        # Determine order from directory name
        order_index = 0
        try:
            # Extract number prefix from module_id (e.g., "01-complexity" -> 1)
            prefix = module_id.split("-")[0]
            order_index = int(prefix) - 1  # 0-indexed
        except (ValueError, IndexError):
            pass

        # Generate a readable title from module_id
        title = module_id.replace("-", " ").title()
        # Remove leading numbers and whitespace
        title = title.lstrip("0123456789 ")

        return Module(
            id=module_id,
            course_id=course_id,
            title=title,
            order_index=order_index,
            content_markdown=content,
            flashcards=flashcards,
            quiz=quiz,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

    async def _list_filesystem_modules(self, course_id: str) -> list[ModuleSummary]:
        """List module summaries from filesystem."""
        modules = []
        modules_path = self.content_path / course_id / "modules"

        if not modules_path.exists():
            return modules

        for idx, module_dir in enumerate(sorted(modules_path.iterdir())):
            if not module_dir.is_dir():
                continue

            flashcard_count = 0
            has_quiz = False

            # Count flashcards
            flashcards_path = module_dir / "flashcards.json"
            if flashcards_path.exists():
                try:
                    with open(flashcards_path) as f:
                        data = json.load(f)
                        flashcard_count = len(data.get("cards", []))
                except (json.JSONDecodeError, KeyError):
                    pass

            # Check for quiz
            quiz_path = module_dir / "quiz.json"
            has_quiz = quiz_path.exists()

            # Generate title from directory name
            title = module_dir.name.replace("-", " ").title()
            title = title.lstrip("0123456789 ")

            modules.append(
                ModuleSummary(
                    id=module_dir.name,
                    title=title,
                    order_index=idx,
                    flashcard_count=flashcard_count,
                    has_quiz=has_quiz,
                )
            )

        return modules

    def _parse_module(self, data: dict) -> Module:
        """Parse module data from storage into Module model."""
        flashcards = []
        for card in data.get("flashcards", []):
            if isinstance(card, dict):
                flashcards.append(FlashcardData(**card))
            else:
                flashcards.append(card)

        quiz = None
        if data.get("quiz"):
            quiz_data = data["quiz"]
            if isinstance(quiz_data, dict):
                questions = []
                for q in quiz_data.get("questions", []):
                    if isinstance(q, dict):
                        questions.append(QuizQuestionData(**q))
                    else:
                        questions.append(q)
                quiz = QuizData(questions=questions)
            else:
                quiz = quiz_data

        return Module(
            id=data["id"],
            course_id=data["course_id"],
            title=data["title"],
            description=data.get("description", ""),
            order_index=data.get("order_index", 0),
            content_markdown=data.get("content_markdown", ""),
            flashcards=flashcards,
            quiz=quiz,
            created_at=data.get("created_at", datetime.now(timezone.utc)),
            sandbox=data.get("sandbox"),
            updated_at=data.get("updated_at", datetime.now(timezone.utc)),
        )
