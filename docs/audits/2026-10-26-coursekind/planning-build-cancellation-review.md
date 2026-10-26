Spec compliance: ✅ T2-R1 fixed. Scoped task quality: Approved.

### Evidence

- `backend/services/workspace_runner.py:79–86`: initial queued→running job admission now rechecks both persisted state and cancellation inside one concrete-storage transaction.
- `backend/services/workspace_runner.py:90–99`: each step claim atomically rereads the live job and step, checks cancellation/queued state, and writes running. Cancellation that commits before claim cannot be overwritten by a stale step copy. Break/continue exit the transaction normally.
- `backend/services/workspace_runner.py:100–102`: `_execute` begins after the claim transaction exits; provider work remains outside storage locks. Already claimed in-flight operations retain the existing valid-output/debit behavior.
- `backend/tests/test_workspace_jobs.py:499–542`: deterministic pre-claim barrier lets cancellation commit first and then asserts cancelled state, zero calls, zero receipts/debits and unchanged balance. The per-task depth guard excludes nested SQLite savepoints. Worker evidence reports both concrete stores passing, together with the existing during-inference cancellation cases: 4 narrow tests and 57 covering job/storage tests passed; Ruff and diff checks clean.

### Findings

- No unresolved Important/Critical findings or new breakage identified in this production diff. T2-R1 is closed.
- T2-R2 disabled-count normalization is explicitly deferred to Task 5. T2-R3 is the existing bundle warning. Neither is reopened by this scoped backend fix.

### Verification limits

- Read `ca8f8b3..a1e6f33` runner/test diff and the worker's fix-round report. Diff stat confirms only runner/test code changes; other files are documentation/evidence. No production edits, test reruns, browser execution, live inference or runtime changes performed.
- This approves the cancellation fix only. Browser acceptance and whole-branch integration remain controller-owned; this rereview does not establish their current status.
