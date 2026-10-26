import os
import shutil
import tempfile

# Ensure the app is importable during test collection on a clean checkout:
# the Settings validator rejects the default JWT_SECRET when DEBUG is unset,
# which would fail at `from main import app` below. Set DEBUG=true before
# any app import (a real value is also set per-test in the autouse fixture).
os.environ.setdefault("DEBUG", "true")

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from storage.json_storage import JSONStorage


@pytest.fixture
def temp_storage_path():
    path = tempfile.mkdtemp()
    yield path
    shutil.rmtree(path)


@pytest.fixture
def storage(temp_storage_path):
    return JSONStorage(temp_storage_path)


@pytest.fixture(autouse=True)
def use_test_storage(temp_storage_path, monkeypatch):
    """Ensure tests use temporary storage."""
    from config import get_settings
    from storage import reset_storage

    # Reset the storage singleton before each test
    reset_storage()
    get_settings.cache_clear()

    monkeypatch.setenv("STORAGE_PATH", temp_storage_path)
    monkeypatch.setenv("DEBUG", "true")  # Allow default JWT secret in tests

    yield

    # Clean up after test
    reset_storage()
    get_settings.cache_clear()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client):
    """Create a test user and return auth headers."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "test@example.com",
            "name": "Test User",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 200

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "testpassword123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def other_user_headers(client):
    """Create another test user and return auth headers for access control tests."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "other@example.com",
            "name": "Other User",
            "password": "otherpassword123",
        },
    )
    assert response.status_code == 200

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "other@example.com", "password": "otherpassword123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


async def _create_course(client, headers, title="Test Course", **overrides):
    """Create a course owned by the authenticated user."""
    payload = {
        "title": title,
        "description": "A test course",
        **overrides,
    }
    response = await client.post("/api/v1/courses", json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
async def course_with_modules(client, auth_headers):
    """Create a course with modules for testing the current domain."""
    course = await _create_course(client, auth_headers)

    modules = []
    for i in range(3):
        response = await client.post(
            f"/api/v1/courses/{course['id']}/modules",
            json={
                "title": f"Module {i + 1}",
                "order_index": i,
                "content_markdown": f"# Module {i + 1} content",
                "flashcards": [
                    {"front": f"Question {i + 1}", "back": f"Answer {i + 1}"}
                ],
                "quiz": {
                    "questions": [
                        {
                            "question": f"Q{i + 1}?",
                            "options": ["A", "B", "C"],
                            "correct_index": 0,
                            "explanation": None,
                        }
                    ]
                },
            },
            headers=auth_headers,
        )
        assert response.status_code == 200, response.text
        modules.append(response.json())

    return {"course": course, "modules": modules}


@pytest.fixture
async def other_user_course(client, other_user_headers):
    """Create a course owned by another user for forbidden access tests."""
    return await _create_course(
        client, other_user_headers, title="Other User Course", description="Should not be accessible"
    )
