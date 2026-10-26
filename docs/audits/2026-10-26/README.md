# Baseline repair validation — 26 October 2026

The repaired baseline has 40 named durable browser scenarios and 69 recorded real rendered subflows. This checkpoint **does not certify all 40 journeys as fully passed**: local unit/integration suites passed; the new Chromium suite is undergoing its first CI execution. Final CI results and independent whole-branch review remain release gates. The [25 October audit](../2026-10-25/README.md) remains unchanged.

## Evidence and timing method

- [Original walkthrough log](walkthrough-log.json): all 69 source records preserved, including early failures and interrupted/unmeasured intervals. Existing first 65 records are unchanged; the final four append the coordinator's actual UI evidence.
- [Normalized evidence](walkthrough-normalized.json) and [subflow timings CSV](subflow-timings.csv): stable zero-based record indices, journey IDs, observed outcome, duration in seconds and explicit later retests. Each normalized record embeds its original source object. Seventeen intervals remain null; they are never treated as zero or pass. Rebuild with `python3 scripts/normalize-journey-audit.py`.
- Manual checks used separate synthetic author/learner identities on an isolated backend/front end, ports 8011/5174. Times include orchestration, diagnosis, inspection and fixture interruptions; they are neither human benchmarks nor whole-journey completion times. Do not add overlapping subflow times together.
- [Browser acceptance implementation](../../../frontend/e2e/README.md): real routes, authentication, storage and UI interactions; isolated temporary storage on 8018/4178, unique synthetic accounts, no normal-instance data or secrets. Each test gets a fresh browser context. A serial worker controls deterministic backend clock/failures.
- Browser provider traffic uses actual adapters with protocol-shaped **mocked HTTP**. Notification sends are captured; the browser preference test checks unconfigured availability. The actual Python worker is separately exercised by the manual evidence. CI executes real JavaScript workers.
- `test-results/journey-timings.json` is emitted by CI with every ID, status and measured automated wall time; unstarted tests retain null time and Not run. Failure screenshots/traces plus HTML report are uploaded as `browser-journey-evidence` for seven days. Test listing/typechecking is not a browser pass.

## Per-journey coverage and evidence

Every row has a named executable UI scenario, not a status-only assertion. “CI pending” describes execution at this documentation checkpoint, not missing implementation. Raw record references identify completed portions and their limits; full acceptance includes the companion failure/access regressions below. Timings list individual measured subflows in seconds; unmeasured runs remain visible in the normalized log.

| ID | Durable browser scenario | Real UI record indices | Measured subflow seconds | Browser result |
| --- | --- | --- | --- | --- |
| AUTH-01 | [register, inspect identity, sign out and sign in](../../../frontend/e2e/accounts-courses.spec.ts) | 0, 62 | 0: 70, 62: 16.858 | CI pending |
| AUTH-02 | [reject bad login, reload session, sign out and isolate the next user](../../../frontend/e2e/accounts-courses.spec.ts) | 30, 52, 53, 61 | 52: 8.11, 61: 19.114 | CI pending |
| AUTH-03 | [deny private deep links and author actions across accounts](../../../frontend/e2e/accounts-courses.spec.ts) | 54, 66 | 54: 16.146, 66: 41.911 | CI pending |
| COURSE-01 | [create metadata and two manual outlines then reopen each](../../../frontend/e2e/accounts-courses.spec.ts) | 1 | 1: 44 | CI pending |
| COURSE-02 | [rename, reorder, remove and add outlines without losing activities](../../../frontend/e2e/accounts-courses.spec.ts) | 14, 36 | 14: 71, 36: 27.226 | CI pending |
| COURSE-03 | [edit metadata, cancel deletion, then delete and reopen old URL](../../../frontend/e2e/accounts-courses.spec.ts) | 63 | 63: 28.859 | CI pending |
| COURSE-04 | [discover by search, difficulty and sort, recover empty results](../../../frontend/e2e/accounts-courses.spec.ts) | 37, 51 | 37: 51.292, 51: 19.61 | CI pending |
| COURSE-05 | [generate selected AI outlines, append and persist editable lessons](../../../frontend/e2e/accounts-courses.spec.ts) | 39, 41, 44, 45, 47 | 39: 252.595, 41: 51.336, 44: 63.422, 45: 191.273, 47: 30.269 | CI pending |
| MODULE-01 | [edit Markdown, preview, reject empty title and persist learner rendering](../../../frontend/e2e/modules-study.spec.ts) | 58, 65 | 65: 39.998 | CI pending |
| MODULE-02 | [add, edit, reorder and remove flashcards with saved learner order](../../../frontend/e2e/modules-study.spec.ts) | 11, 34, 55 | 11: 20, 34: 25.422, 55: 17.915 | CI pending |
| MODULE-03 | [edit quiz options and answer key then verify learner scoring](../../../frontend/e2e/modules-study.spec.ts) | 12, 35, 56 | 12: 40, 56: 61.858 | CI pending |
| MODULE-04 | [configure practice, execute, reload and explicitly remove it](../../../frontend/e2e/modules-study.spec.ts) | 13, 29 | 13: 21, 29: 12.449 | CI pending |
| MODULE-05 | [generate activities, cancel then append, refine and save](../../../frontend/e2e/modules-study.spec.ts) | 41, 42, 45, 46, 48 | 41: 51.336, 45: 191.273, 46: 31.168, 48: 9.691 | CI pending |
| STUDY-01 | [read content, run embedded code and rerun changed code](../../../frontend/e2e/modules-study.spec.ts) | 23, 50, 58, 65 | 50: 52.061, 65: 39.998 | CI pending |
| STUDY-02 | [flip and persist every card including the final card](../../../frontend/e2e/modules-study.spec.ts) | 20, 33, 50 | 20: 117, 33: 45.97, 50: 52.061 | CI pending |
| STUDY-03 | [rate cards, filter and retain personal ratings](../../../frontend/e2e/modules-study.spec.ts) | 21, 33 | 33: 45.97 | CI pending |
| STUDY-04 | [incomplete quiz is blocked, score 50%, retry and persist 100%](../../../frontend/e2e/modules-study.spec.ts) | 24, 48, 50, 68 | 24: 28, 48: 9.691, 50: 52.061, 68: 48.517 | CI pending |
| STUDY-05 | [practice output, errors, timeout, reset, solution and saved code](../../../frontend/e2e/modules-study.spec.ts) | 18, 22, 50, 57 | 22: 40, 50: 52.061, 57: 8.419 | CI pending |
| STUDY-06 | [complete first module, resume, finish and reload 100% course](../../../frontend/e2e/modules-study.spec.ts) | 25, 32 | 25: 140 | CI pending |
| PATH-01 | [create a goal, edit its details and reload the empty path](../../../frontend/e2e/paths-sharing.spec.ts) | 3 | 3: 50 | CI pending |
| PATH-02 | [add owned and discovered courses as references, reject duplicate membership](../../../frontend/e2e/paths-sharing.spec.ts) | 4, 9, 67 | 4: 58, 9: 14, 67: 42.562 | CI pending |
| PATH-03 | [reorder references, cancel/remove course and cancel/delete path](../../../frontend/e2e/paths-sharing.spec.ts) | 5, 10, 15, 67 | 5: 26, 10: 15, 15: 17, 67: 42.562 | CI pending |
| PATH-04 | [discover, follow, reload selected list then unfollow without deleting](../../../frontend/e2e/paths-sharing.spec.ts) | 7 | 7: 33 | CI pending |
| PATH-05 | [study a selected multi-course path and retain weighted personal progress](../../../frontend/e2e/paths-sharing.spec.ts) | 27 | Not measured | CI pending |
| SHARE-01 | [publish, discover and study, unlist then restore private access](../../../frontend/e2e/paths-sharing.spec.ts) | 66 | 66: 41.911 | CI pending |
| SHARE-02 | [grant a named learner, deny outsider, revoke and deny bookmarked access](../../../frontend/e2e/paths-sharing.spec.ts) | 2, 8 | 8: 8 | CI pending |
| SHARE-03 | [share a path without implicitly granting its private course](../../../frontend/e2e/paths-sharing.spec.ts) | 6 | 6: 84 | CI pending |
| SHARE-04 | [source changes reach reused paths and deletion leaves unavailable reference](../../../frontend/e2e/paths-sharing.spec.ts) | 17 | 17: 34 | CI pending |
| SHARE-05 | [reuse counters reflect distinct active references and deletion decrements](../../../frontend/e2e/paths-sharing.spec.ts) | 67 | 67: 42.562 | CI pending |
| STATS-01 | [real reading sessions group by inactivity and leave rolling week](../../../frontend/e2e/stats-ai-settings.spec.ts) | 19, 31, 68 | 19: 49, 68: 48.517 | CI pending |
| STATS-02 | [same-day repeats, consecutive dates, gap and historical longest streak](../../../frontend/e2e/stats-ai-settings.spec.ts) | 26, 31 | Not measured | CI pending |
| STATS-03 | [started course and selected paths differ from ownership and completion](../../../frontend/e2e/stats-ai-settings.spec.ts) | 16, 28, 32, 68 | 68: 48.517 | CI pending |
| STATS-04 | [activity and scores survive navigation, login and account isolation](../../../frontend/e2e/stats-ai-settings.spec.ts) | 68 | 68: 48.517 | CI pending |
| AI-01 | [default Anvil needs no personal key and generated content persists](../../../frontend/e2e/stats-ai-settings.spec.ts) | 39, 44, 45 | 39: 252.595, 44: 63.422, 45: 191.273 | CI pending |
| AI-02 | [save secondary Anvil model and use it after reload without changing other users](../../../frontend/e2e/stats-ai-settings.spec.ts) | 38 | 38: 22.789 | CI pending |
| AI-03 | [validate each external provider, persist choice and generate with zero app debit](../../../frontend/e2e/stats-ai-settings.spec.ts) | 40, 41, 49 | 40: 34.866, 41: 51.336 | CI pending |
| AI-04 | [replace and remove credential, explicitly return to Anvil and generate](../../../frontend/e2e/stats-ai-settings.spec.ts) | 43, 49 | 43: 119.499 | CI pending |
| AI-05 | [unavailable and malformed generation retain draft, retry once with one debit](../../../frontend/e2e/stats-ai-settings.spec.ts) | 39, 45, 47 | 39: 252.595, 45: 191.273, 47: 30.269 | CI pending |
| SUPPORT-01 | [persist notification preferences, validate phone and report unavailable transport](../../../frontend/e2e/stats-ai-settings.spec.ts) | 59, 60 | 59: 48.414 | CI pending |
| SUPPORT-02 | [mobile navigation, keyboard tabs/dialogs and missing-route recovery](../../../frontend/e2e/stats-ai-settings.spec.ts) | 61, 64 | 61: 19.114, 64: 23.676 | CI pending |

## Negative branches and persistence contracts

These existing regression suites run with disposable storage/fake external boundaries. They complement the named browser scenarios instead of being mislabeled as browser evidence.

| Area | Backend regression files (`backend/tests/`) | Frontend regression files | Boundaries |
| --- | --- | --- | --- |
| AUTH | test_auth.py; test_account_activity_boundaries.py; test_validation_error_privacy.py | Register.test.tsx; AccountSettings.test.tsx; useAuth.test.ts | Invalid/duplicate login, partial registration recovery, stale/in-flight identity caches, cross-tab logout, JWT expiry, validation-error secret redaction, admin gate. |
| COURSE | test_journey_regressions.py; test_generation_reliability.py; test_learning_path_counts.py | CourseEditor.test.tsx | Partially failed module saves/retries, metadata/content preservation, cache invalidation and accurate module/path counts. |
| MODULE | test_module_service.py; test_account_activity_boundaries.py; test_generation_reliability.py | ModuleEditor.test.tsx; QuizQuestionItem.test.tsx | Incomplete card/quiz drafts, option removal/remapping, sandbox removal and draft preservation, AI dialog cancellation, structured output validation. |
| STUDY | test_study_events.py; test_flashcard_rating_service.py; test_progress.py | ModuleViewer.test.tsx; CodeSandbox.test.tsx; codeExecution.test.ts | Final-card pending writes, completion/quiz save failure, stable distinct-card IDs, personal draft/extra-question history, worker error/timeout recovery. |
| PATH | test_access_sharing.py; test_learning_path_service.py; test_study_events.py | SharingJourneys.test.tsx | Exact reorder membership, idempotent follows, owner-only mutations, unavailable-reference weighting and guided next-up selection. |
| SHARE | test_access_sharing.py; test_learning_path_counts.py; test_json_storage_concurrency.py | SharingJourneys.test.tsx; CourseImage.test.tsx | Nested access/revocation, media authenticated loads and cleanup, no tokens to remote image origins, aggregate reference counts and concurrent/transactional writes. |
| STATS | test_study_events.py; test_progress.py | ModuleViewer.test.tsx; TimezoneSettings.test.tsx | Controlled timezone midnight, yesterday grace, missing-day reset, 30-minute boundary, rolling-week boundary, duplicate event replay and conservative legacy history. |
| AI | test_ai_preferences.py; test_generation_reliability.py; test_validation_error_privacy.py | AIPreferences.test.tsx; ModuleEditor.test.tsx | All four provider protocols and operation routing, model/key validation, encrypted per-user credentials, in-flight snapshot, malformed/empty/truncated output, insufficient/concurrent funds, atomic replacement rollback and exact-once replay. |
| SUPPORT | test_account_activity_boundaries.py | AccountSettings.test.tsx; Accessibility.test.tsx; ModuleEditorTabs.test.tsx | E.164 validation, captured delivery success/failure, unavailable providers, semantic controls and keyboard/dialog handling. |

## Earlier failures and explicit retests

| Earlier observation | Repair/retest evidence | Current interpretation |
| --- | --- | --- |
| Following absent from personal stats (record 16; screenshot 07) | Records 19, 25, 28; screenshots [11](screenshots/11-selected-path-dashboard.png), [13](screenshots/13-completed-selected-path.png), [15](screenshots/15-completed-dashboard-guidance.png) | Following and completion summaries now separate from authorship; empty-state text repaired. |
| Stale private data after account switch (30; screenshot 16) | 52–53, [36](screenshots/36-account-switch-cache-isolated.png); auth cache/expiry tests | New identity receives its own cached state, cross-tab sign-out gates content. |
| Incomplete card silently discarded (34; screenshot 20) | 55, [38](screenshots/38-incomplete-card-validation-fixed.png) | Draft retained with explicit validation; repaired card saved/reloaded. |
| Blank quiz options/answer-index handling (35; screenshot 21) | 56, [39](screenshots/39-quiz-validation-fixed.png) | Invalid options reject save; remove/remap/reselect tested. |
| Live Anvil HTTP 503 (39; screenshot 24) | 44–45, [29](screenshots/29-live-anvil-outline.png), [30](screenshots/30-live-anvil-quiz-saved.png) | Real primary route recovered; failure stayed uncharged. Does not imply all hosted routes are live-qualified. |
| Closing generated-card dialog appended cards (42; screenshot 27) | 46, [31](screenshots/31-generated-card-dismissal-fixed.png) | Close/Escape preserve two cards; explicit Append/Replace persist. Mocked external HTTP. |
| Empty Content on activity-only modules; first practice output reset (50; screenshots 34–35) | 57–58, [40](screenshots/40-first-practice-output-fixed.png) | Available activity opens; absent read credit hidden; first saved practice output stays visible. |
| Generic failure after registration account creation (screenshot 44) | 62, [45](screenshots/45-registration-recovery-fixed.png) | Explicit account-created/sign-in recovery; no duplicate registration submission. |
| Four mobile overflows | 64: all four document/viewport widths 390; keyboard Tab/Space works | Actual geometry/actions pass; in-app screenshot compositor did not reliably mirror emulated phone dimensions. |

Additional visible persistence evidence: [manual rich lesson and runnable example](screenshots/47-manual-rich-lesson-runs.png), [private visibility denial after public/unlisted checks](screenshots/48-visibility-boundary-denied.png), [reuse counts after path deletion](screenshots/49-reuse-count-after-path-delete.png), [personal history after navigation/reload](screenshots/50-personal-history-reloaded.png), [course deletion recovery](screenshots/46-deleted-course-recovery.png).

## Live versus mocked external integrations

Real Anvil `llm.primary` generated eight coherent outlines and a saved/refined module with two cards and two quiz questions (44–45). Successful stage HTTP times were 22.548s content, 1.988s cards and 5.193s quiz. The local application balance changed 100 → 90 → 65 for the successful outline/module only; failed attempts were uncharged. The rejected first module attempt's precise output failure cause was not captured. Later intentional replacement in the disposable AI course does not invalidate the earlier screenshots, but they describe that earlier run.

OpenAI/Gemini/Anthropic validation/generation (40–43, 46–49) used mocked HTTP through real adapters. They establish UI/persistence/routing contracts, not vendor uptime, real model quality or external billing. Hosted secondary selection persisted against the live catalog (38); live secondary inference was not qualified. Text capability does not imply image generation, which is explicitly unavailable.

Notifications: records 59–60 show unavailable transports, valid saved toggles/phone, and capture-only email/SMS success/failure feedback ([41](screenshots/41-notifications-unavailable-and-saved.png), [42](screenshots/42-captured-notification-feedback.png)). No external messages were sent. Production scheduled delivery needs a configured transport and separate opt-in verification.

Python/Pyodide: real UI infinite loop timed out at 5.485s including worker startup, with subsequent fresh execution at 0.483s ([09](screenshots/09-python-worker-timeout.png), [10](screenshots/10-python-worker-recovered.png)). Embedded JavaScript also exercised changed output, syntax/runtime error and 5.010s timeout. Workers prevent UI hangs and terminate runs; they are not a network/filesystem sandbox guarantee.

## Validation checkpoint and limits

- Full backend: **272 passed**, 38.84s, Python 3.14.6 in the isolated test environment; CI also runs Python 3.12. Includes JSON/SQLite rollback/concurrency, permission boundaries and AI failure cases.
- Full frontend: **129 passed**, 30 files, 3.61s on Node 24.18.0 and 3.60s on Node 22.16.0 after dependency/security fixes. Frontend lint and production build passed. Vite still warns about chunks over 500kB.
- Browser types and collection: **40 tests in four files**, typecheck passed. Test fixture ASGI smoke passed real auth/storage plus all four mocked provider adapters. Browser run remains CI pending at this checkpoint.
- CI Node22 exposed a JSDOM Blob/undici fixture incompatibility. Response bodies now use strings and still exercise `Response.blob()`; all five protected-image regressions pass on Node22.16.0. This is a test compatibility repair, not a change to auth/image behavior.
- Full backend Ruff 0.17.2 reports 80 legacy errors; it is not represented as clean or newly gated. Frontend lint is now gated, as is the production build.
- Compatible dependency remediation reduced production advisory metadata from 14 (4 high) to 4 (0 high). [Exact versions and remaining constraints](dependency-review.md) are recorded separately; no blanket force upgrade. Shared raw HTML is now allowlist-sanitized and Mermaid is strict with protected configuration, preserving ordinary Markdown/tables/code/protected images. Malicious HTML and directive-downgrade regressions pass.
- Full 40-journey certification requires CI results and independent review. External provider uptime, real delivery, real multi-day elapsed activity, a physical mobile device and production multi-process JSON writes are not certified by these local/deterministic tests. JSON transaction isolation is one process; use SQLite for concurrent processes.

The [current catalog](../../user-journeys.md) records adopted policies D1–D8. The naming/AI workspace redesign and relaunch remain deferred follow-on work.
