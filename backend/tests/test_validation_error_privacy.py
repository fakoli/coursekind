"""Malformed credential requests must not expose unvalidated input in 422s."""

import json
from unittest.mock import AsyncMock

import pytest

from services.ai_provider import ProviderClient

MARKER = "synthetic-secret-must-never-escape"


@pytest.mark.parametrize(
    "method,path,payload,field,error_type",
    [
        ("PUT", "/ai-preferences", {"provider": "openai", "api_key": MARKER}, "model", "missing"),
        ("PUT", "/ai-preferences", {"model": "gpt-test", "api_key": MARKER}, "provider", "missing"),
        (
            "PUT",
            "/ai-preferences",
            {"provider": "openai", "model": "gpt-test", "api_key": {"nested": MARKER}},
            "api_key",
            "string_type",
        ),
        ("POST", "/ai-preferences/validate", {"api_key": MARKER}, "provider", "missing"),
        (
            "POST",
            "/ai-preferences/validate",
            {"provider": "openai", "api_key": [MARKER]},
            "api_key",
            "string_type",
        ),
        (
            "POST",
            "/ai-preferences/validate",
            {"provider": MARKER, "api_key": MARKER},
            "provider",
            "literal_error",
        ),
        ("PUT", "/ai-preferences", [{"api_key": MARKER}], "body", "model_attributes_type"),
    ],
)
async def test_credential_validation_errors_omit_raw_input(
    client, auth_headers, monkeypatch, caplog, method, path, payload, field, error_type
):
    provider = AsyncMock()
    monkeypatch.setattr(ProviderClient, "models", provider)
    caplog.clear()
    response = await client.request(
        method, f"/api/v1/auth{path}", json=payload, headers=auth_headers
    )
    assert response.status_code == 422
    assert MARKER not in response.text
    assert MARKER not in caplog.text
    assert MARKER not in json.dumps([record.__dict__ for record in caplog.records], default=str)
    errors = response.json()["detail"]
    assert any(error["loc"][-1] == field and error["type"] == error_type for error in errors)
    assert all(set(error) == {"loc", "type", "msg"} and error["msg"] for error in errors)
    provider.assert_not_awaited()


async def test_invalid_credential_json_omits_body_and_parser_context(client, auth_headers, caplog):
    caplog.clear()
    response = await client.post(
        "/api/v1/auth/ai-preferences/validate",
        content='{"api_key":"' + MARKER + '",',
        headers={**auth_headers, "Content-Type": "application/json"},
    )
    assert response.status_code == 422
    assert MARKER not in response.text
    assert MARKER not in caplog.text
    assert MARKER not in json.dumps([record.__dict__ for record in caplog.records], default=str)
    assert response.json()["detail"][0]["type"] == "json_invalid"
    assert set(response.json()["detail"][0]) == {"loc", "type", "msg"}


async def test_custom_validator_message_cannot_echo_input_or_context(caplog):
    from fastapi.exceptions import RequestValidationError
    from starlette.requests import Request

    from main import request_validation_exception_handler

    caplog.clear()
    error = RequestValidationError(
        [
            {
                "loc": ("body", "api_key"),
                "type": "value_error",
                "msg": f"Value error, {MARKER}",
                "input": MARKER,
                "ctx": {"error": ValueError(MARKER)},
            }
        ],
        body={"api_key": MARKER},
    )
    response = await request_validation_exception_handler(
        Request(
            {"type": "http", "method": "PUT", "path": "/api/v1/auth/ai-preferences", "headers": []}
        ),
        error,
    )
    assert response.status_code == 422
    assert MARKER.encode() not in response.body
    assert MARKER not in caplog.text
    assert MARKER not in json.dumps([record.__dict__ for record in caplog.records], default=str)
    detail = json.loads(response.body)["detail"][0]
    assert detail == {
        "loc": ["body", "api_key"],
        "type": "value_error",
        "msg": "Input does not satisfy this field's validation rules",
    }
