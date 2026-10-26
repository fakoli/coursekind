"""Learning-path course cards must show live module counts."""

import pytest


@pytest.mark.asyncio
async def test_path_course_counts_follow_module_additions_and_removals(
    client, auth_headers, course_with_modules
):
    course_id = course_with_modules["course"]["id"]
    path = await client.post("/api/v1/paths", json={
        "title": "Count regression", "course_ids": [course_id],
    }, headers=auth_headers)
    assert path.status_code == 200
    url = f"/api/v1/paths/{path.json()['id']}"

    async def count():
        response = await client.get(url, headers=auth_headers)
        assert response.status_code == 200
        return response.json()["courses"][0]["module_count"]

    assert await count() == 3
    created = await client.post(f"/api/v1/courses/{course_id}/modules", json={
        "title": "Fourth module", "order_index": 3,
    }, headers=auth_headers)
    assert created.status_code == 200
    assert await count() == 4
    deleted = await client.delete(
        f"/api/v1/courses/{course_id}/modules/{created.json()['id']}", headers=auth_headers
    )
    assert deleted.status_code == 200
    assert await count() == 3


@pytest.mark.asyncio
async def test_empty_course_has_zero_modules_in_path(client, auth_headers):
    course = await client.post("/api/v1/courses", json={"title": "Empty"}, headers=auth_headers)
    path = await client.post("/api/v1/paths", json={
        "title": "Empty course path", "course_ids": [course.json()["id"]],
    }, headers=auth_headers)
    response = await client.get(f"/api/v1/paths/{path.json()['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["courses"][0]["module_count"] == 0
