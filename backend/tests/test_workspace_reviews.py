"""Optional advisory review: protocol, exact selection, isolation and current access."""

import copy
import json
from uuid import uuid4

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from config import Settings
from exceptions import StudyBuddyException
from models.module import ModuleUpdate
from models.workspace_review import MaterialReviewRequest
from services.jev_client import JevClient, JevUnavailable
from services.module_service import ModuleService
from services.workspace_change_service import WorkspaceChangeService
from services.workspace_review_service import WorkspaceReviewService
from tests.test_workspace_changes import patch_for
from tests.test_workspace_jobs import setup_job as setup_job
from tests.test_workspaces import workspace_store as workspace_store

KEY = "synthetic-review-secret"
DIMS = dict(answer_supported=0.9, answer_ambiguous=0.15, objective_aligned=0.8)
QUIZ = {
    "questions": [{"question": "One plus one?", "options": ["Two", "Three"], "correct_index": 0}]
}


def settings(**kwargs):
    return Settings(debug=True, _env_file=None, typesafe_api_key=KEY, **kwargs)


def response(**kwargs):
    return dict(
        model="jev-1.14.0",
        answers={k: {"type": "noul", "noul": v} for k, v in DIMS.items()},
        usage={"input_tokens": 50, "output_tokens": 12},
        **kwargs,
    )


@pytest.fixture
async def review_setup(setup_job, monkeypatch):
    store, _, workspace, modules, _ = setup_job
    await ModuleService(store).update_module(
        modules[0].course_id,
        modules[0].id,
        "owner",
        ModuleUpdate(
            content_markdown="Addition combines numbers. One plus one is two.",
            objectives=["Add numbers"],
            quiz=QUIZ,
        ),
    )
    calls = []

    def remote(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=response())

    client = JevClient(settings(), transport=httpx.MockTransport(remote))
    monkeypatch.setattr("services.workspace_review_service.JevClient", lambda _: client)
    service = WorkspaceReviewService(store, settings())
    sources = await service.sources("owner", workspace.id)
    source = sources.sources[0]
    request = MaterialReviewRequest(
        request_id=str(uuid4()),
        target=source.snapshot.target,
        question_index=0,
        lesson_excerpt="One plus one is two.",
        objective="Add numbers",
        expected_fingerprint=source.snapshot.fingerprint,
        expected_revision_marker=source.revision_marker,
    )
    return store, workspace, modules[0], service, request, calls


@pytest.mark.asyncio
async def test_review_accepts_finite_noul_values():
    def remote(request):
        assert str(request.url) == "https://api.typesafe.ai/v1/systemone"
        assert request.headers["authorization"].startswith("Bearer ")
        payload = json.loads(request.content)
        assert payload["model"] == "jev-1.14.0"
        assert set(payload["questions"]) == set(DIMS)
        assert all(q["type"] == "noul" for q in payload["questions"].values())
        assert set(payload["state"]) == {
            "objective",
            "lesson_excerpt",
            "question",
            "options",
            "correct_index",
        }
        return httpx.Response(200, json=response())

    result = await JevClient(settings(), transport=httpx.MockTransport(remote)).review(
        dict(
            objective="Add",
            lesson_excerpt="1+1=2",
            question="1+1?",
            options=["2", "3"],
            correct_index=0,
        )
    )
    assert result.dimensions == DIMS
    assert result.input_tokens == 50


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad", ["missing", "nan", "range", "huge", "extra", "bool", "string", "type", "model", "usage"]
)
async def test_missing_nan_out_of_range_or_extra_answers_unavailable(bad):
    payload = response()
    if bad == "missing":
        del payload["answers"]["answer_supported"]
    elif bad == "extra":
        payload["answers"]["extra"] = {"type": "noul", "noul": 0.5}
    elif bad == "type":
        payload["answers"]["answer_supported"]["type"] = "score"
    elif bad == "model":
        payload["model"] = "jev-latest"
    elif bad == "usage":
        payload["usage"]["input_tokens"] = -1
    else:
        payload["answers"]["answer_supported"]["noul"] = {
            "nan": float("nan"),
            "range": 1.1,
            "huge": 10**1000,
            "bool": True,
            "string": ".5",
        }[bad]
    with pytest.raises(JevUnavailable):
        await JevClient(
            settings(),
            transport=httpx.MockTransport(
                lambda _: httpx.Response(200, content=json.dumps(payload))
            ),
        ).review({})


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,count", [(401, 1), (400, 1), (429, 2), (529, 2), (503, 1), ("timeout", 1)]
)
async def test_missing_key_401_timeout_rate_limit_preserves_draft(
    review_setup, monkeypatch, status, count, caplog
):
    store, w, module, service, request, _ = review_setup
    original = copy.deepcopy(await store.get("modules", module.id))
    calls = []

    def remote(req):
        calls.append(1)
        if status == "timeout":
            raise httpx.ReadTimeout(KEY)
        return httpx.Response(status, json={"error": KEY})

    client = JevClient(settings(), transport=httpx.MockTransport(remote))
    monkeypatch.setattr("services.workspace_review_service.JevClient", lambda _: client)
    result = await service.review("owner", w.id, request)
    assert result.state == "unavailable" and KEY not in result.model_dump_json()
    assert len(calls) == count
    assert KEY not in caplog.text
    assert await store.get("modules", module.id) == original


@pytest.mark.asyncio
async def test_missing_key_makes_no_request(review_setup, monkeypatch):
    _, w, _, service, request, calls = review_setup
    service.settings = Settings(debug=True, _env_file=None, typesafe_api_key=None)
    result = await service.review("owner", w.id, request)
    assert result.state == "unavailable" and not calls


@pytest.mark.asyncio
async def test_review_hash_and_revision_cache_avoids_second_call(review_setup):
    _, w, _, service, request, calls = review_setup
    result = await service.review("owner", w.id, request)
    assert (await service.review("owner", w.id, request)).id == result.id
    assert (
        await service.review("owner", w.id, request.model_copy(update={"request_id": str(uuid4())}))
    ).id == result.id
    assert len(calls) == 1
    await service.review(
        "owner", w.id, request.model_copy(update={"request_id": str(uuid4()), "refresh": True})
    )
    assert len(calls) == 2
    with pytest.raises(StudyBuddyException):
        await service.review(
            "owner", w.id, request.model_copy(update={"lesson_excerpt": "Addition"})
        )


@pytest.mark.asyncio
async def test_revision_or_restore_marks_review_stale(review_setup):
    store, w, module, service, request, _ = review_setup
    result = await service.review("owner", w.id, request)
    changes = WorkspaceChangeService(store)
    change = await changes.prepare(
        "owner", w.id, [await patch_for(store, module, {"content_markdown": "Changed"})]
    )
    await changes.apply("owner", w.id, change.id, str(uuid4()))
    assert (await service.get("owner", w.id, result.id)).state == "stale"
    revision = (await changes.history("owner", w.id))[0]
    await changes.restore("owner", w.id, revision.id, revision.current_fingerprint, str(uuid4()))
    source = (await service.sources("owner", w.id)).sources[0]
    assert source.snapshot.fingerprint == request.expected_fingerprint
    assert source.revision_marker != request.expected_revision_marker
    assert (await service.get("owner", w.id, result.id)).state == "stale"
    assert (await service.review("owner", w.id, request)).state == "stale"
    with pytest.raises(StudyBuddyException):
        await service.review("owner", w.id, request.model_copy(update={"request_id": str(uuid4())}))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "updates",
    [
        {"lesson_excerpt": "Edited invented excerpt"},
        {"objective": "Invented objective"},
        {"question_index": 9},
    ],
)
async def test_edited_excerpt_not_in_snapshot_is_rejected(review_setup, updates):
    _, w, _, service, request, calls = review_setup
    with pytest.raises(StudyBuddyException):
        await service.review("owner", w.id, request.model_copy(update=updates))
    assert not calls


@pytest.mark.asyncio
async def test_revoked_source_hides_review(review_setup):
    store, w, module, service, request, calls = review_setup
    result = await service.review("owner", w.id, request)
    await store.update(
        "courses", module.course_id, {"author_id": "someone-else", "visibility": "private"}
    )
    for operation in [
        service.get("owner", w.id, result.id),
        service.review("owner", w.id, request),
        service.sources("owner", w.id),
    ]:
        with pytest.raises(StudyBuddyException):
            await operation
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_review_never_debits_or_changes_scores(review_setup):
    store, w, _, service, request, calls = review_setup
    collections = [
        "users",
        "modules",
        "courses",
        "workspaces",
        "progress",
        "study_events",
        "quiz_attempts",
        "token_transactions",
        "ai_preferences",
    ]
    before = {c: copy.deepcopy(await store.list(c)) for c in collections}
    await service.review("owner", w.id, request)
    assert {c: await store.list(c) for c in collections} == before
    assert len(calls) == 1
    assert set(calls[0]["state"]) == {
        "objective",
        "lesson_excerpt",
        "question",
        "options",
        "correct_index",
    }


@pytest.mark.asyncio
async def test_secret_absent_in_response_errors_and_logs(review_setup, caplog):
    store, w, _, service, request, _ = review_setup
    result = await service.review("owner", w.id, request)
    assert KEY not in result.model_dump_json() + caplog.text + json.dumps(
        await store.list("workspace_reviews")
    ) + repr(service.settings)


def test_selection_bounds():
    for field, value in [
        ("lesson_excerpt", "x" * 8001),
        ("objective", "x" * 1001),
        ("question_index", -1),
    ]:
        with pytest.raises(ValidationError):
            MaterialReviewRequest.model_validate(
                dict(
                    request_id="x",
                    target={"kind": "module", "resource_id": "m", "course_id": "c"},
                    question_index=0,
                    lesson_excerpt="x",
                    objective="x",
                    expected_fingerprint="f",
                    expected_revision_marker="r",
                )
                | {field: value}
            )


@pytest.mark.asyncio
async def test_staged_source_uses_proposed_quiz_and_rejects_changed_base(review_setup):
    store, w, module, service, request, calls = review_setup
    changes = WorkspaceChangeService(store)
    quiz = {
        "questions": [
            {"question": "Which answer is two?", "options": ["Two", "Five"], "correct_index": 0}
        ]
    }
    change = await changes.prepare("owner", w.id, [await patch_for(store, module, {"quiz": quiz})])
    source = (await service.sources("owner", w.id, change.id)).sources[0]
    staged = request.model_copy(
        update={
            "change_id": change.id,
            "expected_fingerprint": source.snapshot.fingerprint,
            "expected_revision_marker": source.revision_marker,
        }
    )
    result = await service.review("owner", w.id, staged)
    assert calls[0]["state"]["question"] == "Which answer is two?"
    assert (await store.get("modules", module.id))["quiz"]["questions"][0][
        "question"
    ] == "One plus one?"
    await changes.apply("owner", w.id, change.id, str(uuid4()))
    assert (await service.get("owner", w.id, result.id)).state == "stale"
    with pytest.raises(StudyBuddyException):
        await service.review("owner", w.id, staged.model_copy(update={"request_id": str(uuid4())}))
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_concurrent_identical_review_calls_share_receipt(review_setup):
    import asyncio

    _, w, _, service, request, calls = review_setup
    results = await asyncio.gather(
        service.review("owner", w.id, request), service.review("owner", w.id, request)
    )
    assert results[0].id == results[1].id
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_oversize_question_rejected_without_provider_call(review_setup):
    store, w, module, service, request, calls = review_setup
    # Legacy stored content may exceed new request limits; review must reject it too.
    await store.update(
        "modules",
        module.id,
        {
            "quiz": {
                "questions": [{"question": "x" * 4001, "options": ["a", "b"], "correct_index": 0}]
            }
        },
    )
    source = (await service.sources("owner", w.id)).sources[0]
    request = request.model_copy(
        update={
            "expected_fingerprint": source.snapshot.fingerprint,
            "expected_revision_marker": source.revision_marker,
        }
    )
    with pytest.raises(StudyBuddyException):
        await service.review("owner", w.id, request)
    assert not calls


@pytest.mark.asyncio
async def test_access_revoked_during_provider_call_hides_response(review_setup, monkeypatch):
    store, w, module, service, request, _ = review_setup

    async def remote(req):
        await store.update(
            "courses", module.course_id, {"author_id": "other", "visibility": "private"}
        )
        return httpx.Response(200, json=response())

    client = JevClient(settings(), transport=httpx.MockTransport(remote))
    monkeypatch.setattr("services.workspace_review_service.JevClient", lambda _: client)
    with pytest.raises(StudyBuddyException):
        await service.review("owner", w.id, request)


@pytest.mark.asyncio
async def test_disabled_review_and_read_routes_never_call_provider(review_setup):
    _, w, _, service, request, calls = review_setup
    service.settings.workspace_review_enabled = False
    source = await service.sources("owner", w.id)
    assert source.configured is False
    result = await service.review("owner", w.id, request)
    assert result.state == "unavailable"
    assert (await service.get("owner", w.id, result.id)).state == "unavailable"
    assert not calls


@pytest.mark.asyncio
async def test_http_review_contract_is_private_and_secret_free(
    workspace_store, client, auth_headers, other_user_headers, monkeypatch
):
    from config import get_settings
    from main import app

    course = (
        await client.post("/api/v1/courses", headers=auth_headers, json={"title": "Synthetic"})
    ).json()
    await client.post(
        f"/api/v1/courses/{course['id']}/modules",
        headers=auth_headers,
        json={
            "title": "Addition",
            "order_index": 0,
            "objectives": ["Add numbers"],
            "content_markdown": "One plus one is two.",
            "quiz": QUIZ,
        },
    )
    w = (
        await client.post(
            "/api/v1/workspaces",
            headers=auth_headers,
            json={
                "request_id": str(uuid4()),
                "brief": {"goal": "Review"},
                "source_course_id": course["id"],
            },
        )
    ).json()
    review_client = JevClient(
        settings(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response()))
    )
    monkeypatch.setattr("services.workspace_review_service.JevClient", lambda _: review_client)
    http_settings = get_settings().model_copy(update={"typesafe_api_key": SecretStr(KEY)})
    app.dependency_overrides[get_settings] = lambda: http_settings
    try:
        base = f"/api/v1/workspaces/{w['id']}"
        source_response = await client.get(base + "/review-sources", headers=auth_headers)
        assert source_response.status_code == 200
        source = source_response.json()["sources"][0]
        payload = dict(
            request_id=str(uuid4()),
            target=source["snapshot"]["target"],
            question_index=0,
            lesson_excerpt="One plus one is two.",
            objective="Add numbers",
            expected_fingerprint=source["snapshot"]["fingerprint"],
            expected_revision_marker=source["revision_marker"],
        )
        result = await client.post(base + "/reviews", headers=auth_headers, json=payload)
        assert result.status_code == 200 and result.json()["state"] == "ready"
        assert set(result.json()["dimensions"]) == set(DIMS)
        assert KEY not in source_response.text + result.text
        assert (
            await client.get(base + "/reviews/" + result.json()["id"], headers=other_user_headers)
        ).status_code == 404
        assert (
            await client.post(base + "/reviews", headers=other_user_headers, json=payload)
        ).status_code == 404
        assert (
            await client.post(
                base + "/reviews", headers=auth_headers, json={**payload, "owner_id": "other"}
            )
        ).status_code == 422
        assert (await client.get(base + "/review-sources")).status_code in (401, 403)
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.asyncio
async def test_review_total_deadline_covers_provider_and_backoff(monkeypatch):
    import asyncio
    import time

    calls = []

    async def remote(request):
        calls.append(1)
        await asyncio.sleep(0.01)
        return httpx.Response(429)

    monkeypatch.setattr("services.jev_client.TOTAL_TIMEOUT_SECONDS", 0.03)
    started = time.monotonic()
    with pytest.raises(JevUnavailable):
        await JevClient(settings(), transport=httpx.MockTransport(remote)).review({})
    assert time.monotonic() - started < 0.2
    assert len(calls) == 1
