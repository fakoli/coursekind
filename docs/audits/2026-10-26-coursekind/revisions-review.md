### Spec Compliance

- ❌ Issues found: field-scoped flashcard review is incomplete because editable `visual` values are omitted from both proposal and history comparisons (`frontend/src/components/workspace/ChangeReview.tsx:39`, `frontend/src/components/workspace/WorkspaceHistory.tsx:116`). One Important repair below.
- ✅ The reviewed backend implements scoped, allowlisted proposals, explicit path membership selection, transactional apply/compensating restore, and legacy saved-draft compatibility (`backend/models/workspace_change.py:144`, `backend/services/workspace_revision_generator.py:55`, `backend/services/workspace_change_service.py:232`, `backend/services/workspace_change_service.py:334`, `backend/models/workspace_change.py:192`).
- ⚠️ Controller acceptance remains required for remote browser CI at the reviewed commit and cross-task continuity. The controller reports the actual quiz-only apply/study/reload/restore walkthrough passed, preserving original questions, both attempts, card identities/ratings, and other activities. That controller evidence was not independently reproduced here. Scenario definitions are present at `frontend/e2e/workspace-revisions.spec.ts:5` and `frontend/e2e/workspace-revisions.spec.ts:67`; their presence is not treated as execution evidence.

### Strengths

- Current authority is checked before replay; all fingerprints and field validation precede writes inside the same transaction. History, application metadata, and receipts are written in that transaction (`backend/services/workspace_change_service.py:232`). Restore creates a compensating change and preserves the original revision (`backend/services/workspace_change_service.py:334`).
- Restore fingerprints only touched editorial fields, allowing unrelated lesson edits while refusing changed quiz/card content. Relevant learner-history preservation and rollback tests use concrete store fixtures (`backend/services/workspace_change_service.py:334`, `backend/tests/test_workspace_changes.py:100`, `backend/tests/test_workspace_changes.py:382`).
- Scope validation rejects invented path membership and outline identities. New/replacement cards receive fresh identities while verified historical identities can return during restore (`backend/services/workspace_revision_generator.py:55`, `backend/services/workspace_change_service.py:78`, `backend/tests/test_workspace_changes.py:866`).
- The legacy adapter distinguishes previously omitted null activities from new explicit quiz-null restore patches, with a read/apply/read/restore regression (`backend/models/workspace_change.py:192`, `backend/tests/test_workspace_changes.py:817`).
- The UI retains stable retry keys and keeps conflicting proposals available; path editing changes references through an access-checked public service without deleting sources (`frontend/src/components/workspace/ChangeReview.tsx:120`, `frontend/src/components/workspace/WorkspaceHistory.tsx:69`, `backend/services/learning_path_service.py:81`).

### Issues

#### Critical (Must Fix)

- None found in the reviewed task.

#### Important (Should Fix)

- **T3-R1 — Show flashcard visual changes before apply and restore.** `frontend/src/components/workspace/ChangeReview.tsx:47` renders only `card.front` and `card.back`; the same `EditorialValue` renderer is reused by history at `frontend/src/components/workspace/WorkspaceHistory.tsx:116`. However, `visual` is an editable flashcard property (`backend/models/module.py:13`), and a changed visual contributes to replacement-card identity in `WorkspaceChangeService.prepare` (`backend/services/workspace_change_service.py:78`). With identical front/back text and a different or removed visual, the review looks unchanged although apply changes learner-facing content and can renew the rated card identity. Render the visual value or preview, including a clear removed/none state, in both sides of the shared comparison; add a visual-only change/removal regression covering proposal and history rendering. This is necessary for the task's reviewable field-scoped before/after contract.

#### Minor (Nice to Have)

- The recorded build still emits the known inherited >500 kB chunk warning (`/tmp/coursekind-task3-final-build.txt`). It is not introduced by this task and is not an additional Task 3 acceptance blocker; the output should not be characterized as warning-free.

### Assessment

**Task quality: Needs fixes.**

**Reasoning:** The transactional backend and preservation safeguards are coherent and supported by meaningful regression evidence. The shared flashcard comparison must expose all editable card content before this review workflow can be accepted.

### Checks and review boundaries

- Reviewed fixed `9f48997..928d7f9b3de59d75429edc6ba10e5f519033e31d` using the supplied diff package. The initial combined tool output truncated the beginning of the diff, so only that cut-off portion was recovered in bounded reads; remaining content was read sequentially. No git reruns or changed-source rereads. Line anchors were located from the diff.
- Named cross-contract check: confirm delegated module writes preserve unrelated records and explicit quiz-null state. Inspected `backend/services/module_service.py:158` and `backend/models/module.py:71`; updates use `exclude_unset=True` and touch the module only. The narrow card model lookup also confirmed the visual field.
- Named cross-contract check: nullable historical course descriptions must remain writable/restorable through `CourseService`. Inspected `backend/services/course_service.py:181`, `backend/models/course.py:24`, and the matching path base/update model. Explicit null descriptions are supported; contribution counts are computed on returned course objects (`backend/services/course_service.py:223`), not written into learner history.
- Read saved verification tails: backend 454 passed; final Python 3.12 targeted 155 passed; frontend 175 passed in 38 files; build completed with the inherited warning; browser inventory lists 44 scenarios. Evidence: `/tmp/coursekind-task3-final454-backend.txt`, `/tmp/coursekind-task3-py312-final.txt`, `/tmp/coursekind-task3-final-frontend.txt`, `/tmp/coursekind-task3-final-build.txt`, `/tmp/coursekind-task3-final-e2e-list.txt`.
- No suites, browsers, live inference, merge, deployment, or production/index mutations were run. The only written local artifact is this report.
- Shared Hindsight recall succeeded; returned memories did not override the task brief or live code.
- Shared Hindsight retention was attempted and failed with `memory_unavailable`; the local review report remains available.
