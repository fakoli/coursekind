"""Progress service - tracks user progress through modules, courses, and paths."""

from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from exceptions import ErrorCode, NotFoundException
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
from storage.base import StorageBackend
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
        """Update progress for a module based on user action."""
        now = datetime.now(timezone.utc)

        # Get or create module progress record
        progress_records = await self.storage.list(
            "module_progress",
            {"user_id": user_id, "module_id": module_id},
        )
        progress = progress_records[0] if progress_records else None

        if not progress:
            # Create new progress record
            progress = {
                "id": str(uuid4()),
                "user_id": user_id,
                "module_id": module_id,
                "course_id": course_id,
                "status": "not_started",
                "started_at": None,
                "completed_at": None,
                "content_read": False,
                "flashcards_reviewed": 0,
                "quiz_score": None,
                "quiz_attempts": 0,
                "last_quiz_at": None,
                "time_spent_minutes": 0,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }

        # Process action
        if data.action == "start":
            if progress["status"] == "not_started":
                progress["status"] = "in_progress"
                progress["started_at"] = now.isoformat()
            await self._log_activity(
                user_id, "module_started", module_id, course_id, {}
            )

        elif data.action == "complete":
            progress["status"] = "completed"
            progress["completed_at"] = now.isoformat()
            await self._log_activity(
                user_id, "module_completed", module_id, course_id, {}
            )

        elif data.action == "read_content":
            progress["content_read"] = True
            if progress["status"] == "not_started":
                progress["status"] = "in_progress"
                progress["started_at"] = now.isoformat()
            await self._log_activity(
                user_id, "content_read", module_id, course_id, {}
            )

        elif data.action == "review_flashcard":
            progress["flashcards_reviewed"] = progress.get("flashcards_reviewed", 0) + 1
            if progress["status"] == "not_started":
                progress["status"] = "in_progress"
                progress["started_at"] = now.isoformat()
            await self._log_activity(
                user_id, "flashcard_reviewed", module_id, course_id,
                {"cards_reviewed": progress["flashcards_reviewed"]}
            )

        elif data.action == "submit_quiz":
            progress["quiz_attempts"] = progress.get("quiz_attempts", 0) + 1
            progress["last_quiz_at"] = now.isoformat()
            if data.quiz_score is not None:
                progress["quiz_score"] = data.quiz_score
            if progress["status"] == "not_started":
                progress["status"] = "in_progress"
                progress["started_at"] = now.isoformat()
            await self._log_activity(
                user_id,
                "quiz_submitted",
                module_id,
                course_id,
                {"score": data.quiz_score, "attempt": progress["quiz_attempts"]},
            )

        # Add time spent
        if data.time_spent_minutes > 0:
            progress["time_spent_minutes"] = (
                progress.get("time_spent_minutes", 0) + data.time_spent_minutes
            )

        progress["updated_at"] = now.isoformat()

        # Save
        if progress_records:
            await self.storage.update("module_progress", progress["id"], progress)
        else:
            await self.storage.create("module_progress", progress)

        return ModuleProgress(**progress)

    async def get_module_progress(
        self, user_id: str, module_id: str
    ) -> ModuleProgress | None:
        """Get progress for a specific module."""
        progress_records = await self.storage.list(
            "module_progress",
            {"user_id": user_id, "module_id": module_id},
        )

        if not progress_records:
            return None

        return ModuleProgress(**progress_records[0])

    # Course Progress

    async def get_course_progress(
        self, user_id: str, course_id: str
    ) -> CourseProgressStatus:
        """Get progress for a course including all modules."""
        # Get course
        course = await self.storage.get("courses", course_id)
        if not course:
            raise NotFoundException("Course not found", code=ErrorCode.COURSE_NOT_FOUND)

        # Get modules
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
                    flashcards_reviewed=min(
                        mod_progress.get("flashcards_reviewed", 0), flashcard_count
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
            average_quiz_score=round(avg_quiz, 1) if avg_quiz else None,
            total_time_spent_minutes=total_time,
            started_at=earliest_start,
            last_activity_at=latest_activity,
            modules=module_statuses,
        )

    # Path Progress

    async def get_path_progress(
        self, user_id: str, path_id: str
    ) -> PathProgressStatus:
        """Get progress for a learning path including all courses."""
        # Get path
        path = await self.storage.get("learning_paths", path_id)
        if not path:
            raise NotFoundException(
                "Learning path not found", code=ErrorCode.LEARNING_PATH_NOT_FOUND
            )

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
                elif course_progress.completion_percentage > 0:
                    in_progress += 1

                total_time += course_progress.total_time_spent_minutes

                if course_progress.started_at:
                    if earliest_start is None or course_progress.started_at < earliest_start:
                        earliest_start = course_progress.started_at

                if course_progress.last_activity_at:
                    if latest_activity is None or course_progress.last_activity_at > latest_activity:
                        latest_activity = course_progress.last_activity_at

            except NotFoundException:
                # Course no longer exists, skip
                continue

        total_courses = len(course_statuses)
        completion_pct = (completed / total_courses * 100) if total_courses > 0 else 0

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
        modules_completed_total = sum(
            1 for p in all_progress if p.get("status") == "completed"
        )
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

        # Time stats
        total_time = sum(p.get("time_spent_minutes", 0) for p in all_progress)
        time_this_week = 0
        for p in all_progress:
            updated = ensure_datetime(p.get("updated_at"))
            if updated and updated >= week_ago:
                time_this_week += p.get("time_spent_minutes", 0)

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
                elif course_progress.completion_percentage > 0:
                    courses_in_progress += 1
            except NotFoundException:
                continue

        # Get active paths
        paths = await self.storage.list("learning_paths", {"owner_id": user_id})
        active_paths = 0
        for path in paths:
            path_progress = await self.get_path_progress(user_id, path["id"])
            if path_progress.completion_percentage > 0 and path_progress.completion_percentage < 100:
                active_paths += 1

        # Calculate streak
        streak_data = await self._calculate_streak(user_id)

        # Last activity
        last_activity = None
        for p in all_progress:
            updated = ensure_datetime(p.get("updated_at"))
            if updated and (last_activity is None or updated > last_activity):
                last_activity = updated

        return DashboardStats(
            user_id=user_id,
            active_paths=active_paths,
            courses_in_progress=courses_in_progress,
            courses_completed=courses_completed,
            modules_completed_week=modules_completed_week,
            modules_completed_month=modules_completed_month,
            modules_completed_total=modules_completed_total,
            average_quiz_score=round(avg_quiz, 1) if avg_quiz else None,
            total_quizzes_taken=total_quizzes,
            total_study_time_minutes=total_time,
            study_time_this_week_minutes=time_this_week,
            current_streak=streak_data["current"],
            longest_streak=streak_data["longest"],
            last_activity_date=last_activity,
        )

    # Recent Activity

    async def get_recent_activity(
        self, user_id: str, limit: int = 20
    ) -> RecentActivityResponse:
        """Get recent learning activity for a user."""
        activities = await self.storage.list("activities", {"user_id": user_id})

        # Sort by created_at descending
        activities.sort(
            key=lambda a: ensure_datetime(a.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        # Enrich with module/course titles
        enriched = []
        for activity in activities[:limit]:
            module_title = None
            course_title = None

            if activity.get("module_id"):
                module = await self.storage.get("modules", activity["module_id"])
                if module:
                    module_title = module.get("title")

            if activity.get("course_id"):
                course = await self.storage.get("courses", activity["course_id"])
                if course:
                    course_title = course.get("title")

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
        paths = await self.storage.list("learning_paths", {"owner_id": user_id})

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

        # If no path items, suggest from user's courses
        if not items:
            courses = await self.storage.list("courses", {"author_id": user_id})
            for course in courses[:limit]:
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

    async def _calculate_streak(self, user_id: str) -> dict:
        """Calculate current and longest streak from module progress activity."""
        all_progress = await self.storage.list("module_progress", {"user_id": user_id})

        activity_dates = set()

        for p in all_progress:
            updated = ensure_datetime(p.get("updated_at"))
            if updated:
                activity_dates.add(updated.date())

        if not activity_dates:
            return {"current": 0, "longest": 0}

        sorted_dates = sorted(activity_dates)

        # Calculate longest streak
        longest_streak = 1
        streak = 1

        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
                streak += 1
                longest_streak = max(longest_streak, streak)
            else:
                streak = 1

        # Calculate current streak
        today = datetime.now(timezone.utc).date()
        yesterday = today - timedelta(days=1)

        if sorted_dates[-1] == today or sorted_dates[-1] == yesterday:
            current_streak = 1
            for i in range(len(sorted_dates) - 1, 0, -1):
                if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
                    current_streak += 1
                else:
                    break
        else:
            current_streak = 0

        return {"current": current_streak, "longest": longest_streak}

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
        """Get session history - now returns activity-based sessions."""
        activities = await self.storage.list("activities", {"user_id": user_id})

        activities.sort(
            key=lambda a: ensure_datetime(a.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        # Convert activities to session format
        sessions = []
        for activity in activities[offset : offset + limit]:
            activity_type_raw = activity.get("activity_type", "study")
            # Map new activity types to legacy session types
            session_type: "Literal['study', 'quiz', 'review']" = "study"
            if "quiz" in activity_type_raw:
                session_type = "quiz"
            elif "review" in activity_type_raw:
                session_type = "review"

            created_at = ensure_datetime(activity["created_at"])
            if created_at:
                sessions.append(
                    Session(
                        id=activity["id"],
                        user_id=activity["user_id"],
                        started_at=created_at,
                        ended_at=created_at,
                        activity_type=session_type,
                        module_id=activity.get("module_id"),
                        course_id=activity.get("course_id"),
                        items_completed=1,
                    )
                )

        return SessionsResponse(sessions=sessions, total=len(activities))

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
            "sessions", session_id, {"ended_at": now.isoformat(), "items_completed": items_completed}
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
