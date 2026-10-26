# Coursekind R1–R5 scoped repair re-review

Date: 26 October 2026. Read-only review of the supplied fixed package `review-4744158..c634312.diff`, base `4744158d05c1a1f07b20c4e2ca2fd45152ab4f39`, head `c634312ff869143006d96a429352fddf815fdc2d`. Requirements: `/tmp/coursekind-aggregate-review.md`. Implementation evidence: `/tmp/coursekind-aggregate-fix-report.md`.

**Verdict: changes requested. R1 remains partially unresolved; R2–R5 pass this scoped code review.** One important finding, no critical or minor findings in this repair scope. This is the requested single scoped re-review, not another whole-branch review.

## Strengths

The repairs directly address the reported causes. Live path membership is now projected into workspaces without rewriting historical provenance; historical path snapshots independently recheck former sources. Progress/rating query invalidation is centralized. A durable, transactional plan-application workspace snapshot advances the mounted brief only after a confirmed local action. Retry preview distinguishes current-provider inference from original-provider finalization and names its credit exposure. Manual proposal focus captures the triggering element before the asynchronous pending transition. The added tests meaningfully exercise these boundaries.

## Remaining important finding

### R1 — P2, partially unresolved: repaired workspaces can bill new work whose output remains hidden by an inaccessible historical job

**Location:** `frontend/src/pages/Workspace.tsx`, the new `currentSources` gate and `jobs={activity.jobs.error ? [] : ...}` panel props (repair hunk beginning at new line 162); dependency `backend/services/workspace_job_service.py:65–74` and `backend/services/workspace_plan_service.py:141–150`.

The current membership projection is correct, but the new UI enables authoring after the current path is repaired while replacing an errored jobs/plans list with an empty array. Those collection endpoints still load every historical record through its access-checking `get()`. One old record derived from a removed/revoked/deleted course makes the **entire** list fail, including newly created fully authorized records.

The enabled Build control discards the returned job object and refreshes the same failing collection. A new build can finish, save a draft, and charge credits, but no Review button appears. Reload and “Reload current source access” cannot recover it: the historical denial persists. The same collection failure affects plan discovery, and `useWorkspaceActivity` cannot reliably poll a new job when its successful list data never includes that job. Serializing inference in the backend prevents overlapping calls but does not prevent repeated explicit submissions and charges for invisible results.

**Independent reproduction at c634312:** In disposable JSONStorage with mocked local staging (no network), create a path/workspace on owned A and complete a build; replace the baseline path membership with owned B and delete A; start a B build. Current workspace links correctly equal `[B]`, the new job individually reads as `ready`, its output reference exists, its debit is **25**, and the balance is **50** after the two builds. `WorkspaceJobService.list()` still raises **NotFoundException / 404** because of the old A job. Thus the inaccessible historical record hides the newly charged valid draft.

**Root's independent actual UI observation at the same head:** Revoke reused B, follow Repair linked path, remove the unavailable reference, and reopen the workspace. Current owned-course controls return, but a new Build finishes with an empty Saved jobs area behind the historical collection denial. This independently matches the service reproduction; root also had not inspected its response payload when reporting it.

**Required repair:** Preserve per-record access enforcement while making authorized current outputs discoverable despite inaccessible historical records. A safe partial listing with explicit unavailable-history metadata/placeholders, or an equivalent durable discovery design, should return current jobs/plans without exposing denied output. Retain direct-read/replay/history protections. Merely tracking the latest job in transient component state is insufficient because reload recovery is a requirement. Do not present enabled paid generation as recovered until its resulting draft is reviewable.

**Regression needed:** Include an inaccessible historical job/proposal, repair current membership, generate a new valid plan/build, wait for completion, Review/Apply it, then reload and rediscover it. Assert old denied content remains hidden and the new debit/output occurs once. The newly added rendered R1 test stops after checking that Generate/Build controls reappear; it never executes this recovered workflow.

## Per-finding verdicts

| Finding | Verdict | Evidence |
| --- | --- | --- |
| R1 membership/current access recovery | **Partially fixed, still important** | Get/list/reopen/update now project current membership; baseline hooks invalidate workspace queries; historical provenance remains protected. New job discovery still fails as reproduced above. |
| R2 learner cache invalidation | **Resolved** | Shared refresh invalidates `progress` and `flashcard-ratings`. New continuity tests retain a warm QueryClient across apply/restore. Root reports immediate SPA course progress 50%→25% after adding two modules, and rated deck Hard1→Hard0/Unrated5→restore Hard1/Unrated4 without hard reload. |
| R3 brief baseline after plan Apply | **Resolved** | Apply transaction persists `applied_workspace`; callbacks pass the confirmed snapshot to the mounted editor; matching saved brief advances version while dirty text remains. Clean/dirty and competing-external-save regressions are included. Root reports dirty brief survived Apply and saved successfully. |
| R4 effective retry disclosure | **Resolved** | Server derives bounded `finalize_only`/`operation_credits` metadata without output/credentials; all job panels pass preferences; selected preview shows effective provider/model, maximum debit, quota and external uncertainty. Tests cover both provider-switch directions and finalize-only recovery without current credentials. Root also reports actual openai/gpt-test preview, zero Anvil debit, current quota and warning, followed by attempt 2 ready with a Review button. |
| R5 async new-proposal return focus | **Resolved** | `event.currentTarget` is captured synchronously and carried through preparation; pending/blur regression checks dismissal focus. Root reports actual keyboard new-manual-proposal→Dismiss success in 4.36s. |

## Verification and limits

Read the repair package's complete changed production and test hunks once in bounded passes, plus the worker report. Followed only the named unchanged dependencies needed to resolve the R1 collection/discovery doubt. No subagents, browser sessions, broad suites, Git diff re-derivation, production edits, index changes, merge or deployment. The only independent execution was the focused disposable R1 reproduction above; no provider/network call occurred.

Worker reports **528 backend tests, 210 frontend tests, lint/build, browser typecheck and scoped Ruff passing**, with exact commands in the implementation report. Those suites were not rerun by this reviewer. Exact-head CI was still running when this re-review was dispatched; no final CI pass is inferred. Root's actual UI results are attributed above and do not replace the unresolved R1 workflow.

- **Declined to judge — unrelated baseline/product code:** outside the authorized R1–R5 repair scope; no fresh whole-branch sweep was performed.
- **Declined to judge — audit-only 1a42027 detail:** screenshot pixels, raw CI timing rows, dependency-audit JSON and copied historical review/evidence documents were not exhaustively revalidated. They are evidence-only additions, not production fixes.
- **Declined to judge — independent full-suite/browser execution:** explicitly excluded from this review. Worker/root results are attributed, and pending exact-head CI is not treated as passed.
- **Declined to judge — live vendor qualification and wider local-v1 exclusions:** no new Anvil/BYOK/Jev calls, real notifications, public deployment, legal clearance, distributed/crash guarantees, exhaustive accessibility/device certification or broad security audit. The latest live Anvil 503/zero-debit qualification limit and prior whole-branch exclusions remain unchanged.

**Ready to merge: no.** Resolve the single remaining R1 discovery failure so recovered paid work is actually reviewable and reloadable, while preserving denied historical-source access. R2–R5 need no further production change based on this scoped review.
