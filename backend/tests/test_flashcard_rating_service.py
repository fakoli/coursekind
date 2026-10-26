"""Service-level tests for FlashcardRatingService.

Cover rate_flashcard (create/update), get_user_ratings, rating summaries,
filtered flashcards, and unhelpful-cards feedback — the paths that were
previously uncovered.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from exceptions import NotFoundException
from models.flashcard_rating import FlashcardRating, RateFlashcardRequest
from services.flashcard_rating_service import FlashcardRatingService


class FakeStorage:
    """Minimal in-memory async storage."""

    def __init__(self):
        self.data: dict[str, dict] = {}

    async def get(self, collection, key):
        return self.data.get(collection, {}).get(key)

    async def list(self, collection, query=None):
        items = list(self.data.get(collection, {}).values())
        if not query:
            return items
        return [i for i in items if all(i.get(k) == v for k, v in query.items())]

    async def create(self, collection, record):
        self.data.setdefault(collection, {})[record["id"]] = record
        return record

    async def update(self, collection, key, updates):
        store = self.data.setdefault(collection, {})
        if key not in store:
            return None
        store[key] = {**store[key], **updates}
        return store[key]

    async def delete(self, collection, key):
        store = self.data.get(collection, {})
        if key not in store:
            return False
        del store[key]
        return True


def _module_record(course_id, flashcards=None):
    return {
        "id": str(uuid4()),
        "course_id": course_id,
        "title": "Mod",
        "order_index": 0,
        "content_markdown": "c",
        "flashcards": flashcards
        if flashcards is not None
        else [
            {"id": "fc1", "front": "F1", "back": "B1"},
            {"id": "fc2", "front": "F2", "back": "B2"},
        ],
        "quiz": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def _course_record(author_id="author-1"):
    return {
        "id": str(uuid4()),
        "title": "Course",
        "author_id": author_id,
        "visibility": "public",
        "source": "db",
    }


@pytest.fixture
def storage():
    return FakeStorage()


@pytest.fixture
def service(storage):
    return FlashcardRatingService(storage)


class TestRateFlashcard:
    @pytest.mark.asyncio
    async def test_create_new_rating(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)

        resp = await service.rate_flashcard(
            "user-1",
            course["id"],
            module["id"],
            RateFlashcardRequest(
                flashcard_index=0, rating=FlashcardRating.EASY, flashcard_id="fc1"
            ),
        )
        assert resp.updated is False
        assert resp.rating == FlashcardRating.EASY
        ratings = await storage.list("flashcard_ratings")
        assert len(ratings) == 1
        assert ratings[0]["user_id"] == "user-1"

    @pytest.mark.asyncio
    async def test_update_existing_rating(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "user-1",
            course["id"],
            module["id"],
            RateFlashcardRequest(
                flashcard_index=0, rating=FlashcardRating.EASY, flashcard_id="fc1"
            ),
        )

        resp = await service.rate_flashcard(
            "user-1",
            course["id"],
            module["id"],
            RateFlashcardRequest(
                flashcard_index=0, rating=FlashcardRating.HARD, flashcard_id="fc1"
            ),
        )
        assert resp.updated is True
        assert resp.rating == FlashcardRating.HARD
        ratings = await storage.list("flashcard_ratings")
        assert len(ratings) == 1  # still one record, updated
        assert ratings[0]["rating"] == FlashcardRating.HARD.value

    @pytest.mark.asyncio
    async def test_module_not_found(self, storage, service):
        course = _course_record()
        await storage.create("courses", course)
        with pytest.raises(NotFoundException):
            await service.rate_flashcard(
                "user-1",
                course["id"],
                "ghost-module",
                RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.EASY),
            )

    @pytest.mark.asyncio
    async def test_flashcard_index_out_of_range(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])  # 2 flashcards
        await storage.create("courses", course)
        await storage.create("modules", module)
        with pytest.raises(NotFoundException):
            await service.rate_flashcard(
                "user-1",
                course["id"],
                module["id"],
                RateFlashcardRequest(flashcard_index=5, rating=FlashcardRating.EASY),
            )


class TestGetUserRatings:
    @pytest.mark.asyncio
    async def test_returns_rating_records(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "user-1",
            course["id"],
            module["id"],
            RateFlashcardRequest(
                flashcard_index=1, rating=FlashcardRating.MEDIUM, flashcard_id="fc2"
            ),
        )

        records = await service.get_user_ratings("user-1", module["id"])
        assert len(records) == 1
        assert records[0].flashcard_index == 1
        assert records[0].rating == FlashcardRating.MEDIUM

    @pytest.mark.asyncio
    async def test_empty(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        assert await service.get_user_ratings("user-1", module["id"]) == []


class TestRatingSummary:
    @pytest.mark.asyncio
    async def test_summary_counts(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])  # 2 flashcards
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.EASY),
        )
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=1, rating=FlashcardRating.UNHELPFUL),
        )

        summary = await service.get_rating_summary("u1", course["id"], module["id"])
        assert summary.total == 2
        assert summary.unrated == 0
        assert summary.easy == 1
        assert summary.medium == 0
        assert summary.hard == 0
        assert summary.unhelpful == 1

    @pytest.mark.asyncio
    async def test_summary_module_not_found(self, storage, service):
        with pytest.raises(NotFoundException):
            await service.get_rating_summary("u1", "course-x", "module-x")


class TestRatingsWithSummary:
    @pytest.mark.asyncio
    async def test_returns_both(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.EASY),
        )

        records, summary = await service.get_ratings_with_summary("u1", course["id"], module["id"])
        assert len(records) == 1
        assert summary.total == 2
        assert summary.easy == 1


class TestFilteredFlashcards:
    @pytest.mark.asyncio
    async def test_filter_all(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.EASY),
        )

        resp = await service.get_filtered_flashcards("u1", course["id"], module["id"], "all")
        assert resp.total == 2
        assert resp.filter_applied == "all"

    @pytest.mark.asyncio
    async def test_filter_unrated(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.EASY),
        )

        resp = await service.get_filtered_flashcards("u1", course["id"], module["id"], "unrated")
        assert resp.total == 1
        assert resp.flashcards[0].index == 1  # only the unrated one

    @pytest.mark.asyncio
    async def test_filter_by_rating(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        await service.rate_flashcard(
            "u1",
            course["id"],
            module["id"],
            RateFlashcardRequest(flashcard_index=0, rating=FlashcardRating.HARD),
        )

        resp = await service.get_filtered_flashcards("u1", course["id"], module["id"], "hard")
        assert resp.total == 1
        assert resp.flashcards[0].index == 0

    @pytest.mark.asyncio
    async def test_default_all(self, storage, service):
        course = _course_record()
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        resp = await service.get_filtered_flashcards("u1", course["id"], module["id"], None)
        assert resp.total == 2


class TestUnhelpfulCards:
    @pytest.mark.asyncio
    async def test_groups_by_card_and_sorts(self, storage, service):
        course = _course_record(author_id="author-1")
        module = _module_record(course["id"])
        await storage.create("courses", course)
        await storage.create("modules", module)
        # Two users mark card 0 unhelpful
        for u in ("u1", "u2"):
            await service.rate_flashcard(
                u,
                course["id"],
                module["id"],
                RateFlashcardRequest(
                    flashcard_index=0, rating=FlashcardRating.UNHELPFUL, flashcard_id="fc1"
                ),
            )

        resp = await service.get_unhelpful_cards("author-1", course["id"])
        assert resp.total == 1
        assert resp.unhelpful_cards[0].unhelpful_count == 2
        assert resp.unhelpful_cards[0].flashcard_index == 0
        assert resp.unhelpful_cards[0].module_title == "Mod"

    @pytest.mark.asyncio
    async def test_not_author_404(self, storage, service):
        course = _course_record(author_id="owner")
        await storage.create("courses", course)
        with pytest.raises(NotFoundException):
            await service.get_unhelpful_cards("intruder", course["id"])

    @pytest.mark.asyncio
    async def test_no_cards(self, storage, service):
        course = _course_record()
        await storage.create("courses", course)
        resp = await service.get_unhelpful_cards("author-1", course["id"])
        assert resp.total == 0
