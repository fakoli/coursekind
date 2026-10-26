Spec compliance: ❌ Issues found. Task quality: Needs fixes.

### Strengths

- Durable staging and accounting are cleanly separated: `backend/services/workspace_runner.py:207` persists output/hash before `:217` finalization; `backend/services/generation_operation.py:140` runs access, save, debit and receipt in the same owning task/transaction. Finalize-only retries use persisted provider/model and operation identity (`workspace_runner.py:162`; `workspace_job_service.py:201`). The removed-credential regression is present at `backend/tests/test_workspace_jobs.py:474`.
- Explicit reuse allowlisting, inherited refinement dependencies, additive original-course materialization and replay-before-version checks are present (`backend/services/workspace_plan_service.py:32`, `:54`, `:153`, `:177`, `:201`). Tests cover original module preservation and materialization rollback (`backend/tests/test_workspace_plans.py:105`, `:129`, `:199`).
- Generated activity identities are fresh; unrequested activities and sandbox survive; explicit apply and immutable before/after history share one transaction (`backend/services/workspace_change_service.py:32`, `:68`, `:95`). History-failure rollback is tested at `backend/tests/test_workspace_jobs.py:331`.
- Runner-level serialization covers separate jobs (`backend/services/workspace_runner.py:77`; `backend/tests/test_workspace_jobs.py:445`). Account-keyed server discovery, conditional polling and explicit review/apply are implemented (`frontend/src/hooks/useWorkspaceActivity.ts:13`; `frontend/src/pages/Workspace.tsx:35`; `frontend/src/components/workspace/ChangeReview.tsx:31`).

### Issues

#### Critical

- None identified.

#### Important

- **T2-R1 — Cancellation can be overwritten by a stale queued-step read.** `backend/services/workspace_runner.py:86–94`, with `backend/services/workspace_job_service.py:176–186`. The runner reads the job and queued step separately, checks those copies, then unconditionally writes `state="running"`. Cancellation can acquire the SQLite transaction after the step read and before that write, mark the step cancelled, and return successfully. The runner then overwrites the cancelled state and invokes `_execute`; its access callback does not check cancellation. A supposedly stopped remaining step can therefore generate and debit 25 credits. Atomically re-read job cancellation and step state and claim queued→running in a short transaction, then perform inference outside it. Add a deterministic regression that pauses before the claim, commits cancellation, releases the runner, and asserts no new provider call/debit; retain the existing in-flight-valid-output behavior. The existing cancellation test (`backend/tests/test_workspace_jobs.py:183`) pauses inside inference and does not cover this boundary.

#### Minor

- **T2-R2 — Disabled activity counts can still reject an otherwise enabled Build button.** `frontend/src/components/workspace/BuildPanel.tsx:34–45`, `backend/models/workspace_job.py:22–24`. Clear a count input (becomes 0), then turn that activity off: UI validity ignores its count, but the request still sends 0 and the API unconditionally requires >=1. Normalize disabled counts to a valid default, omit them when disabled, or align conditional server validation. Add a focused component assertion for this sequence.
- **T2-R3 — Existing build warning remains.** `/tmp/coursekind-task2-build.txt:73`: Vite reports chunks above 500 kB (main bundle ~2.18 MB). The worker explicitly identifies this as pre-existing; it is not a newly introduced Task 2 blocker.

### Verification and limits

- Read the fixed `4c9690e4879d3beb3737cebbca5d08c33daf2a13..ca8f8b3` review package in contiguous chunks. The initial tool output was truncated; recovered the omitted model/early-helper sections. Did not run git, tests, browser automation, services, live inference, or modify the checkout.
- Focused outside-diff checks: (1) atomicity/task ownership risk — inspected the cut-off `GenerationOperation._run` finalization and concrete JSON/SQLite transaction/CRUD implementations; (2) reused generation contract/count risk — inspected `GenerateModuleContentRequest`, `GeneratedModuleContent`, the cut-off `stage_content` implementation and module activity validation; (3) duplicate runner/storage identity risk — inspected storage singleton factory and dependency provider; (4) account-switch cache risk — inspected existing auth context/hook, which cancels and clears private queries synchronously before exposing the next identity. No broader codebase crawl.
- Read recorded full-run evidence: backend 374 passed, frontend 169 passed; inspected the reported build warning. Final focused 108 passing cases are documented in the worker report; full backend 374 preceded the final six regressions/fixes. No suite was rerun.
- ⚠️ Cannot verify from this diff: actual browser behavior, narrow viewport/keyboard flow, account-switch walkthrough, or all original 40 journeys/D1–D8 at this head. Root CUA and remote browser CI remain acceptance gates. Typechecking/listing 42 browser scenarios is not execution evidence.
- ⚠️ Live provider qualification and whole-branch integration are outside this task gate. Codex CLI remains deferred. Wider revision/history UI/restore belong to Task 3; Task 2 does contain minimal apply history.

### Assessment

**Task quality: Needs fixes.** The implementation has strong persistence, access and review boundaries, but cancellation must atomically arbitrate step admission before this task is trustworthy for billed generation. Root browser acceptance gates remain pending independently of the code finding.
