# Consolidated final repair report

26 October 2026, MacBook. Scope: WB-01–WB-10 from `whole-branch-review.md`, governed by `final-fix-brief.md`. Implementation complete; final-head browser CI and the scoped independent rereview remain coordinator gates. No merge, runtime restart, user-data edit, actual notification, or vendor inference was performed by this implementer.

## Commits and ownership

- `fe99812`: failed study encounters retained through Finish, explicit module-refresh conflict choices, owner Follow/Unfollow; safe UI checkpoint.
- `5c1cf7a`: atomic outline reconciliation; authenticated access; validated raster media; retired Codex runtime and migration; live counts/objectives; durable negative and browser regressions.
- `d304db6`: warmed client count invalidation and further multi-failure/draft tests; legacy test policy correction.
- Final small follow-up: truthful generation cost text for a retired selection, this report. See Git history for its commit.

Coordinator-owned raw audit records, normalized/CSV evidence, screenshots, implementation decisions/review-findings documents and PR/CI were not modified or staged. Shared memory recall succeeded. No subagents were used.

## Changes by finding

**WB-01.** Removed the live Codex adapter/process boundary, configuration/enum/routing/status/validation/snapshot-user fields and subscription accounting text, executable AI-06 and fake-process fixtures/tests. Anvil remains default. A previously stored `codex_subscription` value is preserved and shown as retired; generation snapshot creation fails with an explicit Settings instruction. No catalog request, key field, implicit selection change or fallback happens for that retired choice. The user must explicitly select an available provider/model and save. No host auth/config was read or changed. Historical evidence is preserved; `docs/local-codex-subscription.md` links the manual diagnostic and its adapter together at immutable `2cd8b76`. The current diagnostic entry point only prints that historical location and cannot launch Codex. AI-06 remains catalogued as deferred. Original 40 executable IDs remain stable. The independent explicit 2–4 objectives prompt and JSON/SQLite regression remain intact.

**WB-02.** `PUT /courses/{id}/modules/outlines` compares the initial module summaries, including modification timestamps, inside a single storage transaction, then applies additions/updates/deletions and stores the idempotent result. A stale addition, deletion or edit returns 409 before any module changes; absent old IDs cannot become new empty modules. Request identity survives a lost response and a successful replay cannot duplicate modules or delete a later addition. Partial failures roll back all outline changes. All transaction work stays in the same asyncio task. Frontend retains its initial snapshot and draft; conflicts offer a latest-editor link in a new tab. Explicit generation acknowledges only module IDs created by that operation, never unfamiliar current membership. Existing lesson/card/quiz/practice data and IDs survive metadata updates. Course metadata is saved separately before outline reconciliation; on an outline conflict, course metadata may already be saved, while no module mutation occurs.

**WB-03/WB-04.** Added Pillow raster decoding/verification for supported PNG/JPEG/GIF/WebP bytes, with a 10MB cap and decompression-bomb rejection. Upload reads are bounded, and filenames/MIME labels cannot bypass validation. Uploaded and generated media routes validate legacy content before serving correct raster MIME plus nosniff/no-store/sandbox CSP. Legacy SVG/mislabeled active bytes remain on disk but return unavailable; CourseImage additionally refuses non-raster MIME before creating any blob. Trusted bundled SVG is unchanged. Server URL fetching is disabled without opening a transport; Markdown preserves remote references for ordinary browser rendering without bearer credentials. The unused URL helper also returns a validated browser reference, with no server fetch. Internal/private/IPv6/credential/redirect/oversize/non-image URL cases are denied without network. Safe raster responses, legacy preservation and blob refusal are covered.

**WB-05.** Lists/discovery/details/nested modules/media now use authenticated route dependencies; central read/discovery predicates also require identity, and filesystem fallback cannot bypass sign-in. Signed-in public/unlisted, owner/private grants and revocation continue working. Legacy tests that expected anonymous success were corrected to D2, including filesystem and path discovery.

**WB-06.** Every unsettled/failed study action is retained by encounter key with its original event request/ID. Successful later reviews cannot clear earlier failures. Finish awaits pending reviews and retries all retained unsaved actions before completion; another failure leaves the learner on the page. The alert exposes outstanding action count and retries the first retained failed action. Two-card and three-card/multiple-settled-failure regressions verify no lost encounter and unchanged retry IDs.

**WB-07.** Removed the server module-count cache. Counts derive directly from committed membership, including direct orchestrator replacements. Client create/batch/delete/generation also invalidates warmed course lists and progress totals. JSON/SQLite generated replacement, warmed service counts and warmed rendered query regressions cover this boundary.

**WB-08.** ModuleEditor uses a route-keyed draft initialized once. Changed query responses retain title/content/cards/quiz/sandbox and show explicit Reload server version / Keep my draft choices before Save. Reload discards only on the user's action; Keep preserves all local fields and acknowledges the newer baseline. A route change remounts draft state. Tests cover changed-response preservation, explicit reload, and dirty title/lesson through generation cancel/append/replace. The MODULE-01 browser case uses an actual API remote edit, clock expiry and the browser visibility refetch signal rather than query-cache injection.

**WB-09.** Owners see explicit Follow/Unfollow beside author controls. No automatic follow is added. Component and PATH-01 browser checks retain ownership/course membership through follow, reload/dashboard, unfollow and selected-count changes.

**WB-10.** The module read/update parser includes persisted objectives. Create/get/update/batch consistency is covered; summaries retain objectives as before.

## RED/GREEN evidence

- `cd backend && uv run pytest tests/test_final_review_boundaries.py -q --tb=short`: corrected regression suite RED **16 failed / 1 passed** for retired selection, unsigned access/filesystem, active/mislabeled uploads, attempted forbidden network calls, lost objectives and stale counts; GREEN **17 passed** after repair. Extended route/legacy/size cases then joined the focused/full pass.
- `cd backend && uv run pytest tests/test_outline_reconciliation.py -q --tb=short`: RED **12 failed** (missing reconciliation behavior); GREEN **12 passed**, spanning JSON/SQLite stale add/delete/edit, lost-response replay, rollback and an independent writer attempting insertion while reconciliation holds the transaction.
- Node24 frontend focused page RED: three new regressions failed for earlier-card Finish, missing owner follow and missing changed-response conflict behavior. GREEN `npm test -- --run src/pages/ModuleViewer.test.tsx src/pages/ModuleEditor.test.tsx src/pages/SharingJourneys.test.tsx`: **30 passed**. Additional multiple-failure and explicit-reload cases: **24 passed** across ModuleViewer/ModuleEditor.
- `npm test -- --run src/hooks/useModules.test.tsx`: new warmed My Courses count regressions RED **3 failed / 4 passed**; after invalidation, combined module/suggestion hooks **10 passed**.
- Focused backend media/access/module/preferences/reconciliation aggregate: **87 passed in 10.05s**. CourseEditor + CourseImage focused **16 passed**; CourseEditor + suggestions + preference migration focused **15 passed**.

Initial test-writing mistakes (incorrect CourseService argument count, fixture content labels and an async mock used for a synchronous context-manager factory) were corrected before the meaningful RED results above; they are not claimed as production defects.

## Final verification

Backend Python3.14.6 through uv/.venv; frontend Node24.18.0 via explicit PATH and `login:false`. Disposable synthetic tests only.

- `cd backend && env -u DEBUG uv run pytest tests/ -q --tb=short`: **306 passed in 43.09s**. An earlier full run identified two remaining anonymous-public-path test expectations; those were corrected, then this final run passed.
- `cd frontend && npm test`: **142 passed in 31 files**.
- `npm run lint`: **passed**.
- `npm run build`: **passed**, existing Vite >500kB chunk notices remain.
- `npm run test:e2e:types`: **passed**.
- `npm run test:e2e:list`: **40 tests in 4 files**, no local browser launch.
- `cd backend && uv run python ../frontend/e2e/smoke.py`: **PASS** for isolated auth/storage plus all four mocked HTTP provider adapters, cards and suggestions. No real Codex/provider call.
- Scoped Ruff over changed route/model/provider/media/module/access services and focused tests: **passed**. No global Ruff-clean claim; previously disclosed legacy debt remains outside this wave.
- `git diff --check`: **passed**.

The existing 4 production npm metadata advisories (0 high), legacy Ruff debt, and Vite chunk notices remain the accepted prior limitations; no dependency-major sweep was done. Pillow is the added raster-validation dependency, so deployed environments need dependency sync.

## Review boundaries / coordinator evidence

The coordinator separately reported real rendered WB-06 PASS at `fe99812` (earlier review failure survives a later success; recovery then Finish yields 2/2), and actual two-tab WB-02 conflict/preservation plus owner Follow/Unfollow dashboard counts at `5c1cf7a`. Their raw records/screenshots/timing remain the evidence source; this report does not reclassify their audit. This implementer ran no local browser automation and does not claim final browser CI or independent rereview passed. Remaining gates are that scoped rereview, final-head CI, coordinator UI audit consolidation and comprehensive PR update; no merge is authorized.
