"""Preflight tests only; the live helper never contacts providers during this suite."""

import argparse
from types import SimpleNamespace

import pytest

from models.user import UserCreate
from scripts.smoke_workspace import label, run, synthetic_account, target


@pytest.mark.parametrize(
    "base",
    [
        "https://example.com",
        "http://localhost@evil.example",
        "http://127.0.0.1:8011/?key=secret",
        "http://localhost:8011/other",
        "http://user:pass@localhost:8011",
    ],
)
def test_refuses_nonlocal_or_ambiguous_target(base):
    with pytest.raises(argparse.ArgumentTypeError):
        target(base)


def test_explicit_local_target_and_metadata_sanitization():
    assert UserCreate(**synthetic_account("synthetic-test")).email.endswith("@example.com")
    assert target("http://127.0.0.1:8011") == "http://127.0.0.1:8011/api/v1"
    assert target("http://localhost:8011/api/v1/") == "http://localhost:8011/api/v1"
    assert label("llm.primary") == "llm.primary"
    assert label("https://example.com/?token=private") == "redacted"


def test_refuses_overwrite_before_any_network(tmp_path):
    path = tmp_path / "session.json"
    path.write_text("keep")
    with pytest.raises(FileExistsError):
        run(
            SimpleNamespace(
                fixture_prefix="synthetic-test",
                session_file=str(path),
                base_url="http://localhost:8011/api/v1",
            )
        )
    assert path.read_text() == "keep"
