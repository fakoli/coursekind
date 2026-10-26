import re
from datetime import datetime, timezone
from uuid import uuid4

from exceptions import NotFoundException, ValidationException
from models.notification import (
    NotificationChannel,
    NotificationHistoryResponse,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    NotificationRecord,
    NotificationType,
)
from services.notifications.email_service import EmailService
from services.notifications.sms_service import SMSService
from storage.base import StorageBackend


class NotificationService:
    def __init__(
        self, storage: StorageBackend, email_service: EmailService, sms_service: SMSService
    ):
        self.storage = storage
        self.email_service = email_service
        self.sms_service = sms_service

    def _with_availability(self, data: dict) -> NotificationPreferences:
        return NotificationPreferences(
            **{
                **data,
                "email_available": bool(self.email_service.is_configured),
                "sms_available": bool(self.sms_service.is_configured),
            }
        )

    async def get_preferences(self, user_id: str, email: str) -> NotificationPreferences:
        """Get notification preferences for a user."""
        prefs_data = await self.storage.get("notification_preferences", user_id)

        user = await self.storage.get("users", user_id)
        canonical_timezone = (user or {}).get("timezone", "UTC")
        if prefs_data:
            return self._with_availability({**prefs_data, "timezone": canonical_timezone})

        default_prefs = NotificationPreferences(
            user_id=user_id,
            email_address=email,
            timezone=canonical_timezone,
        )
        data = default_prefs.model_dump()
        data["id"] = user_id  # Use user_id as document id
        await self.storage.create("notification_preferences", data)
        return self._with_availability(data)

    async def update_preferences(
        self, user_id: str, updates: NotificationPreferencesUpdate
    ) -> NotificationPreferences:
        """Update notification preferences."""
        async with self.storage.transaction():
            prefs_data = await self.storage.get("notification_preferences", user_id)
            if not prefs_data:
                raise NotFoundException("Notification preferences not found")
            update_dict = updates.model_dump(exclude_unset=True)
            candidate = {**prefs_data, **update_dict}
            if candidate.get("sms_enabled") and not re.fullmatch(
                r"\+[1-9]\d{1,14}", candidate.get("phone_number") or ""
            ):
                raise ValidationException(
                    "SMS requires a phone number in international E.164 format, "
                    "such as +12025550123"
                )
            user = await self.storage.get("users", user_id)
            canonical = (user or {}).get("timezone", "UTC")
            if update_dict.get("timezone") is not None:
                canonical = update_dict["timezone"]
                await self.storage.update("users", user_id, {"timezone": canonical})
            update_dict["timezone"] = canonical
            updated = await self.storage.update("notification_preferences", user_id, update_dict)
            return self._with_availability(updated)

    async def get_history(
        self, user_id: str, limit: int = 50, offset: int = 0
    ) -> NotificationHistoryResponse:
        """Get notification history for a user."""
        records = await self.storage.list("notifications", {"user_id": user_id})

        records.sort(
            key=lambda r: (
                r["sent_at"]
                if isinstance(r["sent_at"], datetime)
                else datetime.fromisoformat(r["sent_at"])
            ),
            reverse=True,
        )

        notification_list = [
            NotificationRecord(
                id=r["id"],
                user_id=r["user_id"],
                channel=r["channel"],
                notification_type=r["notification_type"],
                content=r["content"],
                sent_at=datetime.fromisoformat(r["sent_at"])
                if isinstance(r["sent_at"], str)
                else r["sent_at"],
                delivered=r.get("delivered", False),
                delivery_status=r.get("delivery_status"),
            )
            for r in records[offset : offset + limit]
        ]

        return NotificationHistoryResponse(notifications=notification_list, total=len(records))

    async def _record_notification(
        self,
        user_id: str,
        channel: NotificationChannel,
        notification_type: NotificationType,
        content: str,
        delivered: bool,
        delivery_status: str | None = None,
    ) -> NotificationRecord:
        """Record a sent notification."""
        record = NotificationRecord(
            id=str(uuid4()),
            user_id=user_id,
            channel=channel,
            notification_type=notification_type,
            content=content,
            sent_at=datetime.now(timezone.utc),
            delivered=delivered,
            delivery_status=delivery_status,
        )

        await self.storage.create("notifications", record.model_dump())
        return record

    async def test_email(self, user_id: str) -> tuple[bool, str]:
        """Send a test email notification."""
        prefs = await self.storage.get("notification_preferences", user_id)
        if not prefs:
            return False, "Notification preferences not found"

        if not prefs.get("email_enabled"):
            return False, "Email notifications are disabled"
        if not self.email_service.is_configured:
            return False, "Email delivery is unavailable: provider is not configured"
        email_address = prefs.get("email_address")
        if not email_address:
            return False, "No email address configured"

        success = await self.email_service.send(
            to=email_address,
            subject="Study Buddy - Test Email",
            template="test",
            context={"user_name": "Learner"},
        )

        message = "Test email sent successfully" if success else "Failed to send test email"

        await self._record_notification(
            user_id=user_id,
            channel=NotificationChannel.EMAIL,
            notification_type=NotificationType.REMINDER,
            content="Test email notification",
            delivered=success,
            delivery_status=message,
        )

        return success, message

    async def test_sms(self, user_id: str) -> tuple[bool, str]:
        """Send a test SMS notification."""
        prefs = await self.storage.get("notification_preferences", user_id)
        if not prefs:
            return False, "Notification preferences not found"

        if not prefs.get("sms_enabled"):
            return False, "SMS notifications are disabled"
        if not self.sms_service.is_configured:
            return False, "SMS delivery is unavailable: provider is not configured"
        phone_number = prefs.get("phone_number")
        if not phone_number:
            return False, "No phone number configured"

        success = await self.sms_service.send(
            to=phone_number,
            message="Study Buddy: This is a test SMS notification!",
        )

        message = "Test SMS sent successfully" if success else "Failed to send test SMS"

        await self._record_notification(
            user_id=user_id,
            channel=NotificationChannel.SMS,
            notification_type=NotificationType.REMINDER,
            content="Test SMS notification",
            delivered=success,
            delivery_status=message,
        )

        return success, message

    async def send_reminder(self, user_id: str, content: str) -> bool:
        """Send a study reminder based on user preferences."""
        prefs = await self.storage.get("notification_preferences", user_id)
        if not prefs or prefs.get("reminder_frequency") == "none":
            return False

        channel = prefs.get("reminder_channel", NotificationChannel.EMAIL)
        success = False

        if channel == NotificationChannel.EMAIL and prefs.get("email_enabled"):
            success = await self.email_service.send(
                to=prefs["email_address"],
                subject="Study Buddy - Time to Study!",
                template="reminder",
                context={"content": content},
            )
        elif (
            channel == NotificationChannel.SMS
            and prefs.get("sms_enabled")
            and prefs.get("phone_number")
        ):
            success = await self.sms_service.send(
                to=prefs["phone_number"],
                message=f"📚 Study Buddy: {content}",
            )

        await self._record_notification(
            user_id=user_id,
            channel=channel,
            notification_type=NotificationType.REMINDER,
            content=content,
            delivered=success,
        )

        return success
