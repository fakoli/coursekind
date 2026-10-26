"""Private workspace lifecycle on real transactional stores."""

import asyncio
from uuid import uuid4

import pytest

from dependencies import get_storage
from main import app
from storage.json_storage import JSONStorage
from storage.sqlite_storage import SQLiteStorage


@pytest.fixture(params=["json", "sqlite"])
async def workspace_store(request, tmp_path):
    store = (
        JSONStorage(str(tmp_path / "data"))
        if request.param == "json"
        else SQLiteStorage(str(tmp_path / "test.db"))
    )
    app.dependency_overrides[get_storage] = lambda: store
    try:
        yield store
    finally:
        app.dependency_overrides.pop(get_storage, None)
        if request.param == "sqlite":
            await store.close()


def payload(**kwargs):
    return {"request_id": str(uuid4()), "brief": {"goal": "Learn Python"}, **kwargs}


async def create(client, headers, **kwargs):
    response = await client.post("/api/v1/workspaces", headers=headers, json=payload(**kwargs))
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_private_workspace_roundtrip_and_archive(workspace_store, client, auth_headers):
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Python"})
    ).json()
    w = await create(client, auth_headers, source_course_id=course["id"])
    url = f"/api/v1/workspaces/{w['id']}"
    assert w["brief"]["flashcard_count"] == 5
    assert w["brief"]["quiz_question_count"] == 3
    assert (await client.get(url, headers=auth_headers)).json() == w
    response = await client.put(
        url,
        headers=auth_headers,
        json={"request_id": str(uuid4()), "expected_version": 1, "archived": True},
    )
    assert response.status_code == 200
    assert (await client.get("/api/v1/workspaces", headers=auth_headers)).json() == []
    assert (await client.get("/api/v1/workspaces?archived=true", headers=auth_headers)).json()[0][
        "id"
    ] == w["id"]
    assert (
        await client.get(f"/api/v1/courses/{course['id']}", headers=auth_headers)
    ).status_code == 200
    assert (await create(client, auth_headers, source_course_id=course["id"]))["id"] != w["id"]
    assert (await client.get(url, headers=auth_headers)).json()["archived"] is True


@pytest.mark.asyncio
async def test_other_user_cannot_read_or_update_workspace(
    workspace_store, client, auth_headers, other_user_headers
):
    w = await create(client, auth_headers)
    url = f"/api/v1/workspaces/{w['id']}"
    assert (await client.get(url, headers=other_user_headers)).status_code == 404
    assert (
        await client.put(
            url,
            headers=other_user_headers,
            json={"request_id": str(uuid4()), "expected_version": 1, "archived": True},
        )
    ).status_code == 404
    assert (await client.get("/api/v1/workspaces", headers=other_user_headers)).json() == []
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Private"})
    ).json()
    assert (
        await client.post(
            "/api/v1/workspaces",
            headers=other_user_headers,
            json=payload(source_course_id=course["id"]),
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_source_entry_reuses_owned_ids(workspace_store, client, auth_headers):
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Python"})
    ).json()
    path = (
        await client.post(
            "/api/v1/paths",
            headers=auth_headers,
            json={"title": "Goal", "course_ids": [course["id"]]},
        )
    ).json()
    for field, source in [("source_course_id", course), ("source_path_id", path)]:
        a, b = await asyncio.gather(
            create(client, auth_headers, **{field: source["id"]}),
            create(client, auth_headers, **{field: source["id"]}),
        )
        assert a["id"] == b["id"]
        assert a["course_ids"] == [course["id"]]
        if field == "source_path_id":
            assert a["path_id"] == path["id"]


@pytest.mark.asyncio
async def test_workspace_stale_version_preserves_brief(workspace_store, client, auth_headers):
    w = await create(client, auth_headers)
    url = f"/api/v1/workspaces/{w['id']}"
    data = {"request_id": str(uuid4()), "expected_version": 1, "brief": {"goal": "Saved"}}
    assert (await client.put(url, headers=auth_headers, json=data)).status_code == 200
    data.update(request_id=str(uuid4()), brief={"goal": "Stale"})
    assert (await client.put(url, headers=auth_headers, json=data)).status_code == 409
    assert (await client.get(url, headers=auth_headers)).json()["brief"]["goal"] == "Saved"


@pytest.mark.asyncio
async def test_create_request_replay_and_mismatched_payload(workspace_store, client, auth_headers):
    data = payload()
    first = await client.post("/api/v1/workspaces", headers=auth_headers, json=data)
    assert first.status_code == 200, first.text
    assert (
        await client.post("/api/v1/workspaces", headers=auth_headers, json=data)
    ).json() == first.json()
    data["brief"]["goal"] = "Different"
    assert (
        await client.post("/api/v1/workspaces", headers=auth_headers, json=data)
    ).status_code == 409
    assert len(await workspace_store.list("workspaces")) == 1


@pytest.mark.asyncio
async def test_update_replay_precedes_version_check(workspace_store, client, auth_headers):
    w = await create(client, auth_headers)
    url = f"/api/v1/workspaces/{w['id']}"
    data = {"request_id": str(uuid4()), "expected_version": 1, "brief": {"goal": "Updated"}}
    first = await client.put(url, headers=auth_headers, json=data)
    assert first.status_code == 200
    assert first.json()["version"] == 2
    assert (await client.put(url, headers=auth_headers, json=data)).json() == first.json()
    data["brief"]["goal"] = "Different"
    assert (await client.put(url, headers=auth_headers, json=data)).status_code == 409
    assert (await client.get(url, headers=auth_headers)).json() == first.json()


@pytest.mark.asyncio
async def test_workspace_schema_and_gate(workspace_store, client, auth_headers, monkeypatch):
    for goal in ["", "   ", "a" * 4001]:
        assert (
            await client.post(
                "/api/v1/workspaces", headers=auth_headers, json=payload(brief={"goal": goal})
            )
        ).status_code == 422
    for brief in [
        {"goal": "G", "weekly_hours": 169},
        {"goal": "G", "scope": "other"},
        {"goal": "G", "owner_id": "x"},
    ]:
        assert (
            await client.post("/api/v1/workspaces", headers=auth_headers, json=payload(brief=brief))
        ).status_code == 422
    assert (
        await client.post(
            "/api/v1/workspaces",
            headers=auth_headers,
            json=payload(source_course_id="a", source_path_id="b"),
        )
    ).status_code == 422
    w = await create(client, auth_headers)
    monkeypatch.setenv("WORKSPACE_ENABLED", "false")
    from config import get_settings

    get_settings.cache_clear()
    assert (
        await client.post("/api/v1/workspaces", headers=auth_headers, json=payload())
    ).status_code == 503
    assert (
        await client.get(f"/api/v1/workspaces/{w['id']}", headers=auth_headers)
    ).status_code == 200
    assert (await client.get("/api/v1/courses", headers=auth_headers)).status_code == 200


@pytest.mark.asyncio
async def test_foreign_and_filesystem_sources_stay_read_only(
    workspace_store, client, auth_headers, other_user_headers, tmp_path, monkeypatch
):
    course = (
        await client.post(
            "/api/v1/courses",
            headers=auth_headers,
            json={"title": "Public source", "visibility": "public"},
        )
    ).json()
    path = (
        await client.post(
            "/api/v1/paths",
            headers=auth_headers,
            json={"title": "Public path", "visibility": "public"},
        )
    ).json()
    for field, source in [("source_course_id", course), ("source_path_id", path)]:
        response = await client.post(
            "/api/v1/workspaces", headers=other_user_headers, json=payload(**{field: source["id"]})
        )
        assert response.status_code == 403
    monkeypatch.chdir(tmp_path)
    source = tmp_path / "content/courses/library"
    source.mkdir(parents=True)
    (source / "meta.json").write_text('{"title":"Library source"}')
    response = await client.post(
        "/api/v1/workspaces", headers=auth_headers, json=payload(source_course_id="library")
    )
    assert response.status_code == 403
    assert await workspace_store.list("workspaces") == []


@pytest.mark.asyncio
async def test_source_create_replay_checks_live_ownership(
    workspace_store, client, auth_headers, other_user_headers
):
    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Source"})
    ).json()
    data = payload(source_course_id=course["id"])
    assert (
        await client.post("/api/v1/workspaces", headers=auth_headers, json=data)
    ).status_code == 200
    await workspace_store.update("courses", course["id"], {"author_id": "different-owner"})
    assert (
        await client.post("/api/v1/workspaces", headers=auth_headers, json=data)
    ).status_code == 404
    assert len(await workspace_store.list("workspaces")) == 1


@pytest.mark.asyncio
async def test_compare_and_write_are_atomic_under_competing_saves(
    workspace_store, client, auth_headers
):
    w = await create(client, auth_headers)
    url = f"/api/v1/workspaces/{w['id']}"
    responses = await asyncio.gather(
        *[
            client.put(
                url,
                headers=auth_headers,
                json={
                    "request_id": str(uuid4()),
                    "expected_version": 1,
                    "brief": {"goal": f"Goal {i}"},
                },
            )
            for i in range(5)
        ]
    )
    assert sorted(r.status_code for r in responses) == [200, 409, 409, 409, 409]
    winner = next(r.json() for r in responses if r.status_code == 200)
    assert (await client.get(url, headers=auth_headers)).json() == winner
    assert winner["version"] == 2


@pytest.mark.asyncio
async def test_receipt_failure_rolls_back_both_create_and_update(workspace_store, monkeypatch):
    from models.workspace import WorkspaceCreate, WorkspaceUpdate
    from services.workspace_service import WorkspaceService

    service = WorkspaceService(workspace_store)
    original_create = workspace_store.create

    async def fail_receipt(collection, doc):
        if collection == "workspace_requests":
            raise RuntimeError("Synthetic receipt failure")
        return await original_create(collection, doc)

    monkeypatch.setattr(workspace_store, "create", fail_receipt)
    with pytest.raises(RuntimeError, match="Synthetic receipt failure"):
        await service.create("owner", "Author", WorkspaceCreate(**payload()))
    assert await workspace_store.list("workspaces") == []
    monkeypatch.setattr(workspace_store, "create", original_create)
    w = await service.create("owner", "Author", WorkspaceCreate(**payload()))
    monkeypatch.setattr(workspace_store, "create", fail_receipt)
    with pytest.raises(RuntimeError, match="Synthetic receipt failure"):
        await service.update(
            "owner",
            w.id,
            WorkspaceUpdate(
                request_id=str(uuid4()), expected_version=1, brief={"goal": "Never persisted"}
            ),
        )
    assert (await service.get("owner", w.id)).model_dump() == w.model_dump()
    assert len(await workspace_store.list("workspace_requests")) == 1


@pytest.mark.asyncio
async def test_concurrent_identical_create_has_one_workspace_and_receipt(
    workspace_store, client, auth_headers
):
    data = payload()
    results = await asyncio.gather(
        *[client.post("/api/v1/workspaces", headers=auth_headers, json=data) for _ in range(5)]
    )
    assert all(r.status_code == 200 for r in results)
    assert all(r.json() == results[0].json() for r in results)
    assert len(await workspace_store.list("workspaces")) == 1
    receipts = await workspace_store.list("workspace_requests")
    assert len(receipts) == 1
    from uuid import UUID

    UUID(receipts[0]["id"])
