# Task 4 implementation handoff — optional TypeSafe/Jev review

Date: 2026-10-26. Origin: MacBook, `/Users/sekoudoumbouya/code/coursekind-local-v1`.
Assigned production base: `cc6fd8fc46270952af104347e271755e76ee68be`; root's intervening docs-only checkpoint is `94e59be`. This report accompanies the implementation commit titled `feat: add optional typed material review with Jev`; the exact commit SHA is in the worker handoff. No merge, push, deployment, live provider inference, browser execution, secret/config-file changes or running-server changes were performed by this worker.

## Delivered interfaces

- `backend/models/workspace_review.py`: strict bounded `MaterialReviewRequest`, pinned typed `JevResult`, `MaterialReview`, and read-only `ReviewSources` schemas.
- `backend/services/jev_client.py`: existing httpx transport; direct official `POST https://api.typesafe.ai/v1/systemone`, pinned `jev-1.14.0`, three named Noul questions. Exact answer keys/types, finite numeric 0–1 values, model and nonnegative integer usage are validated. Boolean/string/huge-integer/NaN/partial/extra results fail closed. At most one retry, only 429/529; 20-second total deadline includes both attempts and backoff. Redirects disabled. Safe exceptions never include provider bodies, auth or headers.
- `backend/services/workspace_review_service.py`: authorized current or staged module snapshots; exact excerpt/objective/index membership; 8,000/1,000/4,000 selection bounds; source/resource fingerprint, selected state, prompt version and model hashing; independent marker includes resource timestamp, current fingerprint, latest workspace revision and immutable proposal version/status. Byte-identical restoration invalidates old reviews. Current access is checked before cache/replay and again after provider completion. Single-process workspace review locks prevent duplicate concurrent requests. Pending receipts are stored before inference outside transactions; interruption replays unavailable, never silently repeats inference.
- Settings: `workspace_review_enabled=True`, backend-only `typesafe_api_key: SecretStr | None`, pinned `jev_model`. Configured capability exposes only a Boolean. The ignored credential was not inspected, copied or edited.
- Routes: `GET /api/v1/workspaces/{id}/review-sources?change_id=...`, `POST /api/v1/workspaces/{id}/reviews`, `GET /api/v1/workspaces/{id}/reviews/{review_id}`. Read-only source enumeration supplies existing module snapshots and opaque markers for exact disclosure. Review receipts use `workspace_reviews` plus existing request ledger. No GenerationOperation, Anvil debit, score/completion/account/access or generation-provider mutation.
- Frontend `MaterialReview.tsx`: current workspace and staged-draft entry points; collapsed until explicitly opened; selects an existing objective and quiz item; excerpt inputs change boundaries only; exact outgoing excerpt/options/marked answer are visible before the explicitly named TypeSafe send action. Fixed percentages, Advisory label, no threshold/badge/fabricated explanation. Retry/refresh are explicit. Missing key retains material. Review GET polling/access checks and workspace refresh invalidation detect stale content; polling never sends provider requests. Keyboard form submission and result focus are covered.
- `frontend/e2e/server.py`: isolated synthetic TypeSafe transport and fault controls only. Two new browser scenarios use canonical WORKSPACE-05 group, reserving WORKSPACE-06 for Task 5.

## Verification

Red before implementation:

- `cd backend && uv run pytest tests/test_workspace_reviews.py -q`: expected collection failure, missing `models.workspace_review`.
- Explicit Node24 `npm test -- MaterialReview.test.tsx`: expected missing `MaterialReview` component after correcting an initial fixture syntax typo.

Green:

- Backend focused final: `uv run --isolated --python 3.12 --group dev pytest tests/test_workspace_reviews.py -q --tb=short` — **55 passed**. Isolated environment leaves the existing backend runtime unchanged. JSON and SQLite are both exercised.
- Backend full suite: `uv run pytest -q --tb=short` — **508 passed** in 56.83s before one final defensive huge-integer parser case was added; final focused 55 includes that case and its range-before-finiteness fix.
- Focused Ruff check for all changed backend files — passed.
- Every frontend command used `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` and verified **v24.18.0**, `login:false`.
- Frontend full Vitest: **188 passed / 39 files**, including seven MaterialReview tests. Covers no request at mount, source disclosure, generation completion or draft opening; exact selection; fixed dimensions; malformed/unavailable/stale; explicit retry; keyboard form submission and focus.
- `npm run lint` — passed (including final scenario formatting).
- `npm run build` — passed; inherited Vite large-chunk warning remains.
- `npm run test:e2e:types` — passed after final scenario synchronization correction.
- `npm run test:e2e:list` — **46 cases / 7 files**, listing both new WORKSPACE-05 cases. Listing/typechecking does not establish execution or actual UI acceptance.
- `git diff --check` — passed before commit.

Backend cases additionally cover exact endpoint/model/header presence, no account/history in outgoing state, missing credentials, 401/400/503/429/529/timeout, total deadline, safe failures/logs, request replay/cache/refresh, identical-content restore, proposed question selection, stale proposal base, oversized source questions, concurrent calls, revoked source including during inference, route authorization, and material/accounting preservation.

## Root acceptance still required

1. Independent spec/quality review at the committed SHA.
2. Actual CUA walkthrough of current and staged disclosure, ready/unavailable/stale states, source selection, and mobile layout. No worker UI execution occurred.
3. GitHub CI execution of 46 browser cases at the reviewed SHA. The root-reported accepted Task 3 baseline is 44 cases; this task does not claim new remote CI success.
4. One authorized bounded synthetic three-dimension live call through `JevClient` after secure backend key setup, recording only model/status/usage. Existing two-dimension research connectivity is not this task's qualification. All worker Jev evidence is mocked; live three-dimension qualification remains pending root.

Known limits: single-process locking/storage guarantees remain; no distributed admission claim. Jev probabilities are advisory and uncalibrated for educational correctness. Review receipts survive reload and are accessible through GET/cache; the UI currently shows results from its current explicit review interaction rather than a separate historical-review listing. No learner material was used for a live provider call.

## Independent review repair — current-revision selection recovery

The reviewer found that same-module source refreshes left initialized objective, excerpt end and question index in component state. After accepting current material, a sole replacement objective, shorter lesson or removed selected question could leave the form invalid with no obvious recovery.

The scoped repair adds an explicit acceptance version to the selection component identity. Background source refreshes keep the old result visibly stale. “Review current material” first completes a fresh authorized read, then resets all selection and prior request/result state together from the newly accepted source. Loading cannot send inference, and errors are handled without an unhandled rejected promise. The current-source query key is consistent when switching from staged to current content.

Verification on Node v24.18.0, explicit PATH and `login:false`:

- Added all three requested same-module regression cases before fixing production: **3 failed / 7 passed**, each reproducing the disabled send action.
- `npm test -- MaterialReview.test.tsx`: **10 passed** after the repair. Each regression checks stale-result preservation before acceptance, reset values, no implicit provider request, and the next explicit request's new marker/fingerprint/selection.
- `npm test`: **191 passed / 39 files**.
- `npm run lint` and `npm run build`: passed; inherited large-chunk warning remains.
- `git diff --check`: passed.

Only `MaterialReview.tsx`, its test file and this task report belong to the repair commit. Shared root documentation/screenshots remain untouched. No backend, browser execution, live provider or runtime-server changes were made. Root owns independent re-review and actual UI/CI acceptance of the repair SHA.
