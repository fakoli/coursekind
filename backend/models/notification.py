from datetime import datetime
from enum import Enum
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, EmailStr, field_validator


class NotificationChannel(str, Enum):
    EMAIL = "email"
    SMS = "sms"


class NotificationType(str, Enum):
    REMINDER = "reminder"
    DAILY_QUIZ = "daily_quiz"
    HINT = "hint"
    ENCOURAGEMENT = "encouragement"
    PROGRESS_SUMMARY = "progress_summary"


class NotificationPreferences(BaseModel):
    user_id: str

    # Email settings
    email_enabled: bool = True
    email_address: EmailStr

    # SMS settings
    sms_enabled: bool = False
    phone_number: str | None = None

    # Daily quiz
    daily_quiz_enabled: bool = True
    daily_quiz_time: str = "09:00"
    daily_quiz_channel: NotificationChannel = NotificationChannel.SMS

    # Reminders
    reminder_frequency: Literal["daily", "every_other_day", "weekly", "none"] = "daily"
    reminder_channel: NotificationChannel = NotificationChannel.EMAIL

    # Progress summary
    progress_summary_enabled: bool = True
    progress_summary_day: Literal["monday", "friday", "sunday"] = "monday"
    progress_summary_channel: NotificationChannel = NotificationChannel.EMAIL

    # Quiet hours
    quiet_hours_enabled: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    timezone: str = "UTC"

    # Per-type toggles
    send_encouragement: bool = True
    send_hints: bool = True


class NotificationPreferencesUpdate(BaseModel):
    email_enabled: bool | None = None
    email_address: EmailStr | None = None
    sms_enabled: bool | None = None
    phone_number: str | None = None
    daily_quiz_enabled: bool | None = None
    daily_quiz_time: str | None = None
    daily_quiz_channel: NotificationChannel | None = None
    reminder_frequency: Literal["daily", "every_other_day", "weekly", "none"] | None = None
    reminder_channel: NotificationChannel | None = None
    progress_summary_enabled: bool | None = None
    progress_summary_day: Literal["monday", "friday", "sunday"] | None = None
    progress_summary_channel: NotificationChannel | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None
    timezone: str | None = None
    send_encouragement: bool | None = None
    send_hints: bool | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is not None:
            try:
                ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError) as exc:
                raise ValueError("Choose a valid IANA timezone") from exc
        return value


class NotificationRecord(BaseModel):
    id: str
    user_id: str
    channel: NotificationChannel
    notification_type: NotificationType
    content: str
    sent_at: datetime
    delivered: bool = False
    delivery_status: str | None = None


class NotificationHistoryResponse(BaseModel):
    notifications: list[NotificationRecord]
    total: int


class TestNotificationRequest(BaseModel):
    pass


class TestNotificationResponse(BaseModel):
    success: bool
    message: str
