"""API regressions for sandbox persistence and activity after card reviews."""

import pytest


SANDBOX = {
    "language": "python",
    "starter_code": "print(2 + 3)",
    "solution_code": "print(5)",
    "instructions": "Print the sum.",
}


@pytest.mark.asyncio
async def test_outline_description_survives_create_edit_and_summaries(
    client, auth_headers, course_with_modules
):
    course_id = course_with_modules["course"]["id"]
    base = f"/api/v1/courses/{course_id}/modules"
    created = await client.post(base, json={
        "title": "Outline", "description": "Brief outline", "order_index": 3,
    }, headers=auth_headers)
    assert created.json()["description"] == "Brief outline"
    module_id = created.json()["id"]
    updated = await client.put(f"{base}/{module_id}", json={"description": "Edited outline"},
                               headers=auth_headers)
    assert updated.json()["description"] == "Edited outline"
    for path in [base, f"/api/v1/courses/{course_id}"]:
        loaded = (await client.get(path, headers=auth_headers)).json()
        modules = loaded if isinstance(loaded, list) else loaded["modules"]
        assert next(m for m in modules if m["id"] == module_id)["description"] == "Edited outline"


@pytest.mark.asyncio
@pytest.mark.parametrize("batch", [False, True])
async def test_sandbox_survives_create_and_read(client, auth_headers, batch):
    course = await client.post(
        "/api/v1/courses", json={"title": "Sandbox course"}, headers=auth_headers
    )
    base = f"/api/v1/courses/{course.json()['id']}/modules"
    payload = {"title": "Practice", "order_index": 0, "sandbox": SANDBOX}
    response = await client.post(
        f"{base}/batch" if batch else base,
        json={"modules": [payload]} if batch else payload,
        headers=auth_headers,
    )
    assert response.status_code == 200
    module = response.json()["created"][0] if batch else response.json()
    assert module["sandbox"] == SANDBOX
    loaded = await client.get(f"{base}/{module['id']}", headers=auth_headers)
    assert loaded.json()["sandbox"] == SANDBOX


@pytest.mark.asyncio
async def test_sandbox_update_and_explicit_removal(client, auth_headers, course_with_modules):
    course_id = course_with_modules["course"]["id"]
    module_id = course_with_modules["modules"][0]["id"]
    path = f"/api/v1/courses/{course_id}/modules/{module_id}"
    response = await client.put(path, json={"sandbox": SANDBOX}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["sandbox"] == SANDBOX
    assert (await client.get(path, headers=auth_headers)).json()["sandbox"] == SANDBOX
    response = await client.put(path, json={"sandbox": None}, headers=auth_headers)
    assert response.json()["sandbox"] is None
    assert (await client.get(path, headers=auth_headers)).json()["sandbox"] is None


@pytest.mark.asyncio
async def test_activity_remains_available_after_flashcard_review(
    client, auth_headers, course_with_modules
):
    course_id = course_with_modules["course"]["id"]
    module_id = course_with_modules["modules"][0]["id"]
    path = f"/api/v1/progress/modules/{course_id}/{module_id}"
    for action in ({"action": "read_content"}, {"action": "review_flashcard"},
                   {"action": "submit_quiz", "quiz_score": 100}, {"action": "complete"}):
        assert (await client.post(path, json=action, headers=auth_headers)).status_code == 200
    response = await client.get("/api/v1/progress/activity", headers=auth_headers)
    assert response.status_code == 200
    events = response.json()["activities"]
    assert {e["activity_type"] for e in events} == {
        "content_read", "flashcard_reviewed", "quiz_submitted", "module_completed"
    }
    reviewed = next(e for e in events if e["activity_type"] == "flashcard_reviewed")
    assert reviewed["module_title"] == "Module 1"
    assert reviewed["details"]["cards_reviewed"] == 1


@pytest.mark.asyncio
async def test_deck_progress_is_bounded_after_repeated_study_sessions(
    client, auth_headers, course_with_modules
):
    course_id = course_with_modules["course"]["id"]
    module_id = course_with_modules["modules"][0]["id"]
    for _ in range(3):
        response = await client.post(f"/api/v1/progress/modules/{course_id}/{module_id}",
                                    json={"action": "review_flashcard"}, headers=auth_headers)
        assert response.status_code == 200
    progress = (await client.get(f"/api/v1/progress/courses/{course_id}",
                                headers=auth_headers)).json()
    module = next(m for m in progress["modules"] if m["module_id"] == module_id)
    assert module["flashcards_total"] == 1
    assert module["flashcards_reviewed"] == 1
    events = (await client.get("/api/v1/progress/activity", headers=auth_headers)).json()
    assert events["total"] == 3  # The history still records each study session.
