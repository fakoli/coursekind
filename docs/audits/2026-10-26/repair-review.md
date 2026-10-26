# Final scoped repair review

26 October 2026, MacBook. Base `4743616d4361dd04693be78810cda1e2c00f967d`; final reviewed head `59d93cca253abcff51e6dcb341a9de55b1467602`. The initial requested head `d304db6878692d1f8811994d5ae2a4932933f48e` was extended by the coordinator; the incremental production change is the retired-provider GenerationCost notice. Review inputs were the packaged repair diffs, Git diff/source, `whole-branch-review.md`, `final-fix-report.md`, the adopted baseline requirements and the supplied rendered evidence. This is the requested scoped repair rereview, not a new whole-branch review.

Only this report was written. No production source, checkout state, index, HEAD, configuration or user data was changed; no subagents, provider requests, notifications or full-suite reruns were used. Coordinator-owned audit/product files visible in the working tree were excluded. Fixed-head production source was checked against the diff; later working-tree documentation is not implicitly approved.

## Strengths

- The dangerous CLI integration is actually removed, rather than merely hidden behind a UI toggle. Stored selections fail closed and require an explicit replacement; the independent objective-count prompt repair survives.
- Outline reconciliation now compares the original summaries, including modification timestamps, and mutates/replays within one storage transaction. The tests cover JSON and SQLite, stale addition/deletion/content edits, failed writes, lost-response replay and an independent concurrent writer. This closes the demonstrated destructive race with a useful conflict rather than silently accepting stale membership.
- Media changes address both direct document responses and authenticated blob rendering. Raster decoding, legacy-file preservation, correct MIME and headers, and refusal to execute any server URL fetch form a narrow, auditable repair.
- The new regressions exercise real service/storage or rendered component behavior, with additional browser cases and coordinator UI reproductions. Module count invalidation addresses both the server and warmed client queries.

## Finding disposition

| Finding | Disposition | Reviewed repair and evidence |
| --- | --- | --- |
| WB-01, CLI isolation | **Addressed by removal/defer** | Adapter, config, provider enum/routing and process fixtures are removed. `ai_preferences_service.py` preserves a stored retired selection and rejects snapshot creation; Settings performs no retired catalog request and requires explicit replacement. `GenerationCost.tsx:6` now explains unavailability. The diagnostic entry point cannot launch Codex. Historical evidence remains accurately qualified. |
| WB-02, stale outline deletion | **Addressed** | `module_service.py:214` performs atomic snapshot comparison, authorization and idempotent replay before reconciliation. CourseEditor retains its initial summaries and only acknowledges explicitly generated IDs. A stale addition/deletion/edit conflicts without mutating modules; replay cannot delete a later addition. Controller reports actual two-tab conflict/preservation PASS. |
| WB-03, active SVG | **Addressed** | `image_service.py:19` validates supported raster bytes; upload size is bounded. `uploads.py:105` also validates existing uploaded/generated files before serving, leaving rejected originals on disk. CourseImage refuses non-raster MIME before creating a blob. Harmless active/mislabeled fixtures, legacy retention and raster response tests cover the reported boundary; controller reports PNG PASS. |
| WB-04, image-import SSRF | **Addressed by disabling server fetch** | `download_external_image` always rejects without transport; Markdown processing preserves browser-rendered references. The frontend URL helper creates an HTTP(S) reference without app bearer credentials instead of calling the server downloader. Negative transport tests include loopback, link-local, IPv6 and redirect-shaped URLs. Remote image references are no longer promised to become durable local copies. |
| WB-05, anonymous access | **Addressed** | Course/path/module/media routes require CurrentUser, central read/discovery predicates require identity, and filesystem fallback is gated. Old anonymous-success expectations are corrected. Controller reports signed-out public denial and signed-in access PASS; grant/revocation coverage remains. |
| WB-06, lost earlier card review | **Original finding addressed; related new regression below** | Failed card encounters survive later successes in a keyed map, and Finish retries unsaved encounters before completion. Two- and three-card regressions assert original event IDs; controller reports blocked Finish, recovery and 2/2 completion PASS. The broadened handling of quiz failures has WB-R1 below. |
| WB-07, stale counts | **Addressed** | Server count cache removed; current committed membership supplies counts, including direct orchestrator replacements. Create/batch/delete/generation invalidate warmed course lists and progress queries. Service and rendered-query tests cover the prior stale-count route. |
| WB-08, overwritten editor draft | **Addressed** | Route-keyed ModuleEditor initializes once, retains all draft fields on a changed response, and disables Save until an explicit Reload/Keep choice. Reload is the explicit discard action. Component tests cover title/lesson/cards/quiz/sandbox, generation cancellation/append/replace and reload; browser coverage triggers a real API edit and visibility refetch. |
| WB-09, owner follow | **Addressed** | The owner exclusion is removed at `LearningPathDetail.tsx:227`; follow/unfollow remains explicit and separate from ownership. Rendered and browser checks preserve membership/ownership; controller reports dashboard selected-count 1→0 PASS. |
| WB-10, objective projection | **Addressed** | `_parse_module` includes stored objectives. Create/get/update/batch projection regression exercises the real service. |

Course metadata remains a separate save before outline reconciliation. A conflict can therefore leave metadata saved while modules remain untouched. This is disclosed in the implementation report; it does not reopen the destructive module-membership finding. The conflict explains that no modules changed and preserves the draft. This review does not claim a combined course-and-outline transaction.

## Issues

### Critical

None established in this repair diff.

### Important

### WB-R1 — P2: Editing a failed quiz attempt destroys its retry identity

- **Files:** `frontend/src/pages/ModuleViewer.tsx:306`–307, with `:84`–90 and `:356`–357.
- **Trigger:** Submit a quiz; the server commits it but the response is lost. After the failure alert appears, change an answer, then use Retry study save or Finish. The answer handler deletes `eventRequests['quiz']` while the repair now retains the failed attempt in `failedStudyActions`/`unsavedStudyActions`. Retry passes its original request to `saveAction`, which nevertheless constructs a new `event_id` and new study-time payload because the event map entry is absent.
- **Effect:** The same submitted answers are recorded as a second attempt rather than replaying the acknowledged-or-unknown first attempt. This can duplicate quiz counts and study evidence. It can also save the retained old answers after the screen has changed. Submitting another attempt uses the same `'quiz'` key and replaces the unresolved entry, so preserving several attempts requires encounter identity rather than a single action-type slot.
- **Evidence:** A network-free in-memory probe executed the actual `saveAction` function body extracted from the reviewed component, using synthetic state/mutation functions. After the exact answer-handler deletion, the Finish retry sent the same score/answers with `event-2` instead of `event-1`; the failed action then disappeared. No backend or browser state was mutated. Existing quiz tests cover an unchanged-answer retry, while new multi-failure tests cover cards; neither covers this answer-edit boundary.
- **Repair:** Keep the complete immutable request, event ID and recorded time for each unresolved quiz encounter even when the answer draft changes. Retry must use that request verbatim. Give a deliberate new submission a separate encounter key and do not let it replace an unresolved attempt. Alternatively, require resolution before allowing a new submission/edit, with a clear user flow. Add a regression that simulates server commit plus lost response, edits an answer, retries via both Retry and Finish, and verifies one original attempt/event; also verify a later explicit submission can coexist with an unresolved earlier encounter if edits remain enabled.

### Minor

No additional minor issue is required for this scoped gate. The retired-generation cost wording noticed at `d304db6` is corrected by the reviewed `59d93cc` increment.

## Verification and recommendations

Inspected the repair diff in bounded backend, frontend/state, migration/media and regression/evidence passes. `git diff --check 4743616 59d93cc` passed. The only execution probe in this rereview was the specific unanswered WB-R1 request-identity concern above; reported suites were not rerun.

Coordinator/implementer report: 306 backend tests; 142 frontend tests; frontend lint/build; browser fixture types; 40 stable executable journey IDs; isolated backend/provider smoke. Frontend tests/lint/build were repeated after the final GenerationCost notice. Those results are supplied evidence, not independently rerun results. Browser CI was starting/pending when commissioned; this report does not certify its eventual result. The former AI-06 CLI scenario is intentionally deferred, not counted as an executable pass.

Resolve WB-R1 narrowly, then verify its focused regression and the changed viewer behavior. The existing whole-branch findings do not require another broad exploration. Final-head required CI remains a coordinator gate. Deployments must sync the added Pillow dependency. The previously assessed four production npm advisories (zero high), legacy Ruff issues and Vite chunk notices retain their disclosed status; this rereview does not convert them to a clean-audit claim.

## Declined to judge

- The newly requested naming/full-product/JEV work: explicitly excluded from this baseline repair rereview by the coordinator and requiring its own scope.
- Any new dedicated OAuth/subscription integration: the current repair intentionally removes the failed CLI prototype; no replacement integration is included or certified.
- A newly qualified server-side public-image downloader: that capability is disabled; its restoration needs separate destination/redirect/content qualification.
- Automatic conversion of existing rejected SVG files to raster: files are preserved but unavailable through the application; conversion is not implemented or claimed.
- A combined atomic course-metadata-and-outline save: the repair and report explicitly retain two operations; module reconciliation and preservation are judged here.
- Server optimistic-concurrency protection for every module content update: this repair addresses refreshed-response draft erasure with explicit choices; it does not claim general collaborative editing or all races after the user chooses Keep.
- Re-execution of full backend/frontend/browser suites or independently operating the coordinator's real UI checks: prohibited by this scoped assignment; their provenance and pending CI limits are stated above.
- Reopening unchanged architecture, deployment scalability, other inherited endpoints, real vendor availability/billing, delivery infrastructure or broad security/accessibility certification: these were explicitly bounded in the original whole-branch report and did not become part of this repair.
- Audit/product documentation and screenshots still uncommitted in the shared working tree: coordinator-owned, excluded from the fixed implementation review.
- General dependency/Ruff/chunk cleanup: no new concrete failure from the repair establishes a reason to override the previous bounded debt disposition.

## Assessment

**Ready to merge? With fixes — WB-R1 remains open, and final-head CI must pass.**

All ten original findings have a concrete, appropriately scoped repair. The new generalized retry bookkeeping must preserve quiz encounter identity before the baseline can be called ready; otherwise a recoverable network failure can duplicate the very durable study evidence these repairs are intended to protect. No merge is authorized by this report.
