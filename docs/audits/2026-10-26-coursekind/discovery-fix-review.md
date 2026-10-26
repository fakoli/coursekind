# Coursekind remaining-R1 discovery fix review

Date: 26 October 2026. Fixed package: `review-c634312..4868fd2.diff`. Base `c634312ff869143006d96a429352fddf815fdc2d`; head `4868fd2f351a8b62ef76ae1f07f8e1ec731dc171`. Requirements: remaining R1 in `/tmp/coursekind-aggregate-fix-review.md`; implementation evidence: appended follow-up in `/tmp/coursekind-aggregate-fix-report.md`.

**Verdict: approved for this narrow repair scope. Remaining R1 is resolved.** No critical, important or minor findings identified in this patch. Earlier R2–R5 approvals remain unchanged; they were not reopened.

## What was verified

- The optional `?partial=true` route contract returns authorized `items` plus an `unavailable_count`; existing strict array routes remain compatible.
- Discovery first checks the current owner/workspace/source context outside the per-record exception handler, then scans records scoped to that owner and workspace inside the concrete storage transaction.
- Each job, plan and change goes through its existing access-checking read. History uses extracted existing per-entry authorization/enrichment logic. Only `NotFoundException` and `ForbiddenException` from individual reads become omissions. Storage/runtime failures propagate.
- Omitted records expose only their count: no denied identifiers, source titles, timestamps, content, output references or provider details. The change does not relax direct read, replay, apply or restore checks.
- The UI uses the durable discovery endpoints for jobs, plans, changes and history. Polling checks authorized queued/running items, output changes trigger plan refresh, and existing saved output is rediscovered after reload. Unavailable-history notices distinguish omitted records from an empty history.
- The new backend regression traverses both revocation/deletion on JSON and SQLite, current-source rejection before repair, new plan/build discovery, review/apply/replay, reload through fresh services, exact single accounting, denied historical reads/replays/restores, foreign-account denial and non-access error propagation.
- The new rendered regression performs actual timer-driven queued→ready polling, plan Apply, build Review/Apply, and rediscovery through a fresh page/QueryClient. It verifies two generation submissions and preserves the unavailable-history notice.

This resolves the prior charged-but-hidden-output defect through persisted per-record discovery, rather than transient component state or weaker source checks.

## Evidence and scope limits

Read the complete supplied production/test diff once in bounded passes and the appended implementation report. No new whole-branch sweep, subagents, browser sessions, suite reruns, provider calls, production edits, index changes, merge or deployment.

Worker reports **536 backend tests, 211 frontend tests, lint/build, browser typecheck and scoped Ruff passing**, including eight JSON/SQLite discovery cases and one rendered full-flow regression. Exact commands/results are in the implementation report; they were not independently rerun here.

Root reports actual UI at `4868fd2`: the already saved hidden build appeared **without regeneration**, with one unavailable job and one unavailable plan explicitly reported; Review→Apply→reload→review applied completed in **20.459s**. A fresh Generate plan→review→Apply→reload→reopen applied completed in **8.633s**, while the foreign source remained private and denied content stayed hidden. These are root-observed UI results, not this reviewer's browser execution.

- **Declined to judge — unrelated functionality:** this authorization covers remaining R1 and regressions introduced by this patch; unrelated whole-branch behavior was not re-audited.
- **Declined to judge — exact-head CI completion:** CI was running at dispatch; no final pass is inferred. Root retains that acceptance gate.
- **Declined to judge — independent browser/suite execution:** explicitly excluded; supplied worker/root evidence is attributed above.
- **Declined to judge — external/local-v1 qualification limits:** no live provider, billing, production notification, public deployment, distributed/crash, legal or exhaustive device/accessibility certification was attempted. The prior live Anvil HTTP503/zero-debit limitation and documented local-v1 boundaries remain unchanged.

**Ready from the remaining-R1 code-review standpoint: yes.** Root should finish the exact-head CI/evidence gate before declaring final local-v1 acceptance. This approval does not authorize merge or public deployment.
