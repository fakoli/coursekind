# Task 5 implementation and verification report

Date: 26 October 2026. Host: MacBook. Repository: `/Users/sekoudoumbouya/code/coursekind-local-v1`. Worker began at `3e368dd01f5b44e7a110d9cf9edea5d910a86507`; root added audit-only commit `81089c7937f9a476c56f4aed60c99f5fe332928b` during implementation. Use `81089c7` as the scoped review base. This report describes the fixed code tree committed with it; the parent handoff gives the resulting exact commit SHA. No remote CI or root CUA result is inferred from local tests.

## Changes and acceptance coverage

- Saved brief, applied plan, revision, advisory review and history use native accessible disclosures. Navigation opens the selected section, and a prominent next-action link leads to Plan/Build. Components remain mounted so unsaved fields survive switching. New unapplied plans reopen; existing linked material can proceed directly to Build. Active/failed jobs remain discoverable; older completed jobs are compact summaries.
- Build normalizes counts for disabled activities. Brief toggles also normalize invalid disabled counts. Enabled cards remain bounded to 1–20 and quizzes to 1–10; no backend validation was weakened.
- Plan/build/revision preflight shows available Anvil quota, explains that application credits are not money, and offers fewer modules, free manual editing, explicit configured BYOK or administrator quota review. No credit grant or new payment flow. Registration currently initializes 100 credits; the normal user's existing 25-credit balance is distinct and untouched. A full synthetic helper sequence costs at most 55.
- Provider adapters retain bounded categories/status for HTTP 503, 429, authentication, timeout, connection and malformed data. Jobs add safe retry guidance and no automatic retry/fallback. Internal failures are distinct from known provider categories. Operator logging records only a bounded category; tests inject secret-like provider bodies and assert no leak. Quota rejection occurs before provider work and retains workspace/material.
- Course references in proposals/history resolve their names from fresh authorized per-account reads. In-flight/error/revoked reads use neutral labels while preserving original link IDs. Existing progress, sharing and ownership semantics are untouched.
- Draft review receives keyboard focus and Dismiss returns to its trigger. Job statuses announce changes. Existing session guards reject late workspace POST results after sign-out/account switch; added tests also prove late job reads cannot refill cleared caches.
- Visible email/SMS sender/subject/body copy and package description now say Coursekind. Capture-only tests cover transport sender/template and notification service subjects/messages. Internal package/exception/storage names and historical audit language remain unchanged; no notification was sent.
- Added `backend/uv.lock`, removed its blanket ignore, and set CI installs to `uv sync --locked --dev --python 3.12`. CI backend and browser server runtime commands select Python 3.12 with `--locked`. No frontend dependency upgrade or unrelated lint repair.
- Added bounded, opt-in `backend/scripts/smoke_workspace.py`. It requires an explicit loopback target and synthetic prefix; creates a fresh disposable account; checks its existing Anvil/llm.primary selection; writes only an exclusive mode-0600 session file outside the repo; reads only objects it creates; prints bounded receipt metadata and quota; stops at the first failed/timed-out job. It does not load/print provider keys, list user courses, change quota/provider preferences, send notifications, mutate fleet state or resume an old inference automatically. Its private session permits root UI/manual continuation.
- Added local operation/recovery guide and root acceptance checklist. README now describes actual BYOK availability, qualified single-process JSON/SQLite, no destructive migration, backend-only optional TypeSafe key, backup-to-separate-path and gate-off rollback boundaries. Historical failed Anvil records remain intact.

## Deterministic verification

All shell operations used explicit repository/backend/frontend cwd and `login:false`. Every frontend command used `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; `node --version` reported `v24.18.0`.

| Command / gate | Final result |
| --- | --- |
| `cd backend && env -u DEBUG uv run --locked --isolated --python 3.12 --group dev pytest tests/ -q --tb=short` | 522 passed, 60.59 s, Python 3.12.13; isolated clean dependency install |
| `cd backend && env -u DEBUG uv run pytest tests/ -q --tb=short` | 522 passed, 59.91 s, Python 3.14.6 compatibility |
| Final helper-only rerun after output/path hardening, isolated Python 3.12 | 7 passed |
| `npm run test` | 198 passed across 39 files, 3.96 s |
| Final review-focus assertions in BuildPanel | 5 passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; inherited Vite chunks above 500 kB warning remains |
| `npm run test:e2e:types` | Passed; no browser launched |
| `npm run test:e2e:list` | 49 cases in 8 files; original 40 preserved, 9 workspace cases across 6 groups |
| Scoped Ruff for changed/new backend Python | Passed |
| `git diff --check` | Passed |

The first full backend runs found one old capture-test expectation still saying Study Buddy; the expectation was updated to the required Coursekind message and both full suites reran green. An initial frontend type build found an unsupported Testing Library `exact` option in the new test; removed it and reran the full frontend checks green. A deterministic registration-schema check also caught that the email validator rejects example.invalid; the helper now uses reserved example.com synthetic addresses and tests them against UserCreate. These were repaired, not excluded.

`WORKSPACE-03` now means partial/restart/retry; the earlier quiz revision case was normalized to `WORKSPACE-04`. Original 40 baseline test files/IDs were not removed. The added browser cases cover partial build/reload/explicit retry, 360 px/keyboard/account recovery with text resizing, and disabled workspace writes with baseline study navigation. Root still owns actual 200% browser zoom, modal focus, screenshots and live rendered evidence. The feature-off browser case intercepts only the write response; real backend gate behavior is separately tested and root-verified at Task 4.

## Root handoff and honest limits

Run from backend against the disposable API only:

```bash
uv run --locked --python 3.12 python scripts/smoke_workspace.py \
  --base-url http://127.0.0.1:8011 \
  --fixture-prefix synthetic-local-v1 \
  --session-file /tmp/coursekind-synthetic-session.json
```

Choose a new session-file path if it already exists. The helper never overwrites it. It does not automatically resume; use the saved synthetic account in the UI for explicit follow-up. A quota failure remains a failure and changes no budget. Anvil/model preference mismatch stops before inference. Root must verify rendered persisted material after each successful loop and record actual provider latency separately from UI observation time.

Read `docs/product/task-5-root-acceptance.md` for all concrete CUA cases, including mobile/zoom, unsaved text, focus return, partial retry, low quota, path titles, account privacy, feature-off recovery and synthetic live loops. Root must push the fixed commit, execute all 49 browser cases in GitHub CI, inspect exact-head backend/frontend matrix outcomes, obtain independent adversarial/aggregate review and refresh the normal runtime only after acceptance. The worker did not push, merge, deploy, start/stop runtimes, run local browser automation, perform actual UI checks, make live inference calls, change secret/config files or deliver notifications.

Earlier live Anvil attempts returned HTTP 503 twice with zero application debit. Task 4's live Jev acceptance and 46-case CI at `06b17dc` are root evidence, not a Task 5 pass. Root's backup drill copied 21 disposable JSON collections and separate SQLite records with processes closed; it does not certify crash/power-loss atomicity. New audit additions link existing evidence without overwriting failures. Root owns walkthrough-log/summary, dependency-audit and screenshot/CI artifacts; they are excluded from this worker commit.

Remaining boundaries: single process only; no distributed or JSON multi-file power-loss guarantees; Supabase workspace support unqualified; public deployment/OAuth/Codex subscription/production notification delivery/legal clearance deferred. Root's refreshed npm audit records two moderate and two low findings, zero high/critical; no broad/downgrade dependency repair was attempted. Shared Hindsight recall succeeded; retention returned `memory_unavailable` and did not block work.

## Independent review follow-up

The Task 5 reviewer found two usability defects at `095542c4c882801dd413282a2afa67449ccf2399`: saved manual proposals bypassed the review trigger capture, and the prominent Next-to-Plan link did not reopen a manually collapsed Plan disclosure. Both are fixed in this follow-up. Saved manual proposals and newly prepared path changes now use the same `openReview` focus path as generated drafts. Section navigation and the primary Next action share one `openSection` handler.

Two regressions cover these paths: open/dismiss a generated draft followed by a saved manual proposal and assert return to the correct second trigger; collapse Plan with typed instructions, activate the primary Next action and assert visible controls plus preserved text. The focused tests pass 15/15. The complete frontend suite passes 200 tests across 39 files (4.95 s), and Node 24 lint/build pass with only the existing large-chunk warning. Backend behavior and the 49 browser cases are unchanged; no backend rerun, browser/runtime operation, live request or audit modification was needed for this UI-only repair.
