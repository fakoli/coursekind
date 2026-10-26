"""Flashcard rating service - handles rating flashcards and filtering."""

from datetime import datetime, timezone
from uuid import uuid4

from exceptions import ErrorCode, NotFoundException
from models.flashcard_rating import (
    FilteredFlashcard,
    FilteredFlashcardsResponse,
    FlashcardRating,
    FlashcardRatingRecord,
    FlashcardRatingResponse,
    FlashcardRatingSummary,
    RateFlashcardRequest,
    UnhelpfulCardFeedback,
    UnhelpfulCardsResponse,
)
from services.access_service import AccessService
from storage.base import StorageBackend
from utils.datetime_utils import ensure_datetime


class FlashcardRatingService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage

    async def rate_flashcard(
        self,
        user_id: str,
        course_id: str,
        module_id: str,
        data: RateFlashcardRequest,
    ) -> FlashcardRatingResponse:
        """Rate a flashcard. Updates existing rating if one exists."""
        now = datetime.now(timezone.utc)

        # Check if module exists
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        if not module or module.get("course_id") != course_id:
            raise NotFoundException("Module not found", code=ErrorCode.MODULE_NOT_FOUND)

        # Verify flashcard index is valid
        flashcards = module.get("flashcards", [])
        if data.flashcard_index < 0 or data.flashcard_index >= len(flashcards):
            raise NotFoundException("Flashcard not found", code=ErrorCode.NOT_FOUND)

        # Check for existing rating
        existing_ratings = await self.storage.list(
            "flashcard_ratings",
            {
                "user_id": user_id,
                "module_id": module_id,
                "course_id": course_id,
                "flashcard_index": data.flashcard_index,
            },
        )

        if existing_ratings:
            # Update existing rating
            existing = existing_ratings[0]
            existing["rating"] = data.rating.value
            existing["updated_at"] = now.isoformat()
            await self.storage.update("flashcard_ratings", existing["id"], existing)
            return FlashcardRatingResponse(
                flashcard_index=data.flashcard_index,
                rating=data.rating,
                updated=True,
            )

        # Create new rating
        rating_record = {
            "id": str(uuid4()),
            "user_id": user_id,
            "course_id": course_id,
            "module_id": module_id,
            "flashcard_index": data.flashcard_index,
            "flashcard_id": data.flashcard_id,
            "rating": data.rating.value,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await self.storage.create("flashcard_ratings", rating_record)

        return FlashcardRatingResponse(
            flashcard_index=data.flashcard_index,
            rating=data.rating,
            updated=False,
        )

    async def get_user_ratings(
        self,
        user_id: str,
        module_id: str,
        course_id: str | None = None,
    ) -> list[FlashcardRatingRecord]:
        """Get all ratings for a user in a specific readable module."""
        if course_id is None:
            module = await self.storage.get("modules", module_id)
            if not module:
                raise NotFoundException("Module not found")
            course_id = module["course_id"]
        await AccessService(self.storage).require_module(course_id, module_id, user_id)
        ratings = await self.storage.list(
            "flashcard_ratings",
            {"user_id": user_id, "course_id": course_id, "module_id": module_id},
        )

        return [
            FlashcardRatingRecord(
                id=r["id"],
                user_id=r["user_id"],
                course_id=r["course_id"],
                module_id=r["module_id"],
                flashcard_index=r["flashcard_index"],
                flashcard_id=r.get("flashcard_id"),
                rating=FlashcardRating(r["rating"]),
                created_at=ensure_datetime(r["created_at"]) or datetime.now(timezone.utc),
                updated_at=ensure_datetime(r["updated_at"]) or datetime.now(timezone.utc),
            )
            for r in ratings
        ]

    async def get_rating_summary(
        self,
        user_id: str,
        course_id: str,
        module_id: str,
    ) -> FlashcardRatingSummary:
        """Get summary of ratings for a module."""
        # Get module to know total flashcards
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        if not module or module.get("course_id") != course_id:
            raise NotFoundException("Module not found", code=ErrorCode.MODULE_NOT_FOUND)

        total = len(module.get("flashcards", []))

        # Get user's ratings for this module
        ratings = await self.storage.list(
            "flashcard_ratings",
            {"user_id": user_id, "course_id": course_id, "module_id": module_id},
        )

        # Count by rating type
        counts = {r.value: 0 for r in FlashcardRating}
        for rating in ratings:
            rating_value = rating["rating"]
            if rating_value in counts:
                counts[rating_value] += 1

        rated_count = len(ratings)

        return FlashcardRatingSummary(
            total=total,
            unrated=total - rated_count,
            easy=counts[FlashcardRating.EASY.value],
            medium=counts[FlashcardRating.MEDIUM.value],
            hard=counts[FlashcardRating.HARD.value],
            unhelpful=counts[FlashcardRating.UNHELPFUL.value],
        )

    async def get_ratings_with_summary(
        self,
        user_id: str,
        course_id: str,
        module_id: str,
    ) -> tuple[list[FlashcardRatingRecord], FlashcardRatingSummary]:
        """Get both ratings and summary in a single call.

        This is more efficient than calling get_user_ratings and get_rating_summary
        separately as it shares the database queries.

        Args:
            user_id: User ID
            course_id: Course ID
            module_id: Module ID

        Returns:
            Tuple of (ratings_list, summary)
        """
        # Get module to know total flashcards
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        if not module or module.get("course_id") != course_id:
            raise NotFoundException("Module not found", code=ErrorCode.MODULE_NOT_FOUND)

        total = len(module.get("flashcards", []))

        # Get user's ratings for this module (single query)
        ratings_raw = await self.storage.list(
            "flashcard_ratings",
            {"user_id": user_id, "course_id": course_id, "module_id": module_id},
        )

        # Build ratings list
        ratings = [
            FlashcardRatingRecord(
                id=r["id"],
                user_id=r["user_id"],
                course_id=r["course_id"],
                module_id=r["module_id"],
                flashcard_index=r["flashcard_index"],
                flashcard_id=r.get("flashcard_id"),
                rating=FlashcardRating(r["rating"]),
                created_at=ensure_datetime(r["created_at"]) or datetime.now(timezone.utc),
                updated_at=ensure_datetime(r["updated_at"]) or datetime.now(timezone.utc),
            )
            for r in ratings_raw
        ]

        # Count by rating type
        counts = {r.value: 0 for r in FlashcardRating}
        for rating_raw in ratings_raw:
            rating_value = rating_raw["rating"]
            if rating_value in counts:
                counts[rating_value] += 1

        rated_count = len(ratings_raw)

        summary = FlashcardRatingSummary(
            total=total,
            unrated=total - rated_count,
            easy=counts[FlashcardRating.EASY.value],
            medium=counts[FlashcardRating.MEDIUM.value],
            hard=counts[FlashcardRating.HARD.value],
            unhelpful=counts[FlashcardRating.UNHELPFUL.value],
        )

        return ratings, summary

    async def get_filtered_flashcards(
        self,
        user_id: str,
        course_id: str,
        module_id: str,
        filter_by: str | None = None,
    ) -> FilteredFlashcardsResponse:
        """Get flashcards filtered by rating."""
        # Get module
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        if not module or module.get("course_id") != course_id:
            raise NotFoundException("Module not found", code=ErrorCode.MODULE_NOT_FOUND)

        flashcards = module.get("flashcards", [])

        # Get user's ratings
        ratings = await self.storage.list(
            "flashcard_ratings",
            {"user_id": user_id, "course_id": course_id, "module_id": module_id},
        )
        rating_map = {r["flashcard_index"]: FlashcardRating(r["rating"]) for r in ratings}

        # Build filtered list
        result = []
        for i, fc in enumerate(flashcards):
            rating = rating_map.get(i)

            # Apply filter
            include = False
            if filter_by is None or filter_by == "all":
                include = True
            elif filter_by == "unrated":
                include = rating is None
            elif filter_by in [r.value for r in FlashcardRating]:
                include = rating is not None and rating.value == filter_by

            if include:
                result.append(
                    FilteredFlashcard(
                        index=i,
                        id=fc.get("id"),
                        front=fc["front"],
                        back=fc["back"],
                        visual=fc.get("visual"),
                        rating=rating,
                    )
                )

        return FilteredFlashcardsResponse(
            flashcards=result,
            filter_applied=filter_by or "all",
            total=len(result),
        )

    async def get_unhelpful_cards(
        self,
        author_id: str,
        course_id: str,
    ) -> UnhelpfulCardsResponse:
        """Get cards marked as unhelpful for course author feedback."""
        # Verify course exists and user is author
        course = await self.storage.get("courses", course_id)
        if not course:
            raise NotFoundException("Course not found", code=ErrorCode.COURSE_NOT_FOUND)

        if course.get("author_id") != author_id:
            raise NotFoundException("Course not found", code=ErrorCode.COURSE_NOT_FOUND)

        # Get all modules for this course
        modules = await self.storage.list("modules", {"course_id": course_id})
        module_map = {m["id"]: m for m in modules}

        # Get all unhelpful ratings for this course
        all_ratings = await self.storage.list(
            "flashcard_ratings",
            {"course_id": course_id},
        )
        unhelpful_ratings = [
            r for r in all_ratings if r["rating"] == FlashcardRating.UNHELPFUL.value
        ]

        # Group by module and flashcard index
        feedback_map: dict[tuple[str, int], list] = {}
        for rating in unhelpful_ratings:
            key = (rating["module_id"], rating["flashcard_index"])
            if key not in feedback_map:
                feedback_map[key] = []
            feedback_map[key].append(rating)

        # Build feedback list
        feedback_list = []
        for (mod_id, fc_idx), ratings in feedback_map.items():
            module = module_map.get(mod_id)
            if not module:
                continue

            flashcards = module.get("flashcards", [])
            if fc_idx >= len(flashcards):
                continue

            fc = flashcards[fc_idx]

            # Find most recent marking
            latest = max(ratings, key=lambda r: r.get("updated_at", ""))
            last_marked = ensure_datetime(latest.get("updated_at")) or datetime.now(timezone.utc)

            feedback_list.append(
                UnhelpfulCardFeedback(
                    module_id=mod_id,
                    module_title=module.get("title", "Unknown"),
                    flashcard_index=fc_idx,
                    flashcard_front=fc["front"],
                    flashcard_back=fc["back"],
                    unhelpful_count=len(ratings),
                    last_marked_at=last_marked,
                )
            )

        # Sort by unhelpful count descending
        feedback_list.sort(key=lambda f: f.unhelpful_count, reverse=True)

        return UnhelpfulCardsResponse(
            course_id=course_id,
            unhelpful_cards=feedback_list,
            total=len(feedback_list),
        )
