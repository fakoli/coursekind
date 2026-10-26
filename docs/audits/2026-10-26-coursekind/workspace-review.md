### Spec Compliance

- ❌ Issues found: **CK-T1-01 (Important / P2)** breaks normal archive/restore followed by brief editing: `frontend/src/components/workspace/WorkspaceBriefEditor.tsx:11` retains an obsolete version after the parent workspace changes. The remaining Task 1 model, route, branding, navigation, ownership, replay and concrete-store requirements are implemented in the reviewed diff.
- ⚠️ Cannot verify from this diff: preservation of every baseline journey and D1–D8 across the full application; the 40-case list/type check is reported, but fixed-commit remote browser execution remains a controller gate (`task-1-report.md:37`). No provider generation or AI-06 implementation appears in this task, consistent with deferral. Root reports final-head stale-save CUA passed and independently reproduced CK-T1-01; this reviewer did not run a browser.

### Strengths

- `backend/services/workspace_service.py:72` and `:103`: source authorization/current workspace ownership precede receipt replay, which precedes optimistic version comparison; mutations and receipt writes share transaction scopes.
- `backend/tests/test_workspaces.py:14`, `:239`, `:264`, `:301`: real JSON/SQLite fixtures, competing writers, injected receipt-write failure rollback, and identical concurrent creation exercise meaningful persistence behavior.
- `frontend/src/hooks/useWorkspaces.ts:10`, `:18` and `frontend/src/pages/Workspace.tsx:19`, `:32`: account-specific query keys, owner checks and account-specific component identity protect private workspace data and drafts.
- `frontend/src/components/workspace/WorkspaceBriefEditor.tsx:33` and `frontend/src/pages/Workspace.test.tsx:165`: failed stale reload preserves the draft, and explicit replacement wording makes successful recovery understandable.

### Issues

#### Critical (Must Fix)

- None found.

#### Important (Should Fix)

- **CK-T1-01 / P2 — Synchronize the editor after archive/restore without discarding its draft.** `frontend/src/components/workspace/WorkspaceBriefEditor.tsx:11` initializes local `version` once; `:21` submits that version. `frontend/src/pages/Workspace.tsx:43` archives/restores using the current parent version, while `:82` keeps the same editor mounted. Starting at version 1, Archive and Restore advance the server to version 3, but the editor still submits 1. A subsequent ordinary edit always fails with 409 and the only offered recovery replaces the draft. Root independently reproduced this exact sequence in actual CUA at `9ae518e`. Reconcile confirmed archive-only version changes while retaining draft text, or coordinate version/state centrally; do not blindly accept a version when the saved brief itself changed. Add a rendered archive→restore→edit→save regression that enforces real version comparison, including a dirty draft surviving the round trip.

#### Minor (Nice to Have)

- **CK-T1-02 / P3 — The frontend fake does not enforce version preconditions.** `frontend/src/test/workspaceApi.tsx:80` accepts PUTs regardless of `expected_version`, unless the global `stale` switch is manually set. Consequently normal lifecycle tests can pass with requests the real backend rejects, hiding CK-T1-01. Make the fake compare its stored version with the request's expected version; keep explicit injected error switches for outage tests.
- **CK-T1-03 / P3 — Reported build output is not pristine.** `.superpowers/sdd/2026-10-26-coursekind-product/task-1-report.md:39` reports the existing Vite large-chunk warning. This is acknowledged pre-existing build noise, not a new Task 1 blocker; retain it as a known validation limitation rather than claiming warning-free output.

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** Backend access, idempotency and concrete transactional persistence are carefully implemented. Frontend draft/version state diverges from its own successful archive mutations, breaking a routine lifecycle transition and requiring CK-T1-01 before acceptance.

- Review check: read the fixed `b0df9d79c911414d21fe95e1b0e4e95dd175e6a7..9ae518e` diff once in three contiguous chunks; no changed files reread, no cut-off hunk recovery needed, no tests rerun, and no checkout/index/branch/runtime mutations.
- Focused outside-diff check — concrete atomicity risk: `backend/storage/json_storage.py:168` stages/rolls back concrete transactions; `backend/storage/sqlite_storage.py:285` uses locked BEGIN IMMEDIATE/savepoint transactions. These are not abstract pass-through guarantees.
- Focused outside-diff check — source ownership risk: `backend/services/access_service.py:62` rejects nonauthor/filesystem course ownership and `:70` rejects nonowner paths.
- Focused outside-diff check — linked-material account cache risk: inspected existing `AuthProvider.tsx` and course/path query hooks used by `WorkspaceOutline`. They use the existing auth/cache machinery; full auth clearing and all baseline access paths remain outside this diff's verification scope.
