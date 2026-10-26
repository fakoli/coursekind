"""Explicit opt-in synthetic live qualification; never run automatically in CI.

Creates a new disposable account and reads only material created in this invocation.
No provider credentials are loaded or printed: inference uses the local API's configured
Anvil default. The private session file lets the operator inspect the same account in UI.
"""

import argparse
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import httpx


def target(value):
    parsed = urlparse(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") not in {"", "/api/v1"}
    ):
        raise argparse.ArgumentTypeError(
            "Use an explicit loopback HTTP API base without credentials"
        )
    return value.rstrip("/").removesuffix("/api/v1") + "/api/v1"


def label(value):
    text = str(value)
    return text[:100] if re.fullmatch(r"[\w .:/-]{1,100}", text) else "redacted"


def synthetic_account(prefix):
    return {
        "name": "Synthetic qualification",
        "email": f"{prefix}-{uuid4().hex[:12]}@example.com",
        "password": secrets.token_urlsafe(32),
    }


def run(args):
    account = synthetic_account(args.fixture_prefix)
    email, password = account["email"], account["password"]
    session = Path(args.session_file).expanduser().absolute()
    repository = Path(__file__).resolve().parents[2]
    if session.resolve().is_relative_to(repository):
        raise ValueError("Session file must be outside the repository")
    # Refuse overwriting any file or following a symlink. Private synthetic credentials only.
    descriptor = os.open(session, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as file:
        json.dump({"email": email, "password": password, "base_url": args.base_url}, file)
    with httpx.Client(base_url=args.base_url + "/", timeout=30, follow_redirects=False) as client:

        def call(method, path, data=None):
            response = client.request(method, path.lstrip("/"), json=data)
            if not response.is_success:
                raise RuntimeError(f"Local API request failed: HTTP {response.status_code}")
            return response.json()

        call("POST", "auth/register", account)
        auth = call("POST", "auth/login", {"email": email, "password": password})
        client.headers["Authorization"] = "Bearer " + auth["access_token"]

        balance = call("GET", "auth/tokens")
        print(
            json.dumps(
                {
                    "fixture": "preflight",
                    "available_application_credits": balance["balance"],
                    "maximum_sequence_credits": 55,
                }
            ),
            flush=True,
        )
        preferences = call("GET", "auth/ai-preferences")
        if preferences.get("provider") != "anvil" or preferences.get("model") != "llm.primary":
            raise RuntimeError("Qualification requires the existing Anvil llm.primary default")
        if not preferences.get("is_configured"):
            raise RuntimeError("Anvil is not configured")

        # Account is fresh; no account-wide course or workspace listing occurs.
        def new_workspace(goal, scope="course"):
            return call(
                "POST",
                "workspaces",
                {
                    "request_id": str(uuid4()),
                    "brief": {
                        "goal": goal,
                        "scope": scope,
                        "audience": "Beginner",
                        "generate_flashcards": True,
                        "flashcard_count": 2,
                        "generate_quiz": True,
                        "quiz_question_count": 1,
                    },
                },
            )

        def job(workspace, endpoint, body, fixture):
            started = time.monotonic()
            result = call(
                "POST",
                f"workspaces/{workspace['id']}/{endpoint}",
                {"request_id": str(uuid4()), **body},
            )
            while (
                result["state"] in {"queued", "running"}
                and time.monotonic() - started < args.timeout
            ):
                time.sleep(1)
                result = call("GET", f"workspaces/{workspace['id']}/jobs/{result['id']}")
            print(
                json.dumps(
                    {
                        "fixture": fixture,
                        "workspace_id": workspace["id"],
                        "provider": label(result["provider"]),
                        "model": label(result["model"]),
                        "state": label(result["state"]),
                        "elapsed_seconds": round(time.monotonic() - started, 2),
                        "application_credits": sum(step["credits"] for step in result["steps"]),
                        "attempts": [step["attempt"] for step in result["steps"]],
                        "steps": [label(step["state"]) for step in result["steps"]],
                        "failure_statuses": [
                            int(match.group(1))
                            if (
                                match := re.search(
                                    r"HTTP ([45][0-9]{2})", step.get("safe_error") or ""
                                )
                            )
                            else None
                            for step in result["steps"]
                        ],
                        "external_cost": "unknown",
                        "active_ui_seconds": "root records separately",
                    }
                ),
                flush=True,
            )
            if result["state"] != "ready":
                raise RuntimeError("Fixture did not finish ready; no automatic retry or fallback")
            return result["steps"][0]["output_ref"]

        workspace = new_workspace(
            "Learn addition of two small whole numbers in one short module with one worked example."
        )
        proposal_id = job(workspace, "plans", {}, "single-course-plan")
        proposal = call("GET", f"workspaces/{workspace['id']}/plans/{proposal_id}")
        call(
            "POST",
            f"workspaces/{workspace['id']}/plans/{proposal_id}/apply",
            {"request_id": str(uuid4()), "expected_proposal_version": proposal["version"]},
        )
        workspace = call("GET", f"workspaces/{workspace['id']}")
        course_id = workspace["course_ids"][0]
        course = call("GET", f"courses/{course_id}")
        module_id = course["modules"][0]["id"]
        change = job(
            workspace,
            "build",
            {
                "module_ids": [module_id],
                "generate_flashcards": True,
                "flashcard_count": 2,
                "generate_quiz": True,
                "quiz_question_count": 1,
            },
            "single-course-build",
        )
        call(
            "POST",
            f"workspaces/{workspace['id']}/changes/{change}/apply",
            {"request_id": str(uuid4())},
        )
        module = call("GET", f"courses/{course_id}/modules/{module_id}")
        print(
            json.dumps(
                {
                    "fixture": "persisted-module",
                    "course_id": course_id,
                    "module_id": module_id,
                    "lesson_characters": len(module["content_markdown"]),
                    "flashcards": len(module["flashcards"]),
                    "questions": len((module.get("quiz") or {}).get("questions", [])),
                }
            ),
            flush=True,
        )
        path = new_workspace(
            "Practice addition, reusing the selected course; add at most one short course.",
            "path",
        )
        plan_id = job(path, "plans", {"reuse_course_ids": [course_id]}, "reused-path-plan")
        proposal = call("GET", f"workspaces/{path['id']}/plans/{plan_id}")
        call(
            "POST",
            f"workspaces/{path['id']}/plans/{plan_id}/apply",
            {"request_id": str(uuid4()), "expected_proposal_version": proposal["version"]},
        )
        change = job(
            workspace,
            "revisions",
            {
                "target": {"kind": "module", "resource_id": module_id, "course_id": course_id},
                "scope": "quiz",
                "instruction": "Use one clear addition question.",
                "count": 1,
            },
            "scoped-quiz-revision",
        )
        call(
            "POST",
            f"workspaces/{workspace['id']}/changes/{change}/apply",
            {"request_id": str(uuid4())},
        )
        print(
            json.dumps(
                {
                    "fixture": "complete",
                    "workspace_id": workspace["id"],
                    "path_workspace_id": path["id"],
                    "rendered_reload_verified": False,
                }
            ),
            flush=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, type=target)
    parser.add_argument("--fixture-prefix", required=True)
    parser.add_argument(
        "--session-file", required=True, help="New private file outside the repository"
    )
    parser.add_argument("--timeout", type=int, default=360)
    args = parser.parse_args()
    if not re.fullmatch(r"synthetic-[a-z0-9-]{1,40}", args.fixture_prefix):
        parser.error(
            "Fixture prefix must be synthetic- followed by 1–40 lowercase letters/digits/hyphens"
        )
    if not 1 <= args.timeout <= 600:
        parser.error("Timeout must be 1–600 seconds per job")
    try:
        run(args)
    except Exception as error:
        # Do not print arbitrary exception bodies, URLs, tokens, email or lesson content.
        print(
            json.dumps(
                {
                    "result": "stopped",
                    "category": type(error).__name__,
                    "detail": "Check the synthetic workspace. No automatic retry or fallback.",
                }
            ),
            flush=True,
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
