# Coursekind whole-branch adversarial review

Reviewed fixed package `review-9703fe7..4744158.diff`, base `9703fe7ab4f8b6be91c5e3aeed5397fbab9da8a7`, head `4744158d05c1a1f07b20c4e2ca2fd45152ab4f39`, 26 October 2026. Read-only review; no production edits, browser sessions, subagents, fresh Git diffs, or broad test reruns. All findings are collected below.

**Ready to merge: no.** Five important issues remain. No critical issue identified in the reviewed scope. The core implementation is substantial and coherent, but passing individual journeys does not cover these transitions between them. Resolve the issues and run the corresponding narrow regressions before the final acceptance gate.

## Important findings

### R1 — P2: Path revisions leave the workspace attached to obsolete courses

**Location:** `backend/services/workspace_change_service.py:225–228`; related `backend/services/workspace_service.py:79–95`, `backend/services/workspace_context.py:43–46`.

Applying `course_ids` changes only the learning path. `Workspace.course_ids` remains the list captured at initial creation; reopening that path returns the same existing workspace without reconciliation. Build/revision/review selection consequently keeps the old courses and does not acquire a newly referenced owned course. More seriously, removing course A from the path and subsequently deleting/revoking A leaves otherwise valid work on the current path blocked because `WorkspaceContext.workspace()` still requires access to A. This also arises after baseline path editing, so fixing only the workspace patch writer is insufficient.

**Reproduced:** Disposable JSONStorage, owned A and B, path `[A]`, workspace opened from it, valid manual workspace change to `[B]`, Apply. The live path was `[B]`; both Get workspace and Open in workspace retained `[A]`. Deleting A then made `WorkspaceContext.workspace()` fail with 404 although the current path and B remained accessible. No provider was called.

**Additional root observation:** Revoking a still-referenced foreign course hides its title and disables the entire workspace activity area, including owned-course operations. That is fail-closed coupling rather than a privacy leak. Blocking retained derived outputs is justified; the actionable defect is that even removing the inaccessible source through the baseline path editor cannot recover this workspace while its static `course_ids` still retains that source. A clear repair path should accompany the conservative access policy.

**Fix:** Define current path-linked workspace membership from the live path, or synchronize it for all path mutation entry points and reopen/read behavior. Separate current editable links from retained historical provenance: do not weaken historical proposal/source access checks to solve this. Cover add/remove/restore and baseline path edits, with a removed source later revoked/deleted.

### R2 — P2: Workspace apply/restore leaves learner progress and ratings caches fresh

**Location:** `frontend/src/hooks/useWorkspaceActivity.ts:49–57`.

The shared refresh invalidates courses/modules/paths and workspace records but omits `['progress']` and `['flashcard-ratings']`. Those queries share the app's five-minute freshness window. Applying an additive plan to a previously completed course can therefore show the new module alongside cached 100% completion and stale Continue Learning/path summaries. Replacing/restoring a deck can retain cached index-based ratings: ModuleViewer derives its rating/filter map from the cached index, so a newly identified replacement card can visibly inherit the old card's Easy/Hard classification until refetch, despite correct server-side identity handling. This violates D5/D8 and the explicit requirement to revisit warmed views after edits.

**Reproduced:** A focused rendered-hook test seeded fresh course-progress and flashcard-rating queries, called the actual `useWorkspaceActivity().refresh()`, and confirmed both remained `isInvalidated === false`. The production cache keys and ModuleViewer consumers establish the visible consequence.

**Fix:** Invalidate affected learner projection and rating query families on plan apply, content apply, and restore. Test a warmed completed course followed by additive plan apply and a warmed rated deck followed by card replacement/restore; navigate back without a hard reload.

### R3 — P2: Applying a plan makes the mounted brief editor stale against its own action

**Location:** `frontend/src/components/workspace/WorkspaceBriefEditor.tsx:24–35`; related `backend/services/workspace_plan_service.py:256–258`.

The editor captures its version at mount and advances it only after its own brief save, reload, or a confirmed archive response. Applying a plan increments the workspace version but leaves this editor mounted with the old version. After the normal first-plan flow, reopening Brief, editing the goal, and saving therefore sends the old `expected_version` and receives a false conflict even with no competing author/tab. Recovery asks the user to reload, explicitly replacing the unsaved text. The archive/restore version repair does not cover this equally normal workspace mutation.

**Reproduced:** A focused rendered component test mounted version 1, rerendered the same editor with version 2 and new linked-course IDs (the plan-apply result), edited the learning goal, and clicked Save brief. The actual mutation payload still contained `expected_version: 1`.

**Fix:** Advance the brief's baseline for a confirmed local plan application when the saved brief matches, preserving any unsaved brief draft. Keep real concurrent brief edits conflicting. Cover both clean and dirty briefs through Apply and a competing external brief save.

### R4 — P2: Selected-step retry does not disclose the actual next provider/model or debit

**Location:** `frontend/src/components/workspace/WorkspaceJobs.tsx:131–138`.

Retry submits immediately after a generic “current provider selection” warning. The displayed job/step labels describe the prior attempt; the retry control neither resolves and names the new selection nor computes the application credits for the selected steps. After changing Settings, a failed Anvil job can still be shown as Anvil while this action sends another request to a billed external provider; a failed BYOK job can instead retry against Anvil credits without showing the new selected debit. Other generation/regeneration controls already name provider/model and cost. The plan explicitly requires a new visibly selected snapshot on retry, and its recovery flow should be at least as clear as initial generation.

**Evidence:** Code inspection of the retry UI and backend retry selection. The backend correctly snapshots current preferences for new inference; finalize-only steps correctly retain saved output and the original operation. The generic copy acknowledges this distinction but does not show which selected steps fall into which case.

**Fix:** Show the effective provider/model, selected-step cost and current quota before retry; distinguish saved-output finalization from new inference. Keep the unknown-external-charge warning. Add a rendered regression for changing provider between failure and retry and for finalize-only retry without current credentials.

### R5 — P2: Preparing a new manual path proposal loses its return-focus target

**Location:** `frontend/src/components/workspace/RevisionPanel.tsx:58–60`, `:332–334`, `:384`.

`openReview` captures `document.activeElement` only after the asynchronous manual-change request completes. The preparation button has passed through a pending/disabled state by then, so the focused element can already be the body. Dismiss consequently cannot return focus to the initiating control. The repaired saved-manual-proposal button is synchronous and does work; it does not exercise this new-proposal path.

**Evidence supplied by root at the same fixed head:** Actual CUA reproduced “Review path changes · free” → focused Draft review → Dismiss returning to AXWebArea/body, both with an accessibility click and keyboard Return. The original trigger was enabled again after preparation. Opening an existing saved manual change correctly restored focus. This reviewer did not launch a browser.

**Fix:** Capture the initiating button before the await/pending transition and pass/preserve that explicit focus target until dismissal. Add a test for creating the manual proposal, not just reopening its saved row, and repeat the root keyboard check.

## Strengths and verification

The implementation uses explicit typed proposal/apply boundaries, current-access checks, transactional receipts/debits, staged-output recovery, bounded inference concurrency, conflict fingerprints, and compensating history. Restore preserves learner records and stable identities instead of rewriting progress. Jev remains explicit and advisory, with bounded source selection, validated probabilities and staleness markers. The baseline access/media/account-switch repairs and the separation of deterministic evidence from live qualification are valuable.

This review independently ran only the disposable R1 service reproduction and two focused Vitest reproduction tests in `/tmp/coursekind-aggregate-focused/`. The latter finished 2/2 with exit 0 using Node 24; they assert the current bugs, not desired fixed behavior. Initial temporary-harness setup failures were corrected and are not product-test failures. No production code or repository test was changed.

Root reported at this exact head: CI run **40354633764** green, **49 browser cases with zero retries**, **522 backend tests**, **200 frontend tests**, Node 22/24 lint/build and locked installs; browser job 7.8 minutes. Root also reports actual Chrome 200% zoom/section access, delayed old-account-response privacy and low-quota rejection-before-provider evidence. These are root-supplied acceptance results, not suites or UI sessions rerun by this reviewer. They do not cover R1–R5.

Latest bounded live Anvil plan remains **HTTP 503 in 1.05 seconds, zero application debit, no fallback or automatic retry**. That is an availability qualification limit, not a successful live goal-to-study loop. The feature's live synthetic Jev check passed separately. Supported BYOK adapters are qualified by mocked HTTP, not real vendor billing/availability.

## Coverage and declined judgments

The package was read in bounded passes without re-deriving the Git diff. Reviewed changed production backend routes/models/services/storage and frontend APIs/hooks/components/pages/types/runtime execution, plus scripts, CI/configuration, the design/plan, baseline journeys/D1–D8, implementation decisions, progress ledger and operating/release notes. Test changes received a test-name/assertion-contract pass and selected fixture/body inspection; this is not a claim that every test helper, fixture literal, assertion continuation or deleted-only test line was audited exhaustively. Production additions and relevant context were prioritized; deleted-only historical implementations were not reconstructed as a second codebase.

- **Declined to judge — exhaustive test-fixture correctness:** Backend test bodies and frontend unit/browser fixtures beyond the contract pass and selected bodies were not all read line by line. Root's exact-head execution provides additional evidence, but neither it nor this review proves every assertion covers its named requirement. The cross-flow gaps found here are concrete findings, not excluded behavior.
- **Declined to judge — generated dependency detail:** `backend/uv.lock` and `frontend/package-lock.json` transitive entries, hashes and resolved package contents were not exhaustively audited. Manifests/locked-install configuration were read. No zero-vulnerability or supply-chain certification follows.
- **Declined to judge — raw historical evidence detail:** Binary screenshots, raw walkthrough/normalized logs, CSV timings, CI timing JSON, audit capture text and historical per-run reports under `docs/audits/` were not exhaustively revalidated. Product/operating summaries and supplied exact-head acceptance updates were used with attribution; historical timings were not promoted to final passes.
- **Declined to judge — provider availability, factual teaching quality and billing:** The latest Anvil failure limits live qualification. No real OpenAI/Gemini/Anthropic billing/quality entitlement test was run. Jev probabilities are not calibrated educational correctness and do not certify lesson facts.
- **Declined to judge — deployment and operations outside local v1:** No public deployment, domain/trademark/legal clearance, real notification delivery/scheduling, OAuth/subscription integration or adoption outcome was assessed. The retired Codex CLI path remains deferred after failed isolation; API-key OpenAI support is distinct.
- **Declined to judge — distributed/crash/scale guarantees:** JSON/SQLite are single-process application modes. Multi-process/distributed execution, multi-file JSON power-loss atomicity, hostile load/DoS and large-library scaling are not certified.
- **Declined to judge — inherited adjacent product scope:** Per-module path composition, collaboration/groups, new practice types, exam-grade grading/proctoring, arbitrary lesson ingestion/RAG, reconstruction of missing historical activity, automated legacy SVG conversion and a replacement server image downloader remain explicitly excluded by adopted decisions.
- **Declined to judge — general inherited concurrency/pentest:** Combined baseline course-metadata/outline atomicity and general collaborative module concurrency retain their recorded deferral; this does not exclude the new workspace transaction guarantees, which were reviewed. No comprehensive pentest of every inherited endpoint/deployment surface was performed.
- **Declined to judge — exhaustive device/accessibility certification:** No independent browser was launched here. Root's bounded actual UI and CI evidence does not certify all physical devices, browsers or assistive technologies. The concrete R5 keyboard-focus failure is included despite that broader limit.

## Verdict

**Changes requested; not ready to merge at `4744158`.** The five findings are repairable within the authorized local-v1 scope. Keep the live Anvil availability limitation explicit even after the deterministic regressions and focused UI checks pass. No merge or public deployment is implied by this review.
