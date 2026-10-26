# Task 2 implementation report — 2026-10-26, MacBook

Commit: `ca8f8b3` — feat: plan and build learning material with durable workspace jobs.

Status: implementation complete; independent review, root CUA and remote browser CI remain acceptance gates. No browser was launched by this worker. No services restarted, live inference called, credentials read/copied, provider defaults changed, push or merge performed. Shared Hindsight recall succeeded; retention was not retried because the coordinator reported memory_unavailable.

## Implemented

Goal → durable plan job → editable saved plan → explicit atomic additive apply → bounded module build job → persisted draft review → explicit atomic apply with immutable history → existing study page.

- Strict new/reuse discriminated plans, course1/path1–3, modules1–6/new course, maximum18, globally unique temporary/reference IDs. Existing library/manual sizes remain unrestricted.
- Source reuse is an explicit request allowlist, checked live on admission/read/replay/apply. Refinements retain inherited source dependencies even when deselected. Reused course IDs/authorship remain unchanged.
- Existing single-course plans append approved new modules after the maximum existing order index; original IDs/content remain untouched. Paths append existing/new course references. New resources private, author name read server-side.
- Account-scoped `workspace_requests` receipts, optimistic plan versions, replay before expected-version comparison, payload-key mismatch409. Plan materialization and receipt are one concrete-store transaction.
- One persisted job and private steps before task submission. One runtime provider snapshot per attempt, no persisted credentials. Runner-level lock serializes all workspace jobs, including separate simultaneous jobs. Provider awaits and task creation occur outside storage transactions.
- Validated output/hash persists privately before finalization. GenerationOperation atomically writes proposal/change, successful step, receipt and debit. Finalization failure rolls all success/debit state back while preserving staging. Finalize-only retry uses original step accounting identity/provider/model and works after current credentials are removed, without another call. Unknown attempts require explicit retry and warn about possible external charges.
- Startup marks unfinished attempts interrupted without inference. Shutdown cancels tasks and marks unfinished attempts. Completed output remains reviewable. Cancellation during inference preserves a valid completed first output/debit and stops later steps.
- Full module cost25, plan/refinement10, BYOK Anvil debit0, manual/apply0. Legacy GenerationOperation behavior preserved unless caller supplies `provider_snapshot`.
- Typed module content changes preserve unrequested flashcards/quiz and all sandbox/metadata fields. Replacement-generated cards receive fresh UUIDs. Apply compares current module fingerprint and writes immutable before/after `workspace_revisions` atomically with change status/replay receipt. History failure rolls module edits back.
- UI loads server jobs/plans without remembered client IDs; polls every2s only for queued/running jobs; keyed by account/workspace. Ready/partial outputs have Review actions. No effect applies output. Editable assumptions/outlines, keyboard order buttons, explicit reuse, optional activity counts, first-incomplete-module default, three-module limit, provider/cost/billing point and selected-step retry. Linked outline has module study links.

## Files

Backend models: `models/workspace_plan.py`, `models/workspace_job.py`, `models/workspace_change.py`.
Backend services: `services/workspace_context.py`, `workspace_requests.py`, `workspace_plan_service.py`, `workspace_job_service.py`, `workspace_runner.py`, `workspace_change_service.py`; backward-compatible extensions to `generation_operation.py`, `ai_generation_service.py`.
Backend integration: `api/routes/workspaces.py`, `main.py` lifespan.
Backend tests: `tests/test_workspace_plans.py`, `test_workspace_jobs.py`, `test_workspace_context.py`.
Frontend: `src/types/workspace.ts`, `src/api/workspaces.ts`, `src/hooks/useWorkspaceActivity.ts`, `src/pages/Workspace.tsx`; `src/components/workspace/{PlanPanel,PlanReview,BuildPanel,WorkspaceJobs,ChangeReview,WorkspaceOutline}.tsx`; `PlanReview.test.tsx`, `BuildPanel.test.tsx`; `src/test/workspaceApi.tsx`, `workspaceBuildApi.tsx`.
Browser fixtures: `e2e/server.py` adds synthetic plan responses; `e2e/workspace-build.spec.ts` adds two browser scenarios while preserving existing fixture isolation.

## Interface handoff to Task 3

- `models.workspace_change`: ResourceTarget(kind/course_id/resource_id), ResourceSnapshot(target/fingerprint/fields), ResourcePatch(target/expected_fingerprint/fields), ModuleFields, ChangeSet, Revision.
- Snapshot entry is `WorkspaceContext(storage).snapshot(user_id, target, *, editable) -> ResourceSnapshot` in `services/workspace_context.py`; current ownership/access checked through AccessService. Canonical sorted JSON hash uses editorial fields only, with ordered `module_ids` for courses and `course_ids` for paths. `WorkspaceContext.check` can check access only or compare fingerprints.
- `WorkspaceChangeService(storage).prepare(user_id, workspace_id, patches, origin_job_id=None)`, `.get(...)`, `.apply(user_id, workspace_id, change_id, request_id)` in `workspace_change_service.py`. Initial typed patches support module lesson/activity fields only; Task3 extends this allowlist, not arbitrary JSON Patch. `None` activities mean preserve; apply excludes them. Revision records contain `id/workspace_id/owner_id/change_id/before/after/created_at` and are immutable.
- `WorkspacePlanService(storage, settings)` implements context/stage/save_proposal plus required generate/list/get/update/apply. `generate` is a helper using the same jobs engine; POST routes use asynchronous start. `applied_ids` maps temp course/module IDs and reused course IDs to actual IDs; path ID is on refreshed Workspace.path_id (no reserved map key collision).
- `WorkspaceJobService(storage, settings).start(...kind: Literal['plan','build','revision'], data: BaseModel)`, list/get/cancel/retry in `workspace_job_service.py`. Revision kind deliberately rejects until Task3 adds execution in this engine. Public JobStep includes original provider/model labels as well as required fields. Internal `workspace_steps` adds input/context/staged_output/staged_hash/operation_id/provider/model; internal `workspace_jobs` stores step_ids/cancel_requested. Never serialize raw stored documents as jobs.
- `WorkspaceRunner(storage, settings)` attaches to `storage.workspace_runner`; `submit(job_id, snapshot)` schedules outside transaction, `await wait_idle()` deterministic test helper, `recover_interrupted()` no inference, `shutdown()`. Lifespan initializes/recover/shuts down. Tests may inject/construct runner; ASGI loop test enters lifespan.
- `GenerationOperation.run/_run(..., provider_snapshot: ProviderSnapshot | None = None)`; supplied snapshot controls immutable routing/accounting. Existing callers unchanged. Staging/action and save callbacks remain in the same asyncio task through concrete JSON/SQLite transactions.
- API prefix `/api/v1/workspaces`: POST plans/build/retry202; GET plans/jobs and individual outputs; PUT plans; POST plan apply/job cancel/job retry/change apply. All action requests forbid extra fields and carry request_id.

## Verification evidence

RED: `uv run --directory backend pytest tests/test_workspace_plans.py tests/test_workspace_jobs.py tests/test_workspace_context.py -q` → three collection failures for missing `models.workspace_plan`, `models.workspace_job`, `models.workspace_change`; expected absent interface failures. Initial shell write used wrong working directory and was immediately corrected before this red run.

GREEN focused initial schema/apply/context8, expanded durable tests40, expanded HTTP/recovery tests44. Final focused command from backend:
`uv run pytest tests/test_workspace_plans.py tests/test_workspace_jobs.py tests/test_workspace_context.py tests/test_generation_reliability.py tests/test_json_storage_concurrency.py tests/test_sqlite_transactions.py -q --show-capture=no --tb=short`
→ **108 passed in 2.28s**, comprising 50 Task2 cases plus 58 regression cases. Both JSONStorage/SQLiteStorage covered for atomic apply rollback, debit/receipt rollback, replay, second-step failure, cancellation, provider snapshot, restart, finalize-only retry after credential removal, cross-job serial inference, source revocation, refinement source inheritance, explicit apply/history and HTTP loop.

Full backend (before final six regression cases and their focused fixes): `uv run --directory backend pytest -q --show-capture=no --tb=short` → **374 passed in 51.65s**. Transcript `/tmp/coursekind-task2-backend-full.txt`. Final changes covered by focused108 above.

Every frontend command prefixed `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; `node --version` → **v24.18.0**.
- `npm test -- --run src/components/workspace/PlanReview.test.tsx src/components/workspace/BuildPanel.test.tsx src/pages/Workspace.test.tsx src/pages/Workspaces.test.tsx` → **24 passed**, four files. Tests cover reload-ready, default1/counts5+3, partial saved draft, dismiss no mutation, explicit apply/study, free edit/reorder and stable request retry/refinement.
- `npm --prefix frontend test -- --run` → **169 passed**, 35 files, 3.89s. Transcript `/tmp/coursekind-task2-frontend-full.txt`.
- `npm --prefix frontend run build` → TypeScript and Vite succeeded; existing >500kB chunk warning remains. Transcript `/tmp/coursekind-task2-build.txt`.
- `npm --prefix frontend run test:e2e:types` → success.
- `npm --prefix frontend run test:e2e:list` → **42 scenarios** (original 40 unchanged + WORKSPACE01/02). Transcript `/tmp/coursekind-task2-e2e-list.txt`.
- Scoped ESLint across all new/changed frontend production/tests passed.
- Scoped Ruff on new models/services/tests, changed generation helpers and workspace routes → **All checks passed**.
- `git diff --check` clean.

## Self-review and fixes

Caught optional activity default-null serialization replacing unrequested cards; apply now excludes None and tests preserve original card identity/sandbox. Caught finalize-only retry needing a removed current credential; it now uses persisted provider labels only and test raises if credential lookup occurs. Added two-job global concurrency test. Preserved prior proposal source dependencies through refinement. Removed reserved path mapping key to prevent temp-ID collisions. Added per-step provider labels for mixed retry provenance. Shared generation repair is opt-in for workspace calls so legacy adapter failure behavior stays unchanged. Scoped filenames aligned with planned service boundaries.

## Root CUA / remote CI acceptance cases

1. Create private goal workspace; Generate plan (Anvil llm.primary, 10 credits), review/edit assumptions/module title/reorder, Save free; reload saved plan with no extra model call; Apply free. Confirm private linked course/modules and original workspace ID.
2. Default exactly first incomplete module selected with 5 cards/3 questions. Build (25); observe ready job then reload; Review draft, dismiss (module remains empty), review again, Apply free → history saved → Study link and mark content read. Expected synthetic user balance 65 after plan+one build.
3. Path workspace: explicitly choose learner-authored public source, Generate mixed plan, Apply; source link/authorship unchanged and reused modules excluded from editable build selection.
4. Partial/failure controls in unit/API evidence: ready first draft survives failed second, cancelled next, interrupted restart; selected retry warns external billing and does not auto-apply. Root can supplement via existing synthetic malformed/unavailable fixture controls.
5. Narrow 360px viewport: new review forms/module outlines/retry controls remain readable; keyboard reorder buttons reachable. Account switch removes private results.

## Limits / remaining gates

Only single-process JSON and SQLite transactional guarantees; no distributed or multi-file power-loss atomicity claim. No live-provider qualification. Existing bundle-size warning persists. Browser scenarios are written/typechecked/listed but **not executed locally**; remote CI and root CUA required. Task3 adds wider revisions/history UI/restore; Task2 already persists immutable first-build history and performs explicit apply. No request for permission is needed for remaining coordinator work.
