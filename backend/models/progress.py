from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.module import QuizQuestionData


class ModuleProgressStatus(BaseModel):
    """Progress status for a single module."""

    module_id: str
    module_title: str
    status: Literal["not_started", "in_progress", "completed"] = "not_started"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    content_read: bool = False
    flashcards_reviewed: int = 0
    flashcards_total: int = 0
    quiz_score: float | None = None
    quiz_attempts: int = 0
    time_spent_minutes: float = 0


class ModuleProgress(BaseModel):
    """User's progress on a specific module."""

    id: str
    user_id: str
    module_id: str
    course_id: str
    status: Literal["not_started", "in_progress", "completed"] = "not_started"
    started_at: datetime | None = None
    completed_at: datetime | None = None
    content_read: bool = False
    flashcards_reviewed: int = 0
    quiz_score: float | None = None
    quiz_attempts: int = 0
    last_quiz_at: datetime | None = None
    time_spent_minutes: float = 0
    reviewed_card_ids: list[str] = Field(default_factory=list)
    practice_code: str | None = None
    extra_quiz_questions: list[QuizQuestionData] = Field(default_factory=list)
    quiz_history: list[dict] = Field(default_factory=list)
    practice_history: list[dict] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ModuleProgressCreate(BaseModel):
    """Request to start/update module progress."""

    action: Literal[
        "start",
        "complete",
        "read_content",
        "review_flashcard",
        "submit_quiz",
        "practice",
        "save_state",
    ]
    quiz_score: float | None = Field(None, ge=0, le=100)
    time_spent_minutes: float = Field(0, ge=0, le=30)
    time_spent_seconds: float = Field(0, ge=0, le=1800)
    event_id: str | None = Field(None, min_length=1, max_length=200)
    flashcard_id: str | None = None
    quiz_answers: dict[str, int] | None = None
    practice_code: str | None = None
    practice_result: dict | None = None
    extra_quiz_questions: list[QuizQuestionData] | None = None


class CourseProgressStatus(BaseModel):
    """Progress status for a course."""

    course_id: str
    course_title: str
    total_modules: int = 0
    completed_modules: int = 0
    in_progress_modules: int = 0
    completion_percentage: float = 0.0
    average_quiz_score: float | None = None
    total_time_spent_minutes: float = 0
    started_at: datetime | None = None
    last_activity_at: datetime | None = None
    modules: list[ModuleProgressStatus] = Field(default_factory=list)


class PathProgressStatus(BaseModel):
    """Progress status for a learning path."""

    path_id: str
    path_title: str
    total_courses: int = 0
    completed_courses: int = 0
    in_progress_courses: int = 0
    completion_percentage: float = 0.0
    total_time_spent_minutes: float = 0
    started_at: datetime | None = None
    last_activity_at: datetime | None = None
    courses: list[CourseProgressStatus] = Field(default_factory=list)


class DashboardStats(BaseModel):
    """User's overall learning dashboard statistics."""

    user_id: str

    # Activity counts
    active_paths: int = 0
    selected_paths: int = 0
    completed_selected_paths: int = 0
    study_sessions_week: int = 0
    timezone: str = "UTC"
    courses_in_progress: int = 0
    courses_completed: int = 0
    modules_completed_week: int = 0
    modules_completed_month: int = 0
    modules_completed_total: int = 0

    # Performance
    average_quiz_score: float | None = None
    total_quizzes_taken: int = 0

    # Time
    total_study_time_minutes: float = 0
    study_time_this_week_minutes: float = 0

    # Streaks
    current_streak: int = 0
    longest_streak: int = 0
    last_activity_date: datetime | None = None


class RecentActivity(BaseModel):
    """A single recent activity entry."""

    id: str
    user_id: str
    activity_type: Literal[
        "module_started",
        "module_completed",
        "quiz_submitted",
        "content_read",
        "flashcard_reviewed",
        "practice",
    ]
    module_id: str | None = None
    module_title: str | None = None
    course_id: str | None = None
    course_title: str | None = None
    details: dict = Field(default_factory=dict)
    created_at: datetime


class RecentActivityResponse(BaseModel):
    """Recent activity list response."""

    activities: list[RecentActivity]
    total: int


class NextUpItem(BaseModel):
    """Recommended next module/course to study."""

    item_type: Literal["module", "course"]
    module_id: str | None = None
    module_title: str | None = None
    course_id: str
    course_title: str
    path_id: str | None = None
    path_title: str | None = None
    reason: str  # e.g., "Continue where you left off", "Next in path"


class NextUpResponse(BaseModel):
    """Recommended next steps."""

    items: list[NextUpItem]


# Legacy models kept for backward compatibility with session tracking
class Session(BaseModel):
    id: str
    user_id: str
    started_at: datetime
    ended_at: datetime | None = None
    activity_type: Literal["study", "quiz", "review"]
    module_id: str | None = None
    course_id: str | None = None
    items_completed: int = 0


class SessionResponse(Session):
    pass


class SessionsResponse(BaseModel):
    sessions: list[Session]
    total: int


# Legacy - kept for any remaining references but deprecated
class ProgressStats(BaseModel):
    """DEPRECATED: Use DashboardStats instead."""

    user_id: str
    total_cards_reviewed: int = 0
    total_quizzes_completed: int = 0
    accuracy_rate: float = 0.0
    current_streak: int = 0
    longest_streak: int = 0
    time_spent_minutes: float = 0


class TopicMastery(BaseModel):
    """DEPRECATED: Mastery is now tracked per module."""

    topic: str
    deck_id: str | None = None
    total_cards: int = 0
    mastered_cards: int = 0
    mastery_percentage: float = 0.0
    last_reviewed: datetime | None = None


class TopicMasteryResponse(BaseModel):
    """DEPRECATED: Use module/course progress instead."""

    topics: list[TopicMastery] = Field(default_factory=list)
