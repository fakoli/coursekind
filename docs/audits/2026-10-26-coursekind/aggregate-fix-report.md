# Coursekind consolidated R1–R5 repair report

Date: 2026-10-26. Originating host: MacBook. Repository: `/Users/sekoudoumbouya/code/coursekind-local-v1`.

Review requirement package: `/tmp/coursekind-aggregate-review.md`, all R1–R5. Product constraints and Task 5 interfaces were read before implementation. Implementation began from `4744158d05c1a1f07b20c4e2ca2fd45152ab4f39`. Root independently committed audit/docs at `1a42027` during this work. This worker committed only its 27 production/test files as **`c634312ff869143006d96a429352fddf815fdc2d`**. Root's uncommitted `docs/product/morning-report-2026-10-26.md` was preserved and not staged. No push, merge or deployment was performed. No subagents, local browser/Playwright execution, live external inference or secret access.

## Changes and decisions

### R1 — Current membership and retained provenance

- `WorkspaceService` now projects path-linked workspace `course_ids` from the currently authorized live path for get/list, reused Open in workspace, and update responses. The private brief remains readable when its path itself is unavailable, preserving the existing unavailable-source recovery contract. Concrete context operations still require current path and course access.
- This is a live projection, not a migration or blind rewriting of historical records. Workspace request replay retains its original response semantics. New reads/open requests receive current membership; current writable context uses it immediately.
- Baseline path mutations invalidate workspace query families as well as their existing path/course/progress families. Returning to the existing workspace therefore discovers the changed membership without a hard reload.
- `WorkspaceContext.check` independently rechecks the course IDs stored inside each historical path snapshot. Changing the live path cannot launder revoked/deleted historical source access. Existing change before/after, proposal, job-source and restore checks remain in place.
- The page independently checks current source snapshots before opening authoring/activity controls. A historical plans/jobs denial does not prevent fresh work once current sources are authorized. Historical list responses remain fail closed; inaccessible jobs/plans are not passed from stale query data into panels. The page explicitly reports unavailable history/job status rather than claiming zero jobs. History and saved manual draft components suppress cached entries after access errors.
- When a current source is unavailable, the page links to the baseline path with instructions to remove the unavailable reference through Edit path and return. A reload-current-access action is also present. No revoked title/output is disclosed through this recovery UI.
- Inference admission/execution is unchanged: the backend runner still serializes provider inference across its jobs. A historical list failure is not treated as proof that the backend has no active work.

Coverage on both JSON and SQLite: baseline remove/add after source deletion/revocation; get/list/reopen/update projection; current context recovery; independently denied historical snapshots; workspace proposal replacement, new-course build selection, obsolete-course build rejection, restore, later baseline removal/deletion, historical proposal read and restore denial. Rendered regression uses the actual baseline remove hook to invalidate/reload current membership while historical jobs/plans remain unavailable.

### R2 — Warmed learner caches

The shared workspace refresh now invalidates `progress` and `flashcard-ratings`, including their descendant keys, for the existing Plan Apply, draft Apply and restore callbacks. This refreshes course/path completion, Continue Learning, ratings summaries and index-based filter consumers after editorial changes.

New rendered continuity cases use real hooks, real workspace action components and a single retained QueryClient with fresh (`Infinity` in the fixture) cached results. They leave the study projection, Apply, and return without remounting the query client or hard reloading. A completed two-module course becomes 67% after an additive third module; its path and Continue Learning update. A warmed Easy card becomes unrated on replacement and Easy again on restore; filtered rating queries are also invalidated. The full backend suite includes retained/replaced card identity and learner-history preservation coverage. These component projections do not claim to substitute for root's actual ModuleViewer/CUA check.

### R3 — Confirmed local plan application and mounted briefs

`PlanProposal.applied_workspace` is an optional, durable workspace snapshot captured inside the successful plan-application transaction. It preserves the exact confirmed brief/version, including idempotent response replay. PlanReview forwards this result through PlanPanel to the mounted brief editor. This avoids a post-apply GET race or an extra fetch failure becoming a false plan failure.

The editor advances its optimistic baseline only for a confirmed local archive/restore or plan application whose saved brief matches the editor's saved baseline. It keeps dirty text. A generic workspace query refresh does not adopt an external editor's version. Older stored plan records remain valid because the new field defaults to null; no baseline is guessed from a missing confirmation.

Rendered tests cover clean and dirty mounted briefs through Apply, preserving dirty text and saving at version 2, plus an external brief save after Apply that correctly conflicts while preserving local text. Backend tests verify the applied workspace snapshot's exact version/brief and replay identity on both storage implementations.

### R4 — Selected retry disclosure

Public job steps now include only two additional bounded descriptors: `finalize_only` and `operation_credits`. The service derives finalization from presence of staged output and operation cost from the existing plan/build/revision cost schedule; staged output and credentials remain excluded from public payloads.

All three job panels pass the current preference selection into retry preview. Each selected step names either new inference with the current provider/model or saved-output finalization with its original provider/model and no model call/current credential requirement. The preview totals the selected maximum Anvil debit, including any original-provider finalization debit, and shows current quota with existing quota recovery guidance. It preserves the unknown prior external-charge warning and warns about new external inference charges. New inference requires a configured selection; finalize-only recovery does not. Missing cost metadata disables retry until reload, rather than inventing a zero cost.

Rendered tests switch both Anvil→OpenAI and OpenAI→Anvil after failure, select only the second step, assert provider/model/cost/quota before any retry, then assert selected step IDs. Another case finalizes saved Anvil output with an unconfigured current OpenAI selection, displaying the original 25-credit maximum and requiring no credential. Existing backend finalize-without-credentials regression now also asserts the public descriptors and absence of staged output. Runner/accounting/idempotency mechanics are unchanged.

### R5 — Async new manual proposal focus

PathReferences captures the initiating event's `currentTarget` synchronously and carries it across the asynchronous manual-change preparation to RevisionPanel's review trigger. Saved/manual and generated row openings retain their existing synchronous focus capture. Dismiss focuses the original now-enabled preparation button.

The new rendered test covers creating a manual proposal (not reopening an existing one), holds its request pending, checks the disabled trigger, explicitly blurs it to model browser behavior, resolves the request, checks Draft review focus, then checks Dismiss returns focus to the original trigger. Root owns the final native browser keyboard check.

## Exact verification commands and results

All commands used explicit active-repository workdirs and `login:false`. Frontend invocations began with `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. Backend commands used its existing `.venv` Python 3.14. No credential-dependent commands were run.

1. From `backend`: `.venv/bin/python -m pytest tests/test_workspace_context.py tests/test_workspace_changes.py tests/test_workspace_jobs.py tests/test_workspace_plans.py tests/test_workspaces.py -q` — **154 passed in 15.43s**.
2. From repo: `npm --prefix frontend test -- src/components/workspace/PlanReview.test.tsx src/components/workspace/RevisionPanel.test.tsx src/components/workspace/WorkspaceJobs.test.tsx src/pages/Workspace.test.tsx` — initial focused pass **25 passed in 2.64s**.
3. `npm --prefix frontend test -- src/components/workspace/WorkspaceContinuity.test.tsx` — **2 passed** (final focused execution 1.59s).
4. From `backend`: `.venv/bin/python -m pytest -q` — **528 passed in 61.47s**.
5. `npm --prefix frontend test` — final complete suite **41 files, 210 tests passed in 4.37s**.
6. `npm --prefix frontend run lint` — **passed**.
7. `npm --prefix frontend run build` — **passed** after final production edits; output in `/tmp/coursekind-aggregate-build.log`. Existing Vite bundle-size warning remains (some chunks exceed 500 kB); no build/type errors remain.
8. `npm --prefix frontend run test:e2e:types` — **passed**. This is TypeScript checking only; no browser was started.
9. From `backend`: `.venv/bin/python -m ruff check services/workspace_service.py services/workspace_context.py services/workspace_job_service.py services/workspace_plan_service.py models/workspace_job.py models/workspace_plan.py tests/test_workspace_context.py tests/test_workspace_changes.py tests/test_workspace_jobs.py tests/test_workspace_plans.py` — **All checks passed**.
10. `git diff --check` — **passed** before commit. Only owned production/tests were staged and committed.

During construction, Ruff identified four overlong newly added test lines; those were formatted. TypeScript identified a new NextUp test fixture using an array where the real API returns `{items: [...]}`; the fixture and projection were corrected and the focused test, complete suite, lint/build and e2e typecheck subsequently passed. These were fixed local test-construction issues, not hidden passing runs.

## Remaining acceptance and limits

No known R1–R5 deterministic regression remains in this package. Root should refresh the disposable runtime to c634312, run actual R1 repair/revocation, R2 warmed learner views, R3 mounted brief, R4 selection preview and R5 keyboard checks, and run GitHub browser CI at the exact head. This worker does not claim those pending root-owned checks have passed. The previous live Anvil 503 qualification limit is unchanged; this repair wave made no live provider calls or new availability/billing claim. All local-v1 constraints and no-merge/no-deploy authorization remain in force.

---

# Authorized remaining-R1 follow-up: durable partial discovery

Date: 2026-10-26. Originating host: MacBook. Explicit parent authorization followed the remaining R1 finding in `/tmp/coursekind-aggregate-fix-review.md`; that report was read first. R2–R5 were accepted and received no additional behavioral redesign. Base **c634312ff869143006d96a429352fddf815fdc2d**; follow-up commit **4868fd2f351a8b62ef76ae1f07f8e1ec731dc171**. Root's in-progress audit/product/journey documents were preserved, not staged. This worker did not push, launch a browser, spawn agents, call live inference/network services, merge or deploy.

## Remaining defect and repair

The earlier patch restored current membership but left collection discovery all-or-nothing. An inaccessible older job/proposal could therefore hide a newly saved, charged draft. The correction supplies durable per-record discovery, not a component-local latest-job workaround.

The existing jobs, plans, changes and history GET routes now accept **`?partial=true`**. That explicit form returns **`{items: [...authorized records], unavailable_count: N}`**. The existing default list response and its strict behavior remain compatible with prior clients, and direct get/apply/restore/replay policies are unchanged. The current UI uses the new partial form for all four collections.

A shared helper scans persisted records scoped by owner/workspace inside a concrete storage transaction. It first checks current workspace/source access. Each record is then read through the same existing access-checking service read used by the strict collection/direct path; history uses the extracted existing per-entry enrichment logic. Only record-level NotFound/Forbidden denials are omitted. Omission reveals a count, never denied record IDs, titles, timestamps, prompts, provider details, output references or content. Unexpected storage/runtime errors still fail the request; the helper does not disguise outages as unavailable-source history.

The frontend retains authorized job items for polling and review, and authorized plans for Apply/refinement. It explicitly shows the number of unavailable earlier jobs/plans and clarifies that the visible job counts cover visible records. Manual proposal and history sections independently show omission notices; a history with only unavailable entries no longer claims there were no recorded changes. Existing current-source denial and account/session guards remain intact.

This also recovers previously saved authorized output: discovery reads existing durable records on every load. Nothing needs to be regenerated, migrated, recharged, or tracked in transient component state. For root's repaired fixture, refresh the updated UI or inspect `/jobs?partial=true` to retrieve its already saved accessible build. The legacy strict `/jobs` route may still deny because that compatibility contract is intentionally unchanged.

## Regression evidence

`backend/tests/test_workspace_discovery.py` adds eight cases across JSONStorage and SQLiteStorage:

- Both deletion and visibility revocation of a foreign historical path source are exercised. Current-source discovery first fails while the revoked source remains linked; baseline repair then removes it.
- An old plan job/proposal, manual proposal, and revision remain inaccessible. A fresh plan starts, is discovered after completion, is applied, and replays without duplication.
- A fresh build is held in a real queued/running stage while partial discovery is polled, then allowed to finish. Its single output is read/reviewed and applied. Repeated start/apply requests return the same job/output/revision.
- New service instances rediscover the new plan/build/draft/history from the same durable store after completion, including an output already saved before reload. Each collection reports one inaccessible old record. Denied source ID/content markers are absent from all partial envelopes.
- Exact generation accounting is asserted: two 10-credit plans plus one 25-credit build, **3 receipts, 45 total credits, remaining balance 55 from 100**, two plan calls and one build call. No duplicated change set/output/debit on replay.
- Old direct job/proposal/draft reads, old request replay, old plan Apply, old restore and another account's discovery continue to fail. Non-access runtime errors propagate. HTTP tests verify the opt-in envelope and the existing default empty-array contract for all four collection routes.

`WorkspaceDiscovery.test.tsx` adds a rendered full-flow regression using the real UI, query hooks, mutations and 2-second polling against a deterministic HTTP fixture. It reports one inaccessible historical record per collection, starts a plan, observes queued→ready, reviews/applies it, starts a build, observes queued→ready, opens Review and applies the draft, then creates a fresh QueryClient/page to rediscover and review the applied draft. It verifies exactly two generation submissions and the explicit unavailable-history notice rather than a false empty history message. Existing frontend fixtures/tests were adjusted to the new explicit discovery response shape, retaining their original behavioral assertions.

## Follow-up commands and results

Every command used the active repo `/Users/sekoudoumbouya/code/coursekind-local-v1`, explicit workdir and `login:false`. Frontend commands used `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`; backend commands used its existing Python 3.14 `.venv`.

- From `backend`: `.venv/bin/python -m pytest tests/test_workspace_discovery.py -q --show-capture=no` — **8 passed in 1.53s**.
- From repo: `npm --prefix frontend test -- src/pages/Workspace.test.tsx src/components/workspace/WorkspaceHistory.test.tsx src/components/workspace/RevisionPanel.test.tsx src/components/workspace/WorkspaceContinuity.test.tsx` — **24 passed in 2.89s**.
- `npm --prefix frontend test -- src/components/workspace/WorkspaceDiscovery.test.tsx` — final focused run **1 passed in 5.51s**, including actual timer-driven polling in jsdom.
- From `backend`: `.venv/bin/python -m pytest -q --show-capture=no` — **536 passed in 62.31s**.
- `npm --prefix frontend test` — **42 files / 211 tests passed in 6.43s**.
- `npm --prefix frontend run lint` — **passed**.
- `npm --prefix frontend run build` — **passed**. Output: `/tmp/coursekind-discovery-build.log`; inherited >500 kB bundle-size warning remains.
- `npm --prefix frontend run test:e2e:types` — **passed**; no browser was launched.
- From `backend`: `.venv/bin/python -m ruff check api/routes/workspaces.py models/workspace_discovery.py services/workspace_discovery.py services/workspace_job_service.py services/workspace_plan_service.py services/workspace_change_service.py tests/test_workspace_discovery.py` — **All checks passed**.
- `git diff --check` — **passed** before staging the 20 owned production/test files.

Local construction corrections: newly added lines were Ruff-formatted; a test's denied marker had also been deliberately written into the still-authorized live path description, so the baseline repair fixture now clears that description before asserting absence of inaccessible historical content; Testing Library role queries had two unsupported `exact` options, removed after TypeScript caught them. Focused tests and required gates passed after those corrections. The frontend complete suite passed before the final type-only query-option correction; its affected full-flow test passed again afterward.

## Handoff limits

No remaining deterministic R1 failure is known in this package. Root owns exact-head browser CI and actual CUA recovery of its already charged hidden build plus a fresh recovered workflow. Those checks are pending from this worker's perspective. There is no new claim about live Anvil/BYOK availability, external billing, public deployment or distributed storage guarantees. No additional memory/network request was made in this focused follow-up, respecting its explicit no-live-network instruction.
