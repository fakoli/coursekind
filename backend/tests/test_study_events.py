from datetime import datetime, timedelta, timezone

import pytest

from models.progress import ModuleProgressCreate
from services.progress_service import ProgressService
from storage.json_storage import JSONStorage


@pytest.fixture
async def study(tmp_path, monkeypatch):
    storage = JSONStorage(str(tmp_path))
    await storage.create("users", {"id": "u", "timezone": "UTC"})
    await storage.create(
        "courses", {"id": "c", "title": "Course", "author_id": "u", "visibility": "public"}
    )
    await storage.create(
        "modules",
        {
            "id": "m",
            "course_id": "c",
            "title": "Module",
            "order_index": 0,
            "flashcards": [
                {"id": "a", "front": "A", "back": "a"},
                {"id": "b", "front": "B", "back": "b"},
            ],
        },
    )
    clock = [datetime(2026, 10, 20, 12, tzinfo=timezone.utc)]

    class ControlledDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return clock[0]

    monkeypatch.setattr("services.progress_service.datetime", ControlledDateTime)
    service = ProgressService(storage)
    return storage, service, clock


async def act(service, action="read_content", **kwargs):
    return await service.update_module_progress(
        "u", "m", "c", ModuleProgressCreate(action=action, **kwargs)
    )


@pytest.mark.asyncio
async def test_append_only_days_grace_and_historical_longest(study):
    storage, service, clock = study
    for day in range(3):
        clock[0] = datetime(2026, 10, 20 + day, 12, tzinfo=timezone.utc)
        await act(service)
    assert len(await storage.list("activities")) == 3
    assert (await service.get_dashboard_stats("u")).current_streak == 3
    clock[0] += timedelta(days=1)
    assert (await service.get_dashboard_stats("u")).current_streak == 3
    clock[0] += timedelta(days=1)
    stats = await service.get_dashboard_stats("u")
    assert stats.current_streak == 0
    assert stats.longest_streak == 3


@pytest.mark.asyncio
async def test_timezone_midnight_and_passive_start(study):
    storage, service, clock = study
    await act(service, "start", time_spent_minutes=20)
    assert (await service.get_dashboard_stats("u")).study_sessions_week == 0
    assert (await service.get_dashboard_stats("u")).courses_in_progress == 0
    await storage.update("users", "u", {"timezone": "America/Los_Angeles"})
    clock[0] = datetime(2026, 10, 20, 6, 59, tzinfo=timezone.utc)
    await act(service)
    clock[0] += timedelta(minutes=2)
    await act(service)
    stats = await service.get_dashboard_stats("u")
    assert stats.current_streak == 2
    assert stats.timezone == "America/Los_Angeles"
    assert stats.total_study_time_minutes == 0


@pytest.mark.asyncio
async def test_session_gap_rolling_week_and_idempotent_retry(study):
    storage, service, clock = study
    await act(service, event_id="retry", time_spent_seconds=60)
    clock[0] += timedelta(minutes=30)
    await act(service, event_id="second", time_spent_seconds=30)
    await act(service, event_id="second", time_spent_seconds=30)
    assert len(await storage.list("activities")) == 2
    assert (await service.get_dashboard_stats("u")).study_sessions_week == 1
    clock[0] += timedelta(minutes=30, seconds=1)
    await act(service)
    assert (await service.get_dashboard_stats("u")).study_sessions_week == 2
    clock[0] += timedelta(days=7)
    assert (await service.get_dashboard_stats("u")).study_sessions_week == 1
    clock[0] += timedelta(seconds=1)
    assert (await service.get_dashboard_stats("u")).study_sessions_week == 0
    assert (await service.get_dashboard_stats("u")).total_study_time_minutes == 1.5


@pytest.mark.asyncio
async def test_distinct_cards_personal_state_and_quiz_history(study):
    storage, service, clock = study
    for _ in range(3):
        await act(service, "review_flashcard", flashcard_id="a")
    assert (await service.get_course_progress("u", "c")).modules[0].flashcards_reviewed == 1
    await act(service, "submit_quiz", quiz_score=0, quiz_answers={"0": 1})
    await act(service, "submit_quiz", quiz_score=100, quiz_answers={"0": 0})
    await act(
        service, "practice", practice_code="", practice_result={"success": False, "error": "syntax"}
    )
    progress = await service.get_module_progress("u", "m", "c")
    assert progress.practice_code == ""
    assert progress.quiz_attempts == 2
    assert len(progress.quiz_history) == 2
    assert progress.quiz_history[0]["score"] == 0
    assert len(progress.practice_history) == 1
    await storage.update(
        "modules",
        "m",
        {
            "flashcards": [
                {"id": "b", "front": "B", "back": "b"},
                {"id": "new", "front": "new", "back": "n"},
            ]
        },
    )
    assert (await service.get_course_progress("u", "c")).modules[0].flashcards_reviewed == 0


@pytest.mark.asyncio
async def test_started_distinct_course_followed_paths_and_unavailable_zero(study):
    storage, service, clock = study
    await act(service)
    await storage.create(
        "learning_paths",
        {
            "id": "authored",
            "title": "Authored",
            "owner_id": "u",
            "course_ids": ["c"],
            "visibility": "public",
        },
    )
    for pid in ["selected1", "selected2"]:
        await storage.create(
            "learning_paths",
            {
                "id": pid,
                "title": pid,
                "owner_id": "other",
                "course_ids": ["c", "missing"],
                "visibility": "public",
                "created_at": clock[0].isoformat(),
                "updated_at": clock[0].isoformat(),
            },
        )
        await storage.create(
            "path_follows",
            {"id": pid, "path_id": pid, "user_id": "u", "created_at": clock[0].isoformat()},
        )
    stats = await service.get_dashboard_stats("u")
    assert stats.courses_in_progress == 1
    assert stats.selected_paths == 2
    assert stats.active_paths == 2
    assert (await service.get_next_up("u")).items[0].path_id == "selected1"
    await act(service, "complete")
    path = await service.get_path_progress("u", "selected1")
    assert path.total_courses == 2
    assert path.completion_percentage == 50
    assert len(path.courses) == 1
    await storage.update("learning_paths", "selected1", {"visibility": "private"})
    await storage.update("courses", "c", {"visibility": "private", "author_id": "other"})
    stats = await service.get_dashboard_stats("u")
    assert stats.selected_paths == 1
    assert stats.courses_in_progress == 0
    assert stats.modules_completed_total == 1
    assert stats.current_streak == 1
    assert (await service.get_recent_activity("u")).activities[0].course_title is None


@pytest.mark.asyncio
async def test_legacy_card_identity_and_ratings_survive_reorder_not_replacement(study):
    from models.flashcard_rating import RateFlashcardRequest
    from models.module import ModuleUpdate
    from services.flashcard_rating_service import FlashcardRatingService
    from services.module_service import ModuleService

    storage, service, clock = study
    await storage.update(
        "modules",
        "m",
        {
            "flashcards": [
                {"front": "First", "back": "Answer"},
                {"front": "Second", "back": "Answer"},
            ]
        },
    )
    modules = ModuleService(storage)
    cards = (await modules.get_module("c", "m", "u")).flashcards
    assert cards[0].id and cards[1].id and cards[0].id != cards[1].id
    ratings = FlashcardRatingService(storage)
    await ratings.rate_flashcard(
        "u", "c", "m", RateFlashcardRequest(flashcard_index=0, rating="easy")
    )
    await modules.update_module("c", "m", "u", ModuleUpdate(flashcards=list(reversed(cards))))
    saved = await ratings.get_user_ratings("u", "m", "c")
    assert saved[0].flashcard_index == 1
    assert saved[0].flashcard_id == cards[0].id
    await modules.update_module("c", "m", "u", ModuleUpdate(flashcards=[cards[1]]))
    assert await ratings.get_user_ratings("u", "m", "c") == []
    assert (await ratings.get_rating_summary("u", "c", "m")).unrated == 1


@pytest.mark.asyncio
async def test_timezone_canonical_and_invalid_iana(client, auth_headers):
    prefs = await client.get("/api/v1/notifications/preferences", headers=auth_headers)
    assert prefs.json()["timezone"] == "UTC"
    response = await client.put(
        "/api/v1/notifications/preferences", headers=auth_headers, json={"timezone": "No/Such_Zone"}
    )
    assert response.status_code == 422
    response = await client.put(
        "/api/v1/notifications/preferences", headers=auth_headers, json={"timezone": "Asia/Tokyo"}
    )
    assert response.status_code == 200
    assert (await client.get("/api/v1/progress/dashboard", headers=auth_headers)).json()[
        "timezone"
    ] == "Asia/Tokyo"
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).json()[
        "timezone"
    ] == "Asia/Tokyo"


@pytest.mark.asyncio
@pytest.mark.parametrize("backend", ["json", "sqlite"])
async def test_concurrent_retry_is_atomic_and_personal(tmp_path, backend):
    import asyncio

    from storage.sqlite_storage import SQLiteStorage

    storage = (
        JSONStorage(str(tmp_path))
        if backend == "json"
        else SQLiteStorage(str(tmp_path / "test.db"))
    )
    await storage.create(
        "courses", {"id": "c", "title": "Course", "author_id": "u", "visibility": "public"}
    )
    await storage.create(
        "modules", {"id": "m", "course_id": "c", "title": "Module", "order_index": 0}
    )
    service = ProgressService(storage)
    request = ModuleProgressCreate(
        action="submit_quiz", event_id="same", quiz_score=0, time_spent_seconds=90
    )
    await asyncio.gather(
        *(service.update_module_progress("u", "m", "c", request) for _ in range(5))
    )
    assert len(await storage.list("activities", {"user_id": "u"})) == 1
    progress = await service.get_module_progress("u", "m", "c")
    assert progress.quiz_attempts == 1
    assert progress.time_spent_minutes == 1.5
    assert (await service.get_dashboard_stats("u")).average_quiz_score == 0
    assert await service.get_module_progress("other", "m", "c") is None
    await service.update_module_progress("other", "m", "c", request)
    assert len(await storage.list("activities")) == 2
    if backend == "sqlite":
        await storage.close()


@pytest.mark.asyncio
async def test_failed_projection_rolls_back_event_and_retry(study, monkeypatch):
    storage, service, clock = study
    original = storage.create

    async def fail(collection, data):
        if collection == "module_progress":
            raise OSError("controlled disk failure")
        return await original(collection, data)

    monkeypatch.setattr(storage, "create", fail)
    with pytest.raises(OSError):
        await act(service, event_id="atomic")
    assert await storage.list("activities") == []
    monkeypatch.setattr(storage, "create", original)
    await act(service, event_id="atomic")
    assert len(await storage.list("activities")) == 1


@pytest.mark.asyncio
async def test_legacy_aggregates_do_not_fabricate_study_days_or_card_credit(study):
    storage, service, clock = study
    await storage.create(
        "module_progress",
        {
            "id": "old",
            "user_id": "u",
            "module_id": "m",
            "course_id": "c",
            "status": "completed",
            "flashcards_reviewed": 100,
            "time_spent_minutes": 50,
            "created_at": clock[0].isoformat(),
            "updated_at": clock[0].isoformat(),
        },
    )
    stats = await service.get_dashboard_stats("u")
    assert stats.current_streak == 0
    assert stats.study_sessions_week == 0
    assert stats.study_time_this_week_minutes == 0
    assert stats.total_study_time_minutes == 50
    assert stats.modules_completed_total == 1
    assert (await service.get_course_progress("u", "c")).modules[0].flashcards_reviewed == 0


@pytest.mark.asyncio
async def test_removed_identity_cannot_be_reintroduced_for_new_card(study):
    from models.module import FlashcardData, ModuleUpdate
    from services.module_service import ModuleService

    storage, service, clock = study
    modules = ModuleService(storage)
    await act(service, "review_flashcard", flashcard_id="a")
    await modules.update_module(
        "c", "m", "u", ModuleUpdate(flashcards=[FlashcardData(id="b", front="B", back="b")])
    )
    saved = await modules.update_module(
        "c",
        "m",
        "u",
        ModuleUpdate(flashcards=[FlashcardData(id="a", front="Replacement", back="New")]),
    )
    assert saved.flashcards[0].id != "a"
    assert (await service.get_course_progress("u", "c")).modules[0].flashcards_reviewed == 0


@pytest.mark.asyncio
async def test_reused_event_id_with_changed_payload_conflicts(study):
    from exceptions import StudyBuddyException

    storage, service, clock = study
    await act(service, "submit_quiz", event_id="quiz", quiz_score=0)
    with pytest.raises(StudyBuddyException) as error:
        await act(service, "submit_quiz", event_id="quiz", quiz_score=100)
    assert error.value.status_code == 409
    assert (await service.get_module_progress("u", "m", "c")).quiz_score == 0


@pytest.mark.asyncio
async def test_module_progress_reflects_removed_cards(study):
    storage, service, clock = study
    await act(service, "review_flashcard", flashcard_id="a")
    await storage.update("modules", "m", {"flashcards": []})
    assert (await service.get_module_progress("u", "m", "c")).flashcards_reviewed == 0
