"""Progress service - tracks user progress through modules, courses, and paths."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import NAMESPACE_URL, uuid4, uuid5
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from exceptions import ConflictException, NotFoundException
from models.progress import (
    CourseProgressStatus,
    DashboardStats,
    ModuleProgress,
    ModuleProgressCreate,
    ModuleProgressStatus,
    NextUpItem,
    NextUpResponse,
    PathProgressStatus,
    ProgressStats,
    RecentActivity,
    RecentActivityResponse,
    Session,
    SessionsResponse,
    TopicMasteryResponse,
)
from services.access_service import AccessService
from services.course_service import CourseService
from services.learning_path_service import LearningPathService
from services.module_service import ModuleService
from storage.base import StorageBackend
from utils.card_identity import identified_cards
from utils.datetime_utils import ensure_datetime


class ProgressService:
    def __init__(self, storage: StorageBackend):
        self.storage = storage

    # Module Progress

    async def update_module_progress(
        self,
        user_id: str,
        module_id: str,
        course_id: str,
        data: ModuleProgressCreate,
    ) -> ModuleProgress:
        """Atomically append an owned event and update its personal projection."""
        async with self.storage.transaction():
            module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
            now = datetime.now(timezone.utc)
            records = await self.storage.list(
                "module_progress",
                {
                    "user_id": user_id,
                    "course_id": course_id,
                    "module_id": module_id,
                },
            )
            progress = (
                records[0]
                if records
                else {
                    "id": str(uuid4()),
                    "user_id": user_id,
                    "course_id": course_id,
                    "module_id": module_id,
                    "status": "not_started",
                    "created_at": now.isoformat(),
                }
            )
            event_id = (
                str(uuid5(NAMESPACE_URL, f"study:{len(user_id)}:{user_id}:{data.event_id}"))
                if data.event_id
                else str(uuid4())
            )
            request_hash = hashlib.sha256(
                json.dumps(
                    data.model_dump(mode="json", exclude={"event_id"}), sort_keys=True
                ).encode()
            ).hexdigest()
            previous = await self.storage.get("activities", event_id)
            if previous:
                if (
                    previous["course_id"] != course_id
                    or previous["module_id"] != module_id
                    or previous.get("action") != data.action
                    or previous.get("request_hash") != request_hash
                ):
                    raise ConflictException("Event ID already used for a different action")
                return self._module_response(progress, module)
            meaningful = data.action not in ("start", "save_state")
            details = {}
            if meaningful and progress.get("status") == "not_started":
                progress["status"] = "in_progress"
                progress["started_at"] = now.isoformat()
            if data.action == "complete":
                progress["status"] = "completed"
                if not progress.get("started_at"):
                    progress["started_at"] = now.isoformat()
                if not progress.get("completed_at"):
                    progress["completed_at"] = now.isoformat()
            elif data.action == "read_content":
                progress["content_read"] = True
            elif data.action == "review_flashcard":
                cards = identified_cards(module_id, module.get("flashcards", []))
                card_ids = {c["id"] for c in cards}
                # Legacy clients may still send unidentifiable reviews: retain events,
                # but never invent distinct card credit from an aggregate/index.
                reviewed = set(progress.get("reviewed_card_ids", []))
                card_id = data.flashcard_id
                # A single-card legacy request is unambiguous; a multi-card
                # request without identity receives no invented distinct credit.
                if card_id is None and len(card_ids) == 1:
                    card_id = next(iter(card_ids))
                if card_id is not None and card_id not in card_ids:
                    raise NotFoundException("Flashcard changed; reload before reviewing")
                if card_id in card_ids:
                    reviewed.add(card_id)
                progress["reviewed_card_ids"] = sorted(reviewed)
                progress["flashcards_reviewed"] = len(reviewed & card_ids)
                details["flashcard_id"] = card_id
                details["cards_reviewed"] = progress["flashcards_reviewed"]
            elif data.action == "submit_quiz":
                progress["quiz_attempts"] = progress.get("quiz_attempts", 0) + 1
                progress["quiz_score"] = data.quiz_score
                progress["last_quiz_at"] = now.isoformat()
                details = {
                    "score": data.quiz_score,
                    "attempt": progress["quiz_attempts"],
                    "answers": data.quiz_answers or {},
                }
                progress.setdefault("quiz_history", []).append(
                    {**details, "created_at": now.isoformat(), "event_id": event_id}
                )
            elif data.action == "practice":
                details = {"result": data.practice_result or {}}
                progress.setdefault("practice_history", []).append(
                    {
                        **details,
                        "code": data.practice_code,
                        "created_at": now.isoformat(),
                        "event_id": event_id,
                    }
                )
            if data.practice_code is not None:
                progress["practice_code"] = data.practice_code
            if data.extra_quiz_questions is not None:
                progress["extra_quiz_questions"] = [
                    q.model_dump() for q in data.extra_quiz_questions
                ]
            if meaningful:
                seconds = min(1800, data.time_spent_seconds + data.time_spent_minutes * 60)
                details["time_spent_seconds"] = seconds
                progress["time_spent_minutes"] = (
                    progress.get("time_spent_minutes", 0) + seconds / 60
                )
                activity_types = {
                    "complete": "module_completed",
                    "read_content": "content_read",
                    "review_flashcard": "flashcard_reviewed",
                    "submit_quiz": "quiz_submitted",
                    "practice": "practice",
                }
                await self.storage.create(
                    "activities",
                    {
                        "id": event_id,
                        "user_id": user_id,
                        "module_id": module_id,
                        "course_id": course_id,
                        "activity_type": activity_types[data.action],
                        "action": data.action,
                        "request_hash": request_hash,
                        "details": details,
                        "created_at": now.isoformat(),
                    },
                )
                progress["updated_at"] = now.isoformat()
            progress.setdefault("updated_at", now.isoformat())
            if records:
                await self.storage.update("module_progress", progress["id"], progress)
            else:
                await self.storage.create("module_progress", progress)
            return self._module_response(progress, module)

    async def get_module_progress(
        self, user_id: str, module_id: str, course_id: str | None = None
    ) -> ModuleProgress | None:
        """Get progress for a specific module, only while its course is readable."""
        if course_id is None:
            module = await self.storage.get("modules", module_id)
            if not module:
                raise NotFoundException("Module not found")
            course_id = module["course_id"]
        module = await AccessService(self.storage).require_module(course_id, module_id, user_id)
        progress_records = await self.storage.list(
            "module_progress",
            {"user_id": user_id, "course_id": course_id, "module_id": module_id},
        )

        if not progress_records:
            return None

        return self._module_response(progress_records[0], module)

    @staticmethod
    def _module_response(progress: dict, module: dict) -> ModuleProgress:
        current_ids = {
            c["id"] for c in identified_cards(module["id"], module.get("flashcards", []))
        }
        return ModuleProgress(
            **{
                **progress,
                "flashcards_reviewed": len(
                    set(progress.get("reviewed_card_ids", [])) & current_ids
                ),
            }
        )

    # Course Progress

    async def get_course_progress(self, user_id: str, course_id: str) -> CourseProgressStatus:
        """Get progress for a course including all modules."""
        course = await AccessService(self.storage).require_course(course_id, user_id)
        if course.get("source") == "filesystem":
            module_service = ModuleService(self.storage)
            summaries = await module_service.list_modules(course_id)
            modules = [
                (await module_service.get_module(course_id, m.id, user_id)).model_dump()
                for m in summaries
            ]
        else:
            modules = await self.storage.list("modules", {"course_id": course_id})
        modules.sort(key=lambda m: m.get("order_index", 0))

        # Get progress for all modules in this course
        progress_records = await self.storage.list(
            "module_progress",
            {"user_id": user_id, "course_id": course_id},
        )
        progress_map = {p["module_id"]: p for p in progress_records}

        # Build module progress list
        module_statuses = []
        completed = 0
        in_progress = 0
        quiz_scores = []
        total_time = 0
        earliest_start = None
        latest_activity = None

        for module in modules:
            mod_progress = progress_map.get(module["id"])

            flashcard_count = len(module.get("flashcards", []))

            if mod_progress:
                status = ModuleProgressStatus(
                    module_id=module["id"],
                    module_title=module["title"],
                    status=mod_progress.get("status", "not_started"),
                    started_at=ensure_datetime(mod_progress.get("started_at")),
                    completed_at=ensure_datetime(mod_progress.get("completed_at")),
                    content_read=mod_progress.get("content_read", False),
                    # Review history includes repeat study sessions; deck progress
                    # must stay within the current deck size (including after edits).
                    flashcards_reviewed=len(
                        set(mod_progress.get("reviewed_card_ids", []))
                        & {
                            c["id"]
                            for c in identified_cards(module["id"], module.get("flashcards", []))
                        }
                    ),
                    flashcards_total=flashcard_count,
                    quiz_score=mod_progress.get("quiz_score"),
                    quiz_attempts=mod_progress.get("quiz_attempts", 0),
                    time_spent_minutes=mod_progress.get("time_spent_minutes", 0),
                )

                if status.status == "completed":
                    completed += 1
                elif status.status == "in_progress":
                    in_progress += 1

                if status.quiz_score is not None:
                    quiz_scores.append(status.quiz_score)

                total_time += status.time_spent_minutes

                if status.started_at:
                    if earliest_start is None or status.started_at < earliest_start:
                        earliest_start = status.started_at

                updated = ensure_datetime(mod_progress.get("updated_at"))
                if updated:
                    if latest_activity is None or updated > latest_activity:
                        latest_activity = updated
            else:
                status = ModuleProgressStatus(
                    module_id=module["id"],
                    module_title=module["title"],
                    status="not_started",
                    flashcards_total=flashcard_count,
                )

            module_statuses.append(status)

        total_modules = len(modules)
        completion_pct = (completed / total_modules * 100) if total_modules > 0 else 0
        avg_quiz = sum(quiz_scores) / len(quiz_scores) if quiz_scores else None

        return CourseProgressStatus(
            course_id=course_id,
            course_title=course["title"],
            total_modules=total_modules,
            completed_modules=completed,
            in_progress_modules=in_progress,
            completion_percentage=round(completion_pct, 1),
            average_quiz_score=round(avg_quiz, 1) if avg_quiz is not None else None,
            total_time_spent_minutes=total_time,
            started_at=earliest_start,
            last_activity_at=latest_activity,
            modules=module_statuses,
        )

    # Path Progress

    async def get_path_progress(self, user_id: str, path_id: str) -> PathProgressStatus:
        """Get progress for a learning path including all courses."""
        path = await AccessService(self.storage).require_path(path_id, user_id)

        course_ids = path.get("course_ids", [])

        # Get progress for each course
        course_statuses = []
        completed = 0
        in_progress = 0
        total_time = 0
        earliest_start = None
        latest_activity = None

        for course_id in course_ids:
            try:
                course_progress = await self.get_course_progress(user_id, course_id)
                course_statuses.append(course_progress)

                if course_progress.completion_percentage == 100:
                    completed += 1
                elif any(m.status != "not_started" for m in course_progress.modules):
                    in_progress += 1

                total_time += course_progress.total_time_spent_minutes

                if course_progress.started_at:
                    if earliest_start is None or course_progress.started_at < earliest_start:
                        earliest_start = course_progress.started_at

                if course_progress.last_activity_at:
                    if (
                        latest_activity is None
                        or course_progress.last_activity_at > latest_activity
                    ):
                        latest_activity = course_progress.last_activity_at

            except NotFoundException:
                # Course no longer exists, skip
                continue

        total_courses = len(course_ids)
        completion_pct = (
            sum(c.completion_percentage for c in course_statuses) / total_courses
            if total_courses
            else 0
        )

        return PathProgressStatus(
            path_id=path_id,
            path_title=path["title"],
            total_courses=total_courses,
            completed_courses=completed,
            in_progress_courses=in_progress,
            completion_percentage=round(completion_pct, 1),
            total_time_spent_minutes=total_time,
            started_at=earliest_start,
            last_activity_at=latest_activity,
            courses=course_statuses,
        )

    # Dashboard Stats

    async def get_dashboard_stats(self, user_id: str) -> DashboardStats:
        """Get overall dashboard statistics for a user."""
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        # Get all module progress for user
        all_progress = await self.storage.list("module_progress", {"user_id": user_id})

        # Count modules
        modules_completed_total = sum(1 for p in all_progress if p.get("status") == "completed")
        modules_completed_week = 0
        modules_completed_month = 0
        for p in all_progress:
            if p.get("status") == "completed":
                completed_at = ensure_datetime(p.get("completed_at"))
                if completed_at:
                    if completed_at >= week_ago:
                        modules_completed_week += 1
                    if completed_at >= month_ago:
                        modules_completed_month += 1

        # Quiz stats
        quiz_scores: list[float] = []
        for p in all_progress:
            score = p.get("quiz_score")
            if score is not None:
                quiz_scores.append(float(score))
        total_quizzes = sum(p.get("quiz_attempts", 0) for p in all_progress)
        avg_quiz = sum(quiz_scores) / len(quiz_scores) if quiz_scores else None

        events = await self._meaningful_events(user_id)
        # Legacy aggregate time remains in total; weekly time needs dated evidence.
        total_time = sum(p.get("time_spent_minutes", 0) for p in all_progress)
        time_this_week = sum(
            e.get("details", {}).get("time_spent_seconds", 0) / 60
            for e in events
            if week_ago <= ensure_datetime(e["created_at"]) <= now
        )

        # Get unique courses with progress
        course_ids_set: set[str] = set()
        for p in all_progress:
            cid = p.get("course_id")
            if cid:
                course_ids_set.add(cid)
        course_ids = list(course_ids_set)
        courses_in_progress = 0
        courses_completed = 0

        for course_id in course_ids:
            try:
                course_progress = await self.get_course_progress(user_id, course_id)
                if course_progress.completion_percentage == 100:
                    courses_completed += 1
                elif any(m.status != "not_started" for m in course_progress.modules):
                    courses_in_progress += 1
            except NotFoundException:
                continue

        paths = await LearningPathService(self.storage, CourseService(self.storage)).list_following(
            user_id
        )
        active_paths = 0
        completed_paths = 0
        for path in paths:
            path_progress = await self.get_path_progress(user_id, path.id)
            if path_progress.completion_percentage == 100:
                completed_paths += 1
            else:
                active_paths += 1
        streak_data = await self._calculate_streak(user_id)
        user_timezone = await self._timezone(user_id)
        sessions = self._group_sessions(events)
        study_sessions_week = sum(
            any(week_ago <= ensure_datetime(e["created_at"]) <= now for e in group)
            for group in sessions
        )
        last_activity = max((ensure_datetime(e["created_at"]) for e in events), default=None)

        return DashboardStats(
            user_id=user_id,
            active_paths=active_paths,
            selected_paths=len(paths),
            completed_selected_paths=completed_paths,
            study_sessions_week=study_sessions_week,
            timezone=user_timezone,
            courses_in_progress=courses_in_progress,
            courses_completed=courses_completed,
            modules_completed_week=modules_completed_week,
            modules_completed_month=modules_completed_month,
            modules_completed_total=modules_completed_total,
            average_quiz_score=round(avg_quiz, 1) if avg_quiz is not None else None,
            total_quizzes_taken=total_quizzes,
            total_study_time_minutes=total_time,
            study_time_this_week_minutes=time_this_week,
            current_streak=streak_data["current"],
            longest_streak=streak_data["longest"],
            last_activity_date=last_activity,
        )

    # Recent Activity

    async def get_recent_activity(self, user_id: str, limit: int = 20) -> RecentActivityResponse:
        """Get recent learning activity for a user."""
        activities = await self.storage.list("activities", {"user_id": user_id})

        # Sort by created_at descending
        activities.sort(
            key=lambda a: (
                ensure_datetime(a.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)
            ),
            reverse=True,
        )

        # Enrich with module/course titles
        enriched = []
        for activity in activities[:limit]:
            module_title = None
            course_title = None

            if activity.get("course_id"):
                try:
                    course = await AccessService(self.storage).require_course(
                        activity["course_id"], user_id
                    )
                    course_title = course.get("title")
                    if activity.get("module_id"):
                        module = await AccessService(self.storage).require_module(
                            activity["course_id"], activity["module_id"], user_id
                        )
                        module_title = module.get("title")
                except NotFoundException:
                    # Keep the learner's dated history and scores, not inaccessible titles.
                    pass

            created_at = ensure_datetime(activity["created_at"])
            if created_at:
                enriched.append(
                    RecentActivity(
                        id=activity["id"],
                        user_id=activity["user_id"],
                        activity_type=activity["activity_type"],
                        module_id=activity.get("module_id"),
                        module_title=module_title,
                        course_id=activity.get("course_id"),
                        course_title=course_title,
                        details=activity.get("details", {}),
                        created_at=created_at,
                    )
                )

        return RecentActivityResponse(activities=enriched, total=len(activities))

    # Next Up Recommendations

    async def get_next_up(self, user_id: str, limit: int = 3) -> NextUpResponse:
        """Get recommended next modules/courses to study."""
        items = []

        # Get user's learning paths
        paths = [
            p.model_dump()
            for p in await LearningPathService(
                self.storage, CourseService(self.storage)
            ).list_following(user_id)
        ]

        for path in paths:
            if len(items) >= limit:
                break

            path_progress = await self.get_path_progress(user_id, path["id"])

            for course_status in path_progress.courses:
                if len(items) >= limit:
                    break

                # Find first incomplete module in this course
                for module_status in course_status.modules:
                    if module_status.status == "in_progress":
                        items.append(
                            NextUpItem(
                                item_type="module",
                                module_id=module_status.module_id,
                                module_title=module_status.module_title,
                                course_id=course_status.course_id,
                                course_title=course_status.course_title,
                                path_id=path_progress.path_id,
                                path_title=path_progress.path_title,
                                reason="Continue where you left off",
                            )
                        )
                        break
                    elif module_status.status == "not_started":
                        # First not-started module after all completed ones
                        items.append(
                            NextUpItem(
                                item_type="module",
                                module_id=module_status.module_id,
                                module_title=module_status.module_title,
                                course_id=course_status.course_id,
                                course_title=course_status.course_title,
                                path_id=path_progress.path_id,
                                path_title=path_progress.path_title,
                                reason="Next in path",
                            )
                        )
                        break

        recommended_courses = {item.course_id for item in items}

        # A learner can study a readable course directly without following a path
        # or authoring it. Resume those courses before generic authored suggestions.
        if len(items) < limit:
            progress_records = await self.storage.list("module_progress", {"user_id": user_id})
            progress_records.sort(
                key=lambda record: ensure_datetime(record.get("updated_at"))
                or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )
            started_course_ids = []
            for record in progress_records:
                course_id = record.get("course_id")
                if (
                    course_id
                    and record.get("status") in {"in_progress", "completed"}
                    and course_id not in started_course_ids
                    and course_id not in recommended_courses
                ):
                    started_course_ids.append(course_id)
            for course_id in started_course_ids:
                try:
                    course_progress = await self.get_course_progress(user_id, course_id)
                except NotFoundException:
                    # Live access checks prevent revoked course metadata from leaking.
                    continue
                if course_progress.completion_percentage == 100:
                    continue
                module_status = next(
                    (
                        module
                        for module in course_progress.modules
                        if module.status == "in_progress"
                    ),
                    next(
                        (
                            module
                            for module in course_progress.modules
                            if module.status != "completed"
                        ),
                        None,
                    ),
                )
                if module_status:
                    items.append(
                        NextUpItem(
                            item_type="module",
                            module_id=module_status.module_id,
                            module_title=module_status.module_title,
                            course_id=course_progress.course_id,
                            course_title=course_progress.course_title,
                            reason="Continue where you left off",
                        )
                    )
                    recommended_courses.add(course_id)
                if len(items) >= limit:
                    break

        # Fill any remaining recommendations from unfinished authored courses.
        if len(items) < limit:
            courses = await self.storage.list("courses", {"author_id": user_id})
            for course in courses:
                if course["id"] in recommended_courses:
                    continue
                try:
                    course_progress = await self.get_course_progress(user_id, course["id"])
                    if course_progress.completion_percentage < 100:
                        # Find next incomplete module
                        for module_status in course_progress.modules:
                            if module_status.status != "completed":
                                items.append(
                                    NextUpItem(
                                        item_type="module",
                                        module_id=module_status.module_id,
                                        module_title=module_status.module_title,
                                        course_id=course_progress.course_id,
                                        course_title=course_progress.course_title,
                                        reason="Continue your course",
                                    )
                                )
                                recommended_courses.add(course["id"])
                                break
                except NotFoundException:
                    continue

                if len(items) >= limit:
                    break

        return NextUpResponse(items=items[:limit])

    # Helper methods

    async def _log_activity(
        self,
        user_id: str,
        activity_type: str,
        module_id: str | None,
        course_id: str | None,
        details: dict,
    ) -> None:
        """Log a user activity."""
        activity = {
            "id": str(uuid4()),
            "user_id": user_id,
            "activity_type": activity_type,
            "module_id": module_id,
            "course_id": course_id,
            "details": details,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.storage.create("activities", activity)

    async def _meaningful_events(self, user_id: str) -> list[dict]:
        # Existing dated activities are trustworthy; module.updated_at is not.
        events = await self.storage.list("activities", {"user_id": user_id})
        return sorted(
            (
                e
                for e in events
                if e.get("activity_type")
                in {
                    "content_read",
                    "flashcard_reviewed",
                    "quiz_submitted",
                    "module_completed",
                    "practice",
                }
                and ensure_datetime(e.get("created_at"))
            ),
            key=lambda e: ensure_datetime(e["created_at"]),
        )

    async def _timezone(self, user_id: str) -> str:
        user = await self.storage.get("users", user_id)
        name = (user or {}).get("timezone", "UTC")
        try:
            ZoneInfo(name)
            return name
        except (ZoneInfoNotFoundError, ValueError):
            return "UTC"

    @staticmethod
    def _group_sessions(events: list[dict]) -> list[list[dict]]:
        sessions = []
        for event in events:
            if not sessions or ensure_datetime(event["created_at"]) - ensure_datetime(
                sessions[-1][-1]["created_at"]
            ) > timedelta(minutes=30):
                sessions.append([])
            sessions[-1].append(event)
        return sessions

    async def _calculate_streak(self, user_id: str) -> dict:
        zone = ZoneInfo(await self._timezone(user_id))
        now = datetime.now(timezone.utc)
        dates = sorted(
            {
                ensure_datetime(e["created_at"]).astimezone(zone).date()
                for e in await self._meaningful_events(user_id)
                if ensure_datetime(e["created_at"]) <= now
            }
        )
        if not dates:
            return {"current": 0, "longest": 0}
        longest = run = 1
        for previous, current in zip(dates, dates[1:]):
            run = run + 1 if (current - previous).days == 1 else 1
            longest = max(longest, run)
        current = run if dates[-1] >= now.astimezone(zone).date() - timedelta(days=1) else 0
        return {"current": current, "longest": longest}

    # Legacy methods - kept for backward compatibility

    async def get_stats(self, user_id: str) -> ProgressStats:
        """DEPRECATED: Get legacy progress stats. Use get_dashboard_stats instead."""
        dashboard = await self.get_dashboard_stats(user_id)

        return ProgressStats(
            user_id=user_id,
            total_cards_reviewed=0,  # No longer tracked this way
            total_quizzes_completed=dashboard.total_quizzes_taken,
            accuracy_rate=dashboard.average_quiz_score or 0.0,
            current_streak=dashboard.current_streak,
            longest_streak=dashboard.longest_streak,
            time_spent_minutes=dashboard.total_study_time_minutes,
        )

    async def get_sessions(
        self, user_id: str, limit: int = 20, offset: int = 0
    ) -> SessionsResponse:
        """Sessions group meaningful actions; a gap over 30 minutes starts another."""
        groups = self._group_sessions(await self._meaningful_events(user_id))
        sessions = [
            Session(
                id=g[0]["id"],
                user_id=user_id,
                started_at=ensure_datetime(g[0]["created_at"]),
                ended_at=ensure_datetime(g[-1]["created_at"]),
                activity_type="study",
                module_id=g[0].get("module_id"),
                course_id=g[0].get("course_id"),
                items_completed=len(g),
            )
            for g in reversed(groups)
        ]
        return SessionsResponse(sessions=sessions[offset : offset + limit], total=len(sessions))

    async def get_topic_mastery(self, user_id: str) -> TopicMasteryResponse:
        """DEPRECATED: Returns empty response. Use course/module progress instead."""
        return TopicMasteryResponse(topics=[])

    async def start_session(
        self, user_id: str, activity_type: "Literal['study', 'quiz', 'review']"
    ) -> Session:
        """Start a new learning session."""
        session = Session(
            id=str(uuid4()),
            user_id=user_id,
            started_at=datetime.now(timezone.utc),
            ended_at=None,
            activity_type=activity_type,
            items_completed=0,
        )

        await self.storage.create("sessions", session.model_dump(mode="json"))
        return session

    async def end_session(self, session_id: str, items_completed: int) -> Session:
        """End a learning session."""
        session_data = await self.storage.get("sessions", session_id)
        if not session_data:
            raise ValueError("Session not found")

        now = datetime.now(timezone.utc)
        await self.storage.update(
            "sessions",
            session_id,
            {"ended_at": now.isoformat(), "items_completed": items_completed},
        )

        started_at = ensure_datetime(session_data["started_at"])
        if not started_at:
            started_at = now

        # Map activity type
        raw_type = session_data.get("activity_type", "study")
        session_type: "Literal['study', 'quiz', 'review']" = "study"
        if raw_type == "quiz":
            session_type = "quiz"
        elif raw_type == "review":
            session_type = "review"

        return Session(
            id=session_data["id"],
            user_id=session_data["user_id"],
            started_at=started_at,
            ended_at=now,
            activity_type=session_type,
            module_id=session_data.get("module_id"),
            course_id=session_data.get("course_id"),
            items_completed=items_completed,
        )
