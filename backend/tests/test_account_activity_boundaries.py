from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from exceptions import ValidationException
from models.module import Module, ModuleCreate, ModuleUpdate
from models.notification import NotificationPreferencesUpdate
from services.notification_service import NotificationService
from services.notifications.email_service import EmailService
from services.notifications.sms_service import SMSService


@pytest.mark.parametrize(
    "activity",
    [
        {"flashcards": [{"front": "draft", "back": " "}]},
        {"quiz": {"questions": [{"question": "Q", "options": ["A", " "], "correct_index": 0}]}},
        {"quiz": {"questions": [{"question": " ", "options": ["A", "B"], "correct_index": 0}]}},
        {"quiz": {"questions": [{"question": "Q", "options": ["A", "B"], "correct_index": 2}]}},
    ],
)
def test_new_activity_writes_require_complete_content(activity):
    with pytest.raises(ValidationError):
        ModuleCreate(title="Lesson", order_index=0, **activity)
    with pytest.raises(ValidationError):
        ModuleUpdate(**activity)


def test_legacy_blank_quiz_remains_readable_and_repairable():
    module = Module(
        id="m",
        course_id="c",
        title="Legacy",
        order_index=0,
        created_at="2026-10-01T00:00:00Z",
        updated_at="2026-10-01T00:00:00Z",
        quiz={"questions": [{"question": "Q", "options": ["A", ""], "correct_index": 0}]},
    )
    assert module.quiz.questions[0].options == ["A", ""]
    repaired = ModuleUpdate(
        quiz={"questions": [{"question": "Q", "options": ["A", "B"], "correct_index": 0}]}
    )
    assert repaired.quiz.questions[0].options == ["A", "B"]


@pytest.mark.asyncio
async def test_unconfigured_adapters_never_claim_delivery():
    settings = SimpleNamespace(
        mailgun_api_key="",
        mailgun_domain="",
        twilio_account_sid="",
        twilio_auth_token="",
        twilio_phone_number="",
    )
    assert not await EmailService(settings).send("test@example.com", "Test", "test", {})
    assert not await SMSService(settings).send("+12025550123", "Test")


@pytest.mark.asyncio
async def test_sms_requires_e164_when_enabled_without_losing_old_preferences(storage):
    fake = SimpleNamespace(is_configured=True)
    service = NotificationService(storage, fake, fake)
    await service.get_preferences("user", "test@example.com")
    with pytest.raises(ValidationException):
        await service.update_preferences(
            "user", NotificationPreferencesUpdate(sms_enabled=True, phone_number="555-1234")
        )
    assert not (await service.get_preferences("user", "test@example.com")).sms_enabled


@pytest.mark.asyncio
async def test_delivery_uses_only_captured_adapters_and_respects_saved_preferences(storage):
    class CapturedAdapter:
        is_configured = True

        def __init__(self):
            self.calls = []

        async def send(self, **kwargs):
            self.calls.append(kwargs)
            return True

    email, sms = CapturedAdapter(), CapturedAdapter()
    service = NotificationService(storage, email, sms)
    prefs = await service.get_preferences("one", "one@example.com")
    await service.get_preferences("two", "two@example.com")
    assert prefs.email_available and prefs.sms_available
    await service.update_preferences(
        "one", NotificationPreferencesUpdate(phone_number="+12025550123", sms_enabled=True)
    )
    assert (await service.test_sms("one"))[0]
    assert sms.calls == [
        {"to": "+12025550123", "message": "Study Buddy: This is a test SMS notification!"}
    ]
    assert (await service.test_email("one"))[0]
    assert email.calls[0]["to"] == "one@example.com"
    await service.update_preferences(
        "one", NotificationPreferencesUpdate(sms_enabled=False, email_enabled=False)
    )
    assert not (await service.test_sms("one"))[0]
    assert not (await service.test_email("one"))[0]
    assert not await service.send_reminder("one", "Reminder")
    assert len(email.calls) == len(sms.calls) == 1
    assert not (await service.get_preferences("two", "two@example.com")).sms_enabled
    assert (await service.get_preferences("two", "two@example.com")).email_enabled


@pytest.mark.asyncio
async def test_api_rejects_bad_write_and_opens_legacy_quiz_for_repair(
    client, auth_headers, course_with_modules
):
    from config import get_settings
    from storage import get_storage_backend

    course, modules = course_with_modules["course"], course_with_modules["modules"]
    module_id = modules[0]["id"]
    route = f"/api/v1/courses/{course['id']}/modules/{module_id}"
    legacy = {"questions": [{"question": "Old question", "options": ["A", ""], "correct_index": 0}]}
    storage = get_storage_backend(get_settings())
    await storage.update("modules", module_id, {"quiz": legacy})
    response = await client.get(route, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["quiz"] == legacy | {
        "questions": [legacy["questions"][0] | {"explanation": None}]
    }
    bad = await client.put(route, headers=auth_headers, json={"quiz": legacy})
    assert bad.status_code == 422
    repaired = {
        "questions": [{"question": "Old question", "options": ["A", "B"], "correct_index": 0}]
    }
    response = await client.put(route, headers=auth_headers, json={"quiz": repaired})
    assert response.status_code == 200
    assert response.json()["id"] == module_id
    assert response.json()["quiz"]["questions"][0]["options"] == ["A", "B"]
