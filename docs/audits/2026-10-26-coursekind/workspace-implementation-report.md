# Task 1 — Coursekind private workspace lifecycle

Status: Implemented, worker checks passed; independent review found CK-T1-01, addressed in fix round 1 below. Root owns acceptance, CUA and fixed-commit browser CI.

This ignored report was recreated from the worker's retained session after macOS cloud storage evicted the Documents checkout. Active checkout is now `/Users/sekoudoumbouya/code/coursekind-local-v1`; old Documents checkout remains untouched. Root recovered committed history, ledger and seven UI evidence records. No secret or user data was inspected during recovery.

## Original implementation commits

- `374d415` — `feat: add Coursekind private goal workspaces` (first safe root UI checkpoint).
- `9ae518e` — `fix: harden workspace conflict recovery and transaction coverage` (reviewed implementation package).
- Root's subsequent commits through `c2b09c8` preserve documentation, count-bound decisions and CUA records; worker did not modify/stage those records.

## Delivered

- Owner-only create/list/get/update/archive with UUID workspace IDs, UTC timestamps and optimistic versions. Every mutation carries a stable client request ID.
- Additive internal `workspace_requests` receipts use deterministic UUIDv5 IDs, canonical input fingerprints and saved response snapshots. Current workspace/source access precedes receipt replay; matching replay precedes expected_version comparison; differing input under a used key returns 409.
- Real JSONStorage/SQLiteStorage transactions cover source reuse, compare/write and receipt creation; tests exercise competing writers and injected receipt-failure rollback. Storage locks/implementations unchanged; single-process limits remain; no JSON multi-file power-loss or distributed atomicity claim.
- Owned database course/path entry preserves original linked IDs and reuses an active workspace. Archive does not delete linked artifacts; repeated source entry creates a new active workspace while an old archive stays archived. Filesystem/foreign-owned sources remain read/reuse-only.
- `workspace_enabled` defaults true; disabled mutations return a clear 503 while workspace reads and baseline routes remain available.
- `/workspaces` and `/workspaces/:workspaceId` provide explicit brief save, dirty/saving/saved/error states, retained text/identity on Retry, explicit current-server reload after stale saves, archive/restore, archive list toggle and manual course links. Failed reloads retain the draft. Account-sensitive queries and component identity reset hide old saved data/drafts across account changes; no brief text enters localStorage.
- Linked titles load through normal access-checked APIs; missing/inaccessible objects show generic recovery without dropping the workspace.
- Coursekind title/nav/auth branding; Home/Workspaces/Courses/Paths/Settings navigation and goal/study Home entry. Existing course/path study/edit/share controls remain. Mobile nav scrolls with destinations reachable.
- Focused brief form/editor, linked outline, source-entry component and list/detail pages. Provider/model labels use existing preferences; no changed Anvil defaults, runtime settings or dead generation controls.

## Agreed bounds and interfaces

Root accepted new workspace-only card count 1–20 and quiz count 1–10, defaults5/3. Legacy endpoint bounds50/30 remain. Goal trims to1–4,000 characters; prior knowledge max4,000, audience max1,000; optional finite weekly hours0–168. Action payloads reject extra fields and simultaneous source course/path IDs.

## Original verification at 9ae518e

- Initial backend red run:14 expected missing-route failures with successful synthetic auth on both concrete stores.
- Initial rendered red run: missing workspace routes/components and old visible brand; later stale-reload and reload-outage cases reproduced missing recovery before fixes.
- `cd backend && uv run pytest tests/test_workspaces.py tests/test_access_sharing.py -q --tb=short` —36 passed (24 workspace cases,12 baseline access cases).
- `cd backend && uv run pytest -q --tb=short` —330 passed.
- `cd frontend && npm run test -- src/pages/Workspaces.test.tsx src/pages/Workspace.test.tsx` —15 passed.
- `cd frontend && npm run test` —160 passed across33 files.
- Frontend lint/build and scoped new-backend Ruff checks passed; git diff --check passed.
- `npm run test:e2e:types` passed; `npm run test:e2e:list` listed the existing40 scenarios in4 files. Existing mobile selector changed Dashboard→Home without weakening assertions.
- All frontend commands explicitly used Node24.18.0 from `/Users/sekoudoumbouya/.nvm/versions/node/v24.18.0/bin` and login:false.
- Existing Vite large-chunk warning retained as a known limitation; no claim of pristine/warning-free build output.

## Root CUA and review

Root reported checkpoint CUA success at374d415: goal creation/defaults5/3; edit/save/reload; archive/active-list hiding/archive-list reveal/restore; cross-account deep-link generic unavailable and empty own list; repeated owned-course entry reused the same workspace while source content/sharing/score remained intact.

Root later verified stale-save current-server reload at9ae518e and independently reproduced CK-T1-01 after archive/restore. Review evidence: root's `task-1-review.md`; walkthrough evidence: `docs/audits/2026-10-26-coursekind/walkthrough-log.json`.

## Fix round 1 — CK-T1-01 / CK-T1-02

Review: CK-T1-01 Important/P2 found that the editor retained version1 after its parent archived/restored through versions2/3, making the next normal save return409. CK-T1-02 Minor/P3 identified the fake PUT handler's missing expected_version enforcement, which concealed the bug. CK-T1-03 is the acknowledged existing Vite chunk warning.

Implementation: The parent now passes the explicit successful archive/restore response. The editor uses that confirmed version only if the response's full brief still equals its last saved baseline; unsaved draft values remain untouched. A changed server brief retains the old baseline version and must conflict. Existing replay request payloads remain stable. The test API now enforces stored-version/requested-version equality while retaining explicit stale/outage injection controls.

Rendered regressions: archive→restore→edit→save submits versions[1,2,3] and persists version4; a dirty draft survives archive/restore and saves at version3; an externally changed server brief followed by archive/restore rejects the old draft with requested versions[2,3,1], preserves server version4/content and keeps the draft visible.

Exact red command, run from recovered active checkout:

```sh
export PATH="/Users/sekoudoumbouya/.nvm/versions/node/v24.18.0/bin:$PATH"
cd frontend
npm run test -- src/pages/Workspaces.test.tsx src/pages/Workspace.test.tsx
```

Red output before production fix (with strengthened fake and three new regressions):

```text
Test Files  1 failed | 1 passed (2)
Tests       2 failed | 16 passed (18)
Expected: "Dirty draft before archive"
Received: "Learn Python"
```

The two archive/restore saves failed because stale version1 was rejected. The concurrent server-brief regression already passed, protecting the existing conflict behavior.

Exact focused green command: identical to the red command above.

```text
Test Files  2 passed (2)
Tests       18 passed (18)
Duration    2.10s
```

Final full frontend/lint/build output and scoped fix commit are appended after verification below. No backend behavior changed in this fix round.

## Remaining acceptance / limits

Root performs final fixed-commit CUA/review/CI acceptance. Later tasks implement planning/build/history/revisions/Jev and mobile panes. Worker launched no browser or local Playwright, restarted no runtime, made no inference/provider calls, changed no model default, inspected no secrets/user data, and performed no merge/push. Only task-owned code/tests are staged. This ignored report is not force-added; root preserves public evidence separately.

Shared Hindsight recall succeeded during original work; attempted post-work retention returned `memory_unavailable`. No successful retention is claimed.

### Fix round 1 final verification

Exact command from `/Users/sekoudoumbouya/code/coursekind-local-v1/frontend`, login:false:

```sh
export PATH="/Users/sekoudoumbouya/.nvm/versions/node/v24.18.0/bin:$PATH"
set -e
node --version
npm run test
npm run lint
npm run build > /tmp/coursekind-task1-fix1-build.log 2>&1
tail -11 /tmp/coursekind-task1-fix1-build.log
```

Output:

```text
v24.18.0
Test Files  33 passed (33)
Tests       163 passed (163)
Duration    3.80s
> frontend@0.0.0 lint
> eslint .
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 4.62s
```

`git diff --check` also passes. CK-T1-03 remains documented rather than treated as a new fix request. Commit recorded below after scoped staging.

Fix round 1 commit: `d92da47` — `fix: preserve brief drafts across workspace archive transitions`. Four owned frontend files only; root walkthrough JSON remains unstaged. Ready for root's independent review and CUA at this fixed commit.
