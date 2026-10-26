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
        """Resolve index once, persist stable identity, and serialize rating updates."""
        async with self.storage.transaction():
            module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
            cards = module.get("flashcards", [])
            if not 0 <= data.flashcard_index < len(cards):
                raise NotFoundException("Flashcard not found")
            card_id = cards[data.flashcard_index]["id"]
            if data.flashcard_id is not None and data.flashcard_id != card_id:
                raise NotFoundException("Flashcard changed; reload before rating")
            records = await self.storage.list(
                "flashcard_ratings",
                {
                    "user_id": user_id,
                    "course_id": course_id,
                    "module_id": module_id,
                    "flashcard_id": card_id,
                },
            )
            now = datetime.now(timezone.utc).isoformat()
            record = (
                records[0]
                if records
                else {
                    "id": str(uuid4()),
                    "user_id": user_id,
                    "course_id": course_id,
                    "module_id": module_id,
                    "created_at": now,
                }
            )
            record.update(
                flashcard_id=card_id,
                flashcard_index=data.flashcard_index,
                rating=data.rating.value,
                updated_at=now,
            )
            if records:
                await self.storage.update("flashcard_ratings", record["id"], record)
            else:
                await self.storage.create("flashcard_ratings", record)
            return FlashcardRatingResponse(
                flashcard_index=data.flashcard_index, rating=data.rating, updated=bool(records)
            )

    async def get_user_ratings(
        self, user_id: str, module_id: str, course_id: str | None = None
    ) -> list[FlashcardRatingRecord]:
        if course_id is None:
            module = await self.storage.get("modules", module_id)
            if not module:
                raise NotFoundException("Module not found")
            course_id = module["course_id"]
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        indexes = {c["id"]: i for i, c in enumerate(module.get("flashcards", []))}
        records = await self.storage.list(
            "flashcard_ratings",
            {
                "user_id": user_id,
                "course_id": course_id,
                "module_id": module_id,
            },
        )
        # Unidentified legacy ratings cannot safely be attributed after content edits.
        return [
            FlashcardRatingRecord(**{**r, "flashcard_index": indexes[r["flashcard_id"]]})
            for r in records
            if r.get("flashcard_id") in indexes
        ]

    async def get_rating_summary(
        self, user_id: str, course_id: str, module_id: str
    ) -> FlashcardRatingSummary:
        _, summary = await self.get_ratings_with_summary(user_id, course_id, module_id)
        return summary

    async def get_ratings_with_summary(
        self, user_id: str, course_id: str, module_id: str
    ) -> tuple[list[FlashcardRatingRecord], FlashcardRatingSummary]:
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        ratings = await self.get_user_ratings(user_id, module_id, course_id)
        counts = {r.value: 0 for r in FlashcardRating}
        for rating in ratings:
            counts[rating.rating.value] += 1
        total = len(module.get("flashcards", []))
        return ratings, FlashcardRatingSummary(total=total, unrated=total - len(ratings), **counts)

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
        ratings = await self.get_user_ratings(user_id, module_id, course_id)
        rating_map = {r.flashcard_index: r.rating for r in ratings}

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
            module = module_map.get(rating["module_id"])
            if not module:
                continue
            from utils.card_identity import identified_cards

            ids = {
                c["id"]: i
                for i, c in enumerate(identified_cards(module["id"], module.get("flashcards", [])))
            }
            if rating.get("flashcard_id") not in ids:
                continue
            key = (rating["module_id"], ids[rating["flashcard_id"]])
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
