"""Capture-only identity checks. No notification is delivered."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx

from config import Settings
from services.notification_service import NotificationService
from services.notifications.email_service import EmailService
from services.notifications.sms_service import SMSService


async def test_email_transport_sender_and_fallback_template(monkeypatch):
    captured = []

    class CaptureClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, **kwargs):
            captured.append(kwargs["data"])
            return httpx.Response(200)

    monkeypatch.setattr(httpx, "AsyncClient", CaptureClient)
    service = EmailService(
        Settings(_env_file=None, mailgun_api_key="synthetic", mailgun_domain="example.invalid")
    )
    assert await service.send(
        "learner@example.invalid", "Coursekind test", "missing", {"content": "Hello"}
    )
    assert captured[0]["from"] == "Coursekind <noreply@example.invalid>"
    assert "The Coursekind Team" in captured[0]["html"]
    assert "Study Buddy" not in captured[0]["html"]


async def test_notification_subjects_and_sms_are_coursekind():
    prefs = {
        "email_enabled": True,
        "sms_enabled": True,
        "email_address": "learner@example.invalid",
        "phone_number": "+12025550123",
        "reminder_frequency": "daily",
        "reminder_channel": "email",
    }
    store = SimpleNamespace(get=AsyncMock(return_value=prefs), create=AsyncMock())
    email = SimpleNamespace(is_configured=True, send=AsyncMock(return_value=True))
    sms = SimpleNamespace(is_configured=True, send=AsyncMock(return_value=True))
    service = NotificationService(store, email, sms)
    await service.test_email("synthetic")
    await service.test_sms("synthetic")
    await service.send_reminder("synthetic", "Practice addition")
    prefs["reminder_channel"] = "sms"
    await service.send_reminder("synthetic", "Practice addition")
    assert all("Coursekind" in call.kwargs["subject"] for call in email.send.call_args_list)
    assert all("Coursekind" in call.kwargs["message"] for call in sms.send.call_args_list)
    assert "Coursekind" in await SMSService(Settings(_env_file=None)).handle_reply(
        "synthetic", "STOP"
    )
