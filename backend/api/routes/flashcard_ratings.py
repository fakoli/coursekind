"""Flashcard rating routes."""

from fastapi import APIRouter, Depends, Query

from dependencies import CurrentUser, get_storage
from models.flashcard_rating import (
    FilteredFlashcardsResponse,
    FlashcardRatingRecord,
    FlashcardRatingResponse,
    FlashcardRatingSummary,
    RateFlashcardRequest,
    RatingsWithSummaryResponse,
    UnhelpfulCardsResponse,
)
from services.flashcard_rating_service import FlashcardRatingService
from storage.base import StorageBackend

router = APIRouter(
    prefix="/courses/{course_id}/modules/{module_id}/flashcards", tags=["flashcard-ratings"]
)


def get_flashcard_rating_service(
    storage: StorageBackend = Depends(get_storage),
) -> FlashcardRatingService:
    return FlashcardRatingService(storage)


@router.post("/rate", response_model=FlashcardRatingResponse)
async def rate_flashcard(
    course_id: str,
    module_id: str,
    data: RateFlashcardRequest,
    current_user: CurrentUser,
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> FlashcardRatingResponse:
    """Rate a flashcard as easy, medium, hard, or unhelpful."""
    return await service.rate_flashcard(
        user_id=current_user.id,
        course_id=course_id,
        module_id=module_id,
        data=data,
    )


@router.get("/ratings", response_model=list[FlashcardRatingRecord])
async def get_user_ratings(
    course_id: str,
    module_id: str,
    current_user: CurrentUser,
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> list[FlashcardRatingRecord]:
    """Get the current user's ratings for all flashcards in a module."""
    return await service.get_user_ratings(
        course_id=course_id,
        user_id=current_user.id,
        module_id=module_id,
    )


@router.get("/summary", response_model=FlashcardRatingSummary)
async def get_rating_summary(
    course_id: str,
    module_id: str,
    current_user: CurrentUser,
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> FlashcardRatingSummary:
    """Get a summary of ratings for a module's flashcards."""
    return await service.get_rating_summary(
        user_id=current_user.id,
        course_id=course_id,
        module_id=module_id,
    )


@router.get("/ratings-with-summary", response_model=RatingsWithSummaryResponse)
async def get_ratings_with_summary(
    course_id: str,
    module_id: str,
    current_user: CurrentUser,
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> RatingsWithSummaryResponse:
    """Get both ratings and summary in one call.

    This combined endpoint reduces two API calls to one for the common case
    of loading module flashcard state in the UI.
    """
    ratings, summary = await service.get_ratings_with_summary(
        user_id=current_user.id,
        course_id=course_id,
        module_id=module_id,
    )
    return RatingsWithSummaryResponse(ratings=ratings, summary=summary)


@router.get("/filter", response_model=FilteredFlashcardsResponse)
async def get_filtered_flashcards(
    course_id: str,
    module_id: str,
    current_user: CurrentUser,
    filter_by: str | None = Query(
        None,
        description="Filter by rating: all, unrated, easy, medium, hard, unhelpful",
    ),
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> FilteredFlashcardsResponse:
    """Get flashcards filtered by rating status."""
    return await service.get_filtered_flashcards(
        user_id=current_user.id,
        course_id=course_id,
        module_id=module_id,
        filter_by=filter_by,
    )


# Author feedback endpoint - separate prefix
feedback_router = APIRouter(prefix="/courses/{course_id}/feedback", tags=["flashcard-ratings"])


@feedback_router.get("/unhelpful-cards", response_model=UnhelpfulCardsResponse)
async def get_unhelpful_cards(
    course_id: str,
    current_user: CurrentUser,
    service: FlashcardRatingService = Depends(get_flashcard_rating_service),
) -> UnhelpfulCardsResponse:
    """Get cards marked as unhelpful by learners (course author only)."""
    return await service.get_unhelpful_cards(
        author_id=current_user.id,
        course_id=course_id,
    )
