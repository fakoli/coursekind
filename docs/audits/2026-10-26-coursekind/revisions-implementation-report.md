# Task 3 — Scoped revisions, history and compensating restore

Date: 2026-10-26. Origin: Codex worker on MacBook. Repository: `/Users/sekoudoumbouya/code/coursekind-local-v1`.

Implementation commit: `928d7f9b3de59d75429edc6ba10e5f519033e31d` (`feat: add scoped revisions and conflict-safe content restore`). Review base: `9f48997` (root's intervening documentation commits only); original assigned Task2 base was `81bb7d20dcdd500e7433abe6b12220e8d02bc756`.

Status: committed for independent review. Root retains acceptance ownership, including actual UI continuity and remote browser CI. This worker launched no browser, issued no live inference, changed no running normal/test service, and performed no merge, push or deployment. Shared Hindsight recall succeeded; retention returned `memory_unavailable`.

## Delivered behavior

- Six validated revision scopes: course metadata, existing course outline, lesson, flashcards, quiz, path references. Target/scope pairs, instruction bounds, count bounds and reuse selection are validated before admission. Structured generation accepts only the selected fields and repairs once at most.
- Existing workspace runner, provider snapshot and staged-output accounting remain authoritative. Costs: metadata/outline/path10, lesson25, cards8, quiz10; BYOK zero Anvil debit. Saved validated revision output can finalize on retry without another provider call or credential lookup. No second runner.
- Explicit path reuse allowlist describes complete permitted resulting membership, including retained references. Model outputs outside it fail even when a course is accessible. Manual path reference proposals are free and access checked.
- Strict per-target and nested fields reject owner, visibility, progress, sandbox and unknown card/question fields. Course outlines retain the exact existing module-ID set; order indexes must match ordered items. Mixed course-outline/metadata or overlapping course-outline/module patches are rejected.
- Saved changes carry full before/after proposal snapshots, request identity, provenance and parent restore reference. Apply rechecks current edit authority, linked target, every fingerprint and proposed membership before writes in one concrete storage transaction. All writes/history/application receipts roll back together.
- History contains immutable full editorial snapshots, touched-field names and aggregate editorial fingerprint. Apply and restore create new records. Plan application records newly created objects and changed existing course/path containers as non-restorable creation history; no destructive undo or legacy history invention.
- Restore compares supplied current fingerprint and recorded after-state for exactly the touched fields. Unrelated manual lesson edits survive a quiz restore; touched-field edits reject. Module/card IDs, attempts, ratings, practice, study, sharing and accounting records survive. A repeated restore key returns its original result before stale checks.
- An explicitly retained card ID is preserved only when front/back/visual are unchanged for that ID. Replacement content gets a new ID even if a model tries to attach an existing rated ID. Restore recovers the verified historical identities. No text-similarity identity matching.
- Compatibility: Task2 persisted omitted optional activities as null. Legacy draft reads retain their former omit-null behavior, while new explicit quiz-null restore is supported. Regression covers old draft read, apply, subsequent read and restore.
- UI: scope/target/count picker with provider and scope cost; field-scoped readable comparisons and object counts; preserve-history summary; Apply/Dismiss; conflict keeps the proposal and offers current-content links and regeneration with current provider/cost. History has creation labels, editorial comparisons and explicit restore, including card-count consequence. Manual path reorder/remove uses keyboard-accessible buttons, source-preservation copy, free proposal review and reload discovery.

## Interfaces and ownership

Backend:
- `models/workspace_change.py`: ResourceTarget/Snapshot, strict ModuleFields/CourseFields/PathFields, ResourcePatch, RevisionRequest, ManualChangeRequest, RestoreRequest, extended ChangeSet/Revision.
- `services/workspace_revision_generator.py`: `context`, `validate`, `stage`, `save_proposal`, `generate` using Task2's durable job contract.
- `services/workspace_change_service.py`: `prepare/get/apply`, `manual/list_changes/history/restore`, shared linked-target validation and touched-field fingerprint helper. Revision represents an atomic group using before/after target lists, preserving Task2's multi-resource history shape.
- `services/workspace_context.py`: course outline snapshots now include ordered module IDs/titles/descriptions/objectives/order.
- Job service and runner dispatch revision work, preserve provider and staging guarantees, and expose revision job outputs through existing polling.
- `services/learning_path_service.py`: additive public `replace_course_references`, validating ownership/access and atomically replacing references without touching source content or learner history. Existing methods unchanged.
- Plan service records creation history within its existing transaction.
- Routes: POST `/{workspace}/revisions` (202), POST/GET `/{workspace}/changes`, existing GET/apply change, GET history, POST history/{revision}/restore, GET snapshots for live manual editing fingerprints.

Frontend:
- Extended workspace types/API/hooks and page integration.
- `ChangeReview`, new `RevisionPanel`, new `WorkspaceHistory`, revised WorkspaceJobs label.
- Updated existing test API fixtures to provide new read endpoints.
- `frontend/e2e/server.py` adds deterministic scoped protocol responses only; no runtime changes were made.

## Red/green verification

All shell execution used explicit repository workdir and `login:false`. Every frontend command used `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; verified `v24.18.0`.

Red:
- `uv run --directory backend pytest tests/test_workspace_changes.py -q` → **12 failed, 8 passed**, with actual missing quiz-only patch support (`fields.content_markdown` required) and restore/history absent. Transcript: `/tmp/coursekind-task3-red.txt`. Initial file-write command had a wrong relative path and was corrected before this real red run.

Final backend:
- `cd backend && uv run pytest -q` → **454 passed in 54.11s**. Transcript `/tmp/coursekind-task3-final454-backend.txt`.
- Isolated Python3.12 `/tmp/coursekind-task2-py312.YPOg0F/bin/python -m pytest backend/tests -q` → **446 passed in 53.41s** before the last HTTP/legacy/card-ID regressions.
- Final isolated Python3.12 targeted changes/jobs/plans/outline/account-activity/access suite → **155 passed in 12.10s**, including all **71** final scoped-change cases. Transcript `/tmp/coursekind-task3-py312-final.txt`.
- Both concrete JSON/SQLite stores cover scoped isolation, baseline original HTTP editor conflict, multi-resource conflict and write rollback, restore write rollback, path-reference preservation/access, restored card identities, hostile replacement-ID reuse, replay/input mismatch, current-access denial, nested field injection, model wrong-scope/allowlist rejection, all scope costs/BYOK, staged-finalize retry, manual reload and legacy saved drafts.
- Scoped Ruff over all modified backend production/tests → **All checks passed**. `git diff --check` passed. Disposable e2e server passed `python3 -m py_compile`.

Final frontend:
- `npm test` → **175 tests passed in 38 files**. Transcript `/tmp/coursekind-task3-final-frontend.txt`.
- New ChangeReview/WorkspaceHistory/RevisionPanel tests: **6 passed**, covering scope/count submission, free manual path proposal, before/after isolation, conflict retention/regeneration, stable apply/restore retry keys, non-restorable creation and restore payload.
- `npm run build` → passed; existing chunk-size warning remains. Transcript `/tmp/coursekind-task3-final-build.txt`.
- Scoped ESLint across modified/new components, tests, API/types/hooks/page and fixtures → passed from frontend workdir. One earlier lint invocation used the wrong working directory and was rerun correctly.
- `npm run test:e2e:types` → passed.
- `npm run test:e2e:list` → **44 scenarios** (40 baseline + Task2 two + Task3 two). Transcript `/tmp/coursekind-task3-final-e2e-list.txt`. No scenario was executed locally.

## Root acceptance walkthrough / CI

Run remote CI at this fixed commit, especially WORKSPACE-03 and WORKSPACE-04. The new scenarios cover quiz-only generation/review/apply, studying the revised quiz, reload/history/restore, preserved attempts/cards/lesson/practice, and a baseline edit in a second tab rejecting stale apply while retaining proposal and regeneration control.

Actual UI suggested sequence using root's prepared study fixture:
1. Existing module with five cards, three questions, content-read and saved attempt/rating history → choose Quiz only, count1, revise. Confirm charge10 for Anvil / zero Anvil debit for explicitly selected BYOK. Before apply, live module unchanged.
2. Review quiz-only fields, Apply free; confirm lesson/cards/practice identical. Study revised quiz and verify prior attempt count remains.
3. Reload workspace; history shows prior build and new quiz revision. Restore quiz entry's prior content, verify original quiz returned, card IDs and ratings/attempts remain. New compensating history record appears.
4. Generate second pending quiz revision; use original module editor in a second tab to save a lesson edit. Applying old proposal must409 with proposal visible, current-content link and regenerate action.
5. Path workspace: free reorder/remove proposal, dismiss/reload/reopen, apply; sources remain. Restore references from history without deleting courses/progress.
6. Cards: unchanged retained cards keep identity. New/replacement text cannot inherit another card's ratings. History displays current-to-restored count consequence, no refund promise.

## Limits / observations

- No browser-rendering, mobile layout or live-provider availability claim from this worker. Root CUA and CI are still required acceptance gates.
- Existing pending plans whose course snapshots predate the newly complete outline fingerprint may require safe regeneration rather than silently applying an older incomplete editorial snapshot. Already applied plans, saved module drafts, original study routes and persisted IDs remain intact.
- Transactions retain the existing single-process concrete-store guarantees; no new distributed or JSON power-loss atomicity claim.
- History never reconstructs missing legacy revisions. Known Task2 revisions/drafts are read compatibly from their persisted typed change and actual saved snapshots.
- Build chunk warning persists. Hindsight retention failed with `memory_unavailable`; recall had succeeded.

## Independent review repair T3-R1 — 2026-10-26

Fix commit: `cc6fd8fc46270952af104347e271755e76ee68be` (`fix: expose flashcard visual changes in revision review`), based on `928d7f9`.

Addressed Important T3-R1 from `/tmp/coursekind-task3-review.md`. The shared `EditorialValue` flashcard renderer now displays `Visual: <exact reference>` or explicit `No visual` alongside front/back. This appears in both proposal before/proposed and recorded history before/after, so a visual-only change/removal is reviewable before Apply or Restore. References are inert React text: neither image requests nor links are created; supplied URLs and markup are escaped rather than activated. No backend, identity, generation, runtime or browser behavior changed.

Also addressed root's actual-UI polish: removed the duplicate fixed conflict paragraph. The existing server error remains the single announced alert; current-content links and regenerate controls remain in place. The conflict regression now uses the real server message and asserts exactly one copy.

Tests and verification:
- Red: focused ChangeReview/WorkspaceHistory tests → **7 failed, 3 passed** (six missing-visual cases plus duplicate conflict message). `/tmp/coursekind-task3-r1-red.txt`.
- Green: ChangeReview, WorkspaceHistory, RevisionPanel, BuildPanel → **15 passed in four files**. `/tmp/coursekind-task3-r1-green.txt`.
- Six added parameterized cases cover identical front/back with a changed visual, removed visual, or untrusted URL/markup, on both proposal and history surfaces. They assert both old/new values or No visual and no image/link/SVG/iframe activation.
- Explicit Node24 v24.18.0: scoped ESLint passed; `npm run build` passed with the inherited chunk-size warning. `/tmp/coursekind-task3-r1-build.txt`.
- `git diff --cached --check` passed. Only three owned renderer/test files were staged and committed. Root docs/screenshots WIP preserved.

No browser, live inference, service changes, merge/push/deployment, or expanded backend retesting was performed for this small renderer repair. Root owns re-review/CI/UI acceptance. Prior shared-memory retention failure remains recorded above.
