"""Sharing regressions use only disposable accounts/storage."""

import pytest


@pytest.mark.asyncio
async def test_named_sharing_revokes_all_nested_access(
    client, auth_headers, other_user_headers, course_with_modules
):
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    base = f"/api/v1/courses/{cid}"
    endpoints = [
        base,
        f"{base}/modules",
        f"{base}/modules/{mid}",
        f"/api/v1/progress/courses/{cid}",
        f"/api/v1/progress/modules/{cid}/{mid}",
        f"{base}/modules/{mid}/flashcards/ratings",
        f"{base}/modules/{mid}/flashcards/filter",
        f"{base}/modules/{mid}/flashcards/ratings-with-summary",
    ]
    for endpoint in endpoints:
        response = await client.get(endpoint, headers=other_user_headers)
        assert response.status_code == 404, (endpoint, response.text)
    grant = await client.post(
        f"{base}/sharing", json={"email": "OTHER@example.com"}, headers=auth_headers
    )
    assert grant.status_code == 200, grant.text
    recipient = grant.json()["recipients"][0]["id"]
    assert (await client.get(base, headers=other_user_headers)).status_code == 200
    assert "shared_with" not in (await client.get(base, headers=other_user_headers)).text
    assert (await client.get(f"{base}/sharing", headers=other_user_headers)).status_code == 403
    for endpoint in endpoints:
        assert (await client.get(endpoint, headers=other_user_headers)).status_code == 200, endpoint
    assert (
        await client.delete(f"{base}/sharing/{recipient}", headers=auth_headers)
    ).status_code == 200
    for endpoint in endpoints:
        assert (await client.get(endpoint, headers=other_user_headers)).status_code == 404, endpoint
    assert (
        await client.post(
            f"/api/v1/progress/modules/{cid}/{mid}",
            json={"action": "start"},
            headers=other_user_headers,
        )
    ).status_code == 404
    assert (
        await client.post(
            f"{base}/modules/{mid}/flashcards/rate",
            json={"flashcard_index": 0, "rating": "hard"},
            headers=other_user_headers,
        )
    ).status_code == 404
    for kind in ["flashcards", "quiz", "suggest-modules", "module-content", "full-course"]:
        payload = {
            "course_id": cid,
            "module_id": mid,
            "module_title": "Lesson",
            "module_description": "Test",
            "module_prompt": "Test lesson",
        }
        response = await client.post(
            f"/api/v1/generate/{kind}", json=payload, headers=other_user_headers
        )
        assert response.status_code in [403, 404], (kind, response.text)


@pytest.mark.asyncio
async def test_follow_unavailable_and_distinct_contributions(
    client, auth_headers, other_user_headers, course_with_modules
):
    cid = course_with_modules["course"]["id"]
    base = f"/api/v1/courses/{cid}"
    path = (
        await client.post(
            "/api/v1/paths",
            json={"title": "Public path", "visibility": "public", "course_ids": [cid, cid]},
            headers=auth_headers,
        )
    ).json()
    pid = path["id"]
    assert path["course_ids"] == [cid]
    detail = (await client.get(f"/api/v1/paths/{pid}", headers=other_user_headers)).json()
    assert detail["courses"] == []
    assert detail["unavailable_courses"] == [{"id": cid, "reason": "unavailable"}]
    assert course_with_modules["course"]["title"] not in str(detail)
    for _ in range(2):
        assert (
            await client.post(f"/api/v1/paths/{pid}/follow", headers=other_user_headers)
        ).status_code == 200
    following = (await client.get("/api/v1/paths/following", headers=other_user_headers)).json()
    assert [p["id"] for p in following] == [pid]
    assert (await client.get(f"/api/v1/paths/{pid}", headers=other_user_headers)).json()[
        "is_following"
    ]
    assert (
        await client.put(
            f"/api/v1/paths/{pid}/courses/reorder",
            json={"course_ids": [cid, cid]},
            headers=auth_headers,
        )
    ).status_code == 400
    course = (await client.get(base, headers=auth_headers)).json()["course"]
    assert (course["times_added"], course["own_path_count"], course["other_path_count"]) == (
        1,
        1,
        0,
    )
    await client.post(f"{base}/sharing", json={"email": "other@example.com"}, headers=auth_headers)
    other_path = (
        await client.post(
            "/api/v1/paths",
            json={"title": "Reuse", "course_ids": [cid]},
            headers=other_user_headers,
        )
    ).json()
    course = (await client.get(base, headers=auth_headers)).json()["course"]
    assert (course["times_added"], course["own_path_count"], course["other_path_count"]) == (
        2,
        1,
        1,
    )
    await client.delete(f"/api/v1/paths/{other_path['id']}", headers=other_user_headers)
    assert (await client.get(base, headers=auth_headers)).json()["course"]["times_added"] == 1
    await client.delete(f"/api/v1/paths/{pid}/follow", headers=other_user_headers)
    assert (await client.get("/api/v1/paths/following", headers=other_user_headers)).json() == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "visibility,anonymous_ok,discovered",
    [("private", False, False), ("unlisted", True, False), ("public", True, True)],
)
async def test_visibility_policy(
    client, auth_headers, other_user_headers, visibility, anonymous_ok, discovered
):
    c = (
        await client.post(
            "/api/v1/courses",
            json={"title": "Policy course", "visibility": visibility},
            headers=auth_headers,
        )
    ).json()
    p = (
        await client.post(
            "/api/v1/paths",
            json={"title": "Policy path", "visibility": visibility},
            headers=auth_headers,
        )
    ).json()
    for kind, resource in [("courses", c), ("paths", p)]:
        for headers in [{}, other_user_headers]:
            assert (
                await client.get(f"/api/v1/{kind}/{resource['id']}", headers=headers)
            ).status_code == (200 if anonymous_ok else 404)
            listing = (await client.get(f"/api/v1/{kind}", headers=headers)).json()
            assert (resource["id"] in [r["id"] for r in listing]) == discovered
        assert (
            await client.get(f"/api/v1/{kind}/{resource['id']}", headers=auth_headers)
        ).status_code == 200
        assert (
            await client.post(
                f"/api/v1/{kind}/{resource['id']}/sharing",
                json={"email": "test@example.com"},
                headers=other_user_headers,
            )
        ).status_code == 403


@pytest.mark.asyncio
async def test_shared_path_revoke_removes_follow_but_keeps_history(
    client, auth_headers, other_user_headers, course_with_modules
):
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    course_url = f"/api/v1/courses/{cid}"
    path = (
        await client.post(
            "/api/v1/paths",
            json={"title": "Hidden path", "course_ids": [cid]},
            headers=auth_headers,
        )
    ).json()
    url = f"/api/v1/paths/{path['id']}"
    recipients = (
        await client.post(
            f"{url}/sharing", json={"email": "other@example.com"}, headers=auth_headers
        )
    ).json()
    recipient_id = recipients["recipients"][0]["id"]
    assert (await client.get("/api/v1/paths", headers=other_user_headers)).json()[0]["id"] == path[
        "id"
    ]
    await client.post(f"{url}/follow", headers=other_user_headers)
    # Path access does not expand course access, and recipient has no author rights.
    assert (await client.get(course_url, headers=other_user_headers)).status_code == 404
    assert (
        await client.put(url, json={"title": "Stolen"}, headers=other_user_headers)
    ).status_code == 403
    await client.post(
        f"{course_url}/sharing", json={"email": "other@example.com"}, headers=auth_headers
    )
    assert (await client.get("/api/v1/courses/shared", headers=other_user_headers)).json()[0][
        "id"
    ] == cid
    await client.post(
        f"/api/v1/progress/modules/{cid}/{mid}",
        json={"action": "submit_quiz", "quiz_score": 80},
        headers=other_user_headers,
    )
    await client.delete(f"{course_url}/sharing/{recipient_id}", headers=auth_headers)
    history = (await client.get("/api/v1/progress/activity", headers=other_user_headers)).json()
    assert history["activities"][0]["course_title"] is None
    assert history["activities"][0]["module_title"] is None
    assert history["activities"][0]["details"]["score"] == 80
    assert (await client.get("/api/v1/courses/shared", headers=other_user_headers)).json() == []
    assert (
        await client.post(
            "/api/v1/paths",
            json={"title": "Unauthorized reuse", "course_ids": [cid]},
            headers=other_user_headers,
        )
    ).status_code == 404
    await client.delete(f"{url}/sharing/{recipient_id}", headers=auth_headers)
    assert (await client.get(url, headers=other_user_headers)).status_code == 404
    assert (
        await client.get(f"/api/v1/progress/paths/{path['id']}", headers=other_user_headers)
    ).status_code == 404
    assert (await client.get("/api/v1/paths/following", headers=other_user_headers)).json() == []
    assert (await client.delete(f"{url}/follow", headers=other_user_headers)).status_code == 200


@pytest.mark.asyncio
async def test_module_reorder_route_exact_membership(client, auth_headers, course_with_modules):
    cid = course_with_modules["course"]["id"]
    ids = [m["id"] for m in course_with_modules["modules"]]
    url = f"/api/v1/courses/{cid}/modules/reorder"
    assert (
        await client.put(url, json={"module_ids": [ids[0]] * 3}, headers=auth_headers)
    ).status_code == 400
    response = await client.put(url, json={"module_ids": ids[::-1]}, headers=auth_headers)
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()] == ids[::-1]


@pytest.mark.asyncio
async def test_filesystem_public_study_and_read_only(client, auth_headers, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    course = tmp_path / "content/courses/sample"
    module = course / "modules/01-intro"
    module.mkdir(parents=True)
    (course / "meta.json").write_text('{"title":"Sample","modules":["01-intro"]}')
    (module / "content.md").write_text("# Intro")
    (module / "flashcards.json").write_text('{"cards":[{"front":"Q","back":"A"}]}')
    assert (await client.get("/api/v1/courses/sample")).status_code == 200
    assert (await client.get("/api/v1/courses/sample/modules/01-intro")).status_code == 200
    assert (
        await client.post(
            "/api/v1/progress/modules/sample/01-intro",
            json={"action": "complete"},
            headers=auth_headers,
        )
    ).status_code == 200
    progress = await client.get("/api/v1/progress/courses/sample", headers=auth_headers)
    assert progress.json()["completed_modules"] == 1
    rating = await client.post(
        "/api/v1/courses/sample/modules/01-intro/flashcards/rate",
        json={"flashcard_index": 0, "rating": "easy"},
        headers=auth_headers,
    )
    assert rating.status_code == 200, rating.text
    assert (
        await client.post(
            "/api/v1/courses/sample/modules",
            json={"title": "No edit", "order_index": 0},
            headers=auth_headers,
        )
    ).status_code in [403, 404]


@pytest.mark.asyncio
async def test_recipient_generation_access_precedes_provider_and_billing(
    client, auth_headers, other_user_headers, course_with_modules, monkeypatch
):
    from unittest.mock import AsyncMock

    from services.ai_generation_service import AIGenerationService

    provider = AsyncMock(return_value='[{"front":"Q","back":"A"}]')
    monkeypatch.setattr(AIGenerationService, "_call_llm", provider)
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    payload = {"course_id": cid, "module_id": mid, "count": 1}
    url = "/api/v1/generate/flashcards"
    balance = (await client.get("/api/v1/auth/me", headers=other_user_headers)).json()[
        "token_balance"
    ]
    assert (await client.post(url, json=payload, headers=other_user_headers)).status_code == 404
    provider.assert_not_awaited()
    assert (await client.get("/api/v1/auth/me", headers=other_user_headers)).json()[
        "token_balance"
    ] == balance
    shared = await client.post(
        f"/api/v1/courses/{cid}/sharing", json={"email": "other@example.com"}, headers=auth_headers
    )
    rid = shared.json()["recipients"][0]["id"]
    assert (await client.post(url, json=payload, headers=other_user_headers)).status_code == 200
    provider.assert_awaited_once()
    assert (
        await client.put(
            f"/api/v1/courses/{cid}/modules/{mid}",
            json={"title": "Not allowed"},
            headers=other_user_headers,
        )
    ).status_code == 403
    await client.delete(f"/api/v1/courses/{cid}/sharing/{rid}", headers=auth_headers)
    assert (await client.post(url, json=payload, headers=other_user_headers)).status_code == 404
    provider.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("backend", ["json", "sqlite"])
async def test_concurrent_follow_and_membership_are_idempotent(backend, tmp_path):
    import asyncio

    from models.course import CourseCreate
    from models.learning_path import LearningPathCreate
    from services.course_service import CourseService
    from services.learning_path_service import LearningPathService
    from storage.json_storage import JSONStorage
    from storage.sqlite_storage import SQLiteStorage

    storage = (
        JSONStorage(str(tmp_path / "data"))
        if backend == "json"
        else SQLiteStorage(str(tmp_path / "test.db"))
    )
    courses = CourseService(storage, str(tmp_path / "content"))
    paths = LearningPathService(storage, courses)
    course = await courses.create_course(
        "owner", "Author", CourseCreate(title="Course", visibility="public")
    )
    path = await paths.create_path("curator", LearningPathCreate(title="Goal", visibility="public"))
    try:
        await asyncio.gather(
            *[paths.add_course_to_path(path.id, "curator", course.id) for _ in range(8)]
        )
        await asyncio.gather(*[paths.follow(path.id, "learner") for _ in range(8)])
        assert len(await storage.list("path_follows")) == 1
        assert (await paths.get_path(path.id)).course_ids == [course.id]
        counts = await courses.get_course(course.id)
        assert (counts.times_added, counts.own_path_count, counts.other_path_count) == (1, 0, 1)
        await paths.delete_path(path.id, "curator")
        assert await storage.list("path_follows") == []
        assert (await courses.get_course(course.id)).times_added == 0
    finally:
        if backend == "sqlite":
            await storage.close()


@pytest.mark.asyncio
async def test_uploaded_and_generated_media_obey_course_access(
    client, auth_headers, other_user_headers, course_with_modules, tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)
    cid = course_with_modules["course"]["id"]
    mid = course_with_modules["modules"][0]["id"]
    for relative in [f"{cid}/images/test.png", f"{cid}/{mid}/visuals/test.png"]:
        file = tmp_path / "uploads/courses" / relative
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b"synthetic image bytes")
    urls = [
        f"/api/v1/uploads/courses/{cid}/images/test.png",
        f"/api/v1/uploads/courses/{cid}/{mid}/visuals/test.png",
    ]
    for url in urls:
        assert (await client.get(url)).status_code == 404
        assert (await client.get(url, headers=other_user_headers)).status_code == 404
        response = await client.get(url, headers=auth_headers)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
    grant = await client.post(
        f"/api/v1/courses/{cid}/sharing", json={"email": "other@example.com"}, headers=auth_headers
    )
    rid = grant.json()["recipients"][0]["id"]
    for url in urls:
        assert (await client.get(url, headers=other_user_headers)).status_code == 200
    await client.delete(f"/api/v1/courses/{cid}/sharing/{rid}", headers=auth_headers)
    for url in urls:
        assert (await client.get(url, headers=other_user_headers)).status_code == 404
    for visibility in ["unlisted", "public"]:
        await client.put(
            f"/api/v1/courses/{cid}", json={"visibility": visibility}, headers=auth_headers
        )
        for url in urls:
            assert (await client.get(url)).status_code == 200
