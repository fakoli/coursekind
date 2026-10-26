"""Course service - manages courses from both filesystem and database sources."""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from exceptions import ErrorCode, ForbiddenException, NotFoundException
from models.course import (
    Course,
    CourseCreate,
    CourseDiscoveryFilters,
    CourseDiscoveryResponse,
    CourseResponse,
    CourseUpdate,
)
from models.module import ModuleSummary
from services.access_service import AccessService, can_discover
from services.base_service import BaseService
from services.cache_service import get_cache
from storage.base import StorageBackend


class CourseService(BaseService):
    """Manages courses from both filesystem (read-only) and database (full CRUD)."""

    def __init__(self, storage: StorageBackend, content_path: str = "./content/courses"):
        super().__init__(storage)
        self.content_path = Path(content_path)

    async def list_courses(self, user_id: str | None = None) -> list[CourseResponse]:
        """List all courses accessible to the user.

        Returns:
            - User's own courses (if user_id provided)
            - Public courses
            - Filesystem courses (always visible)
        """
        courses = []

        # Get filesystem courses
        fs_courses = await self._get_filesystem_courses()
        courses.extend(fs_courses)

        # Get database courses
        db_courses = await self._get_database_courses(user_id)
        courses.extend(db_courses)

        await self._set_contributions(courses)
        return courses

    async def list_user_courses(self, user_id: str) -> list[CourseResponse]:
        """List courses authored by a specific user."""
        db_courses = await self.storage.list("courses", {"author_id": user_id})

        if not db_courses:
            return []

        # Batch get module counts to avoid N+1 queries
        course_ids = [c["id"] for c in db_courses]
        module_counts = await self._batch_get_module_counts(course_ids)

        courses = [
            CourseResponse(**course_data, module_count=module_counts.get(course_data["id"], 0))
            for course_data in db_courses
        ]
        await self._set_contributions(courses)
        return courses

    async def discover_courses(self, filters: CourseDiscoveryFilters) -> CourseDiscoveryResponse:
        """Browse public courses with search and filters."""
        all_courses = []

        # Get public filesystem courses
        fs_courses = await self._get_filesystem_courses()
        all_courses.extend(fs_courses)

        # Get public database courses
        db_courses_data = await self.storage.list("courses", {"visibility": "public"})

        # Batch get module counts to avoid N+1 queries
        if db_courses_data:
            course_ids = [c["id"] for c in db_courses_data]
            module_counts = await self._batch_get_module_counts(course_ids)

            for course_data in db_courses_data:
                module_count = module_counts.get(course_data["id"], 0)
                all_courses.append(CourseResponse(**course_data, module_count=module_count))

        await self._set_contributions(all_courses)

        # Apply filters
        filtered = self._apply_discovery_filters(all_courses, filters)

        # Sort
        sorted_courses = self._sort_courses(filtered, filters.sort)

        # Paginate
        total = len(sorted_courses)
        start = (filters.page - 1) * filters.limit
        end = start + filters.limit
        page_courses = sorted_courses[start:end]

        total_pages = (total + filters.limit - 1) // filters.limit if total > 0 else 1

        return CourseDiscoveryResponse(
            courses=page_courses,
            total=total,
            page=filters.page,
            limit=filters.limit,
            total_pages=total_pages,
        )

    async def get_course(self, course_id: str, user_id: str | None = None) -> Course:
        """Get a course by ID.

        Args:
            course_id: Course ID
            user_id: Optional user ID for access check

        Returns:
            Course if found and accessible

        Raises:
            NotFoundException: If course not found or not accessible
        """
        course_data = await AccessService(self.storage, str(self.content_path)).require_course(
            course_id, user_id
        )
        if course_data.get("source") == "filesystem":
            course = await self._get_filesystem_course(course_id)
            await self._set_contributions([course])
            return course

        course = Course(**course_data)
        await self._set_contributions([course])
        return course

    async def get_course_with_modules(
        self, course_id: str, user_id: str | None = None
    ) -> tuple[Course, list[ModuleSummary]]:
        """Get a course with its module summaries."""
        course = await self.get_course(course_id, user_id)

        if course.source == "filesystem":
            modules = await self._get_filesystem_modules(course_id)
        else:
            modules = await self._get_database_modules(course_id)

        return course, modules

    async def create_course(self, user_id: str, user_name: str, data: CourseCreate) -> Course:
        """Create a new database course."""
        now = datetime.now(timezone.utc)

        course = Course(
            id=str(uuid4()),
            title=data.title,
            description=data.description,
            thumbnail_url=data.thumbnail_url,
            difficulty=data.difficulty,
            tags=data.tags,
            visibility=data.visibility,
            source="database",
            author_id=user_id,
            author_name=user_name,
            ai_enabled=data.ai_enabled,
            instructions=data.instructions,
            times_added=0,
            created_at=now,
            updated_at=now,
        )

        await self.storage.create("courses", course.model_dump(mode="json"))

        # Invalidate user's course list cache
        self._invalidate_user_courses_cache(user_id)

        return course

    async def update_course(self, course_id: str, user_id: str, data: CourseUpdate) -> Course:
        """Update a database course (author only)."""
        # Verify ownership (call raises if not authorized)
        await self._get_editable_course(course_id, user_id)

        # Apply updates
        updates = data.model_dump(exclude_unset=True, mode="json")
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        updated_data = await self.storage.update("courses", course_id, updates)
        if not updated_data:
            raise NotFoundException(
                "Course not found",
                code=ErrorCode.COURSE_NOT_FOUND,
            )

        # Invalidate cache
        self._invalidate_course_cache(course_id)

        course = Course(**updated_data)
        await self._set_contributions([course])
        return course

    async def delete_course(self, course_id: str, user_id: str) -> bool:
        """Delete a database course and all its modules (author only)."""
        # Verify ownership
        await self._get_editable_course(course_id, user_id)

        # Delete all modules first
        modules = await self.storage.list("modules", {"course_id": course_id})
        for module in modules:
            await self.storage.delete("modules", module["id"])

        # Delete the course
        result = await self.storage.delete("courses", course_id)

        # Invalidate cache
        self._invalidate_course_cache(course_id)
        self._invalidate_user_courses_cache(user_id)

        return result

    async def _set_contributions(self, courses: list[Course]) -> None:
        paths = await self.storage.list("learning_paths")
        for course in courses:
            references = [p for p in paths if course.id in p.get("course_ids", [])]
            course.times_added = len(references)
            course.own_path_count = sum(p.get("owner_id") == course.author_id for p in references)
            course.other_path_count = course.times_added - course.own_path_count

    # Private helper methods

    async def _batch_get_module_counts(self, course_ids: list[str]) -> dict[str, int]:
        """Get module counts for multiple courses in parallel.

        Uses caching and parallel execution to reduce N+1 queries.

        Args:
            course_ids: List of course IDs to get counts for

        Returns:
            Dict mapping course_id to module count
        """
        if not course_ids:
            return {}

        cache = get_cache()
        results: dict[str, int] = {}
        uncached_ids: list[str] = []

        # Check cache first
        for course_id in course_ids:
            cache_key = f"modules:count:{course_id}"
            value, found = cache.get(cache_key)
            if found:
                results[course_id] = value
            else:
                uncached_ids.append(course_id)

        # Fetch uncached counts in parallel
        if uncached_ids:
            tasks = [self.storage.count("modules", {"course_id": cid}) for cid in uncached_ids]
            counts = await asyncio.gather(*tasks)

            # Cache and store results
            for course_id, count in zip(uncached_ids, counts):
                cache_key = f"modules:count:{course_id}"
                cache.set(cache_key, count, ttl_seconds=60)
                results[course_id] = count

        return results

    async def _get_cached_course(self, course_id: str) -> dict | None:
        """Get a course from cache or database.

        Args:
            course_id: The course ID

        Returns:
            Course data dict or None if not found
        """
        cache = get_cache()
        cache_key = f"course:{course_id}"

        return await cache.get_or_compute(
            key=cache_key,
            compute_fn=lambda: self.storage.get("courses", course_id),
            ttl_seconds=300,
        )

    def _invalidate_course_cache(self, course_id: str) -> None:
        """Invalidate cache entries for a course.

        Args:
            course_id: The course ID to invalidate
        """
        cache = get_cache()
        cache.invalidate(f"course:{course_id}")
        cache.invalidate(f"modules:count:{course_id}")

    def _invalidate_user_courses_cache(self, user_id: str) -> None:
        """Invalidate the user's course list cache.

        Args:
            user_id: The user ID
        """
        cache = get_cache()
        cache.invalidate_pattern(f"user:courses:{user_id}")

    async def _get_editable_course(self, course_id: str, user_id: str) -> dict:
        """Get a course and verify it's editable by the user."""
        course_data = await self.storage.get("courses", course_id)

        if not course_data:
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

    async def _get_filesystem_courses(self) -> list[CourseResponse]:
        """Load courses from the filesystem (content/courses)."""
        courses = []

        if not self.content_path.exists():
            return courses

        for course_dir in self.content_path.iterdir():
            if not course_dir.is_dir():
                continue

            meta_path = course_dir / "meta.json"
            if not meta_path.exists():
                continue

            try:
                with open(meta_path) as f:
                    meta = json.load(f)

                module_count = len(meta.get("modules", []))

                course = CourseResponse(
                    id=meta.get("id", course_dir.name),
                    title=meta.get("title", course_dir.name.replace("-", " ").title()),
                    description=meta.get("description"),
                    thumbnail_url=None,
                    difficulty=meta.get("difficulty", "beginner"),
                    tags=meta.get("tags", []),
                    visibility="public",
                    source="filesystem",
                    author_id="system",
                    author_name="System",
                    ai_enabled=False,
                    instructions=None,
                    times_added=0,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                    module_count=module_count,
                )
                courses.append(course)
            except (json.JSONDecodeError, KeyError):
                continue

        return courses

    async def _get_filesystem_course(self, course_id: str) -> Course | None:
        """Get a single filesystem course by ID."""
        course_path = self.content_path / course_id
        if not course_path.exists():
            return None

        meta_path = course_path / "meta.json"
        if not meta_path.exists():
            return None

        try:
            with open(meta_path) as f:
                meta = json.load(f)

            return Course(
                id=meta.get("id", course_id),
                title=meta.get("title", course_id.replace("-", " ").title()),
                description=meta.get("description"),
                thumbnail_url=None,
                difficulty=meta.get("difficulty", "beginner"),
                tags=meta.get("tags", []),
                visibility="public",
                source="filesystem",
                author_id="system",
                author_name="System",
                ai_enabled=False,
                instructions=None,
                times_added=0,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
        except (json.JSONDecodeError, KeyError):
            return None

    async def _get_database_courses(self, user_id: str | None) -> list[CourseResponse]:
        """Get database courses accessible to user."""
        courses_data = [
            c for c in await self.storage.list("courses") if can_discover(c, user_id, "author_id")
        ]

        if not courses_data:
            return []

        # Batch get module counts to avoid N+1 queries
        course_ids = [c["id"] for c in courses_data]
        module_counts = await self._batch_get_module_counts(course_ids)

        return [
            CourseResponse(**course_data, module_count=module_counts.get(course_data["id"], 0))
            for course_data in courses_data
        ]

    async def _get_filesystem_modules(self, course_id: str) -> list[ModuleSummary]:
        """Get module summaries from filesystem."""
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

            modules.append(
                ModuleSummary(
                    id=module_dir.name,
                    title=module_dir.name.replace("-", " ").title().lstrip("0123456789 "),
                    order_index=idx,
                    flashcard_count=flashcard_count,
                    has_quiz=has_quiz,
                )
            )

        return modules

    async def _get_database_modules(self, course_id: str) -> list[ModuleSummary]:
        """Get module summaries from database."""
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
                    objectives=module_data.get("objectives", []),
                    order_index=module_data.get("order_index", 0),
                    flashcard_count=len(flashcards) if flashcards else 0,
                    has_quiz=quiz is not None and len(quiz.get("questions", [])) > 0,
                )
            )

        return modules

    def _apply_discovery_filters(
        self, courses: list[CourseResponse], filters: CourseDiscoveryFilters
    ) -> list[CourseResponse]:
        """Apply search and filter criteria to courses."""
        result = courses

        # Text search
        if filters.q:
            q_lower = filters.q.lower()
            result = [
                c
                for c in result
                if q_lower in c.title.lower()
                or (c.description and q_lower in c.description.lower())
            ]

        # Tags filter
        if filters.tags:
            result = [c for c in result if set(filters.tags) & set(c.tags)]

        # Difficulty filter
        if filters.difficulty:
            result = [c for c in result if c.difficulty == filters.difficulty]

        # Author filter
        if filters.author_id:
            result = [c for c in result if c.author_id == filters.author_id]

        return result

    def _sort_courses(self, courses: list[CourseResponse], sort: str) -> list[CourseResponse]:
        """Sort courses by the specified criteria."""
        if sort == "popular":
            return sorted(courses, key=lambda c: c.times_added, reverse=True)
        elif sort == "newest":
            return sorted(courses, key=lambda c: c.created_at, reverse=True)
        elif sort == "alphabetical":
            return sorted(courses, key=lambda c: c.title.lower())
        return courses
