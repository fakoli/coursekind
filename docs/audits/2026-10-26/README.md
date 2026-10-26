# Baseline repair validation — 26 October 2026

The repaired baseline has 40 baseline browser scenarios plus the new AI-06 subscription scenario and 77 recorded real rendered subflows. All **40 baseline browser journeys passed**, without retries, in [CI run40310163615](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40310163615) on `874d00b2533e8e50928f99d109182d38fdb86022` (6.0 minutes). Backend and both Node22/24 test, lint and build jobs also passed. Task6 implementation/specification and quality review are approved after round1 fixes. Independent Task7/whole-branch review and final 41-case CI remain pending; this is baseline verification, not a full release approval. The [25 October audit](../2026-10-25/README.md) remains unchanged.

## Evidence and timing method

- [Original walkthrough log](walkthrough-log.json): all 77 source records preserved, including early failures and interrupted/unmeasured intervals. Existing first 65 records are unchanged; later records append the coordinator's actual UI evidence, including seven subscription subflows.
- [Normalized evidence](walkthrough-normalized.json) and [subflow timings CSV](subflow-timings.csv): stable zero-based record indices, journey IDs, observed outcome, duration in seconds and explicit later retests. Each normalized record embeds its original source object. Seventeen intervals remain null; they are never treated as zero or pass. Rebuild with `python3 scripts/normalize-journey-audit.py`.
- Manual checks used separate synthetic author/learner identities on an isolated backend/front end, ports 8011/5174. Times include orchestration, diagnosis, inspection and fixture interruptions; they are neither human benchmarks nor whole-journey completion times. Do not add overlapping subflow times together.
- [Browser acceptance implementation](../../../frontend/e2e/README.md): real routes, authentication, storage and UI interactions; isolated temporary storage on 8018/4178, unique synthetic accounts, no normal-instance data or secrets. Each test gets a fresh browser context. A serial worker controls deterministic backend clock/failures.
- Browser provider traffic uses actual adapters with protocol-shaped **mocked HTTP** or an unconditional **fake Codex process boundary**. Notification sends are captured; the browser preference test checks unconfigured availability. The actual Python worker is separately exercised by the manual evidence. CI executes real JavaScript workers.
- `test-results/journey-timings.json` is emitted by CI with every ID, status and measured automated wall time; unstarted tests retain null time and Not run. Failure screenshots/traces plus HTML report are uploaded as `browser-journey-evidence` for seven days. Test listing/typechecking is not a browser pass.

## Per-journey coverage and evidence

Every row has a named executable UI scenario, not a status-only assertion. Browser results and automated seconds come from the [passing run40310163615 timing snapshot](ci-40310163615-timings.json), preserved verbatim. Automated times include fixture setup and assertions and are separate from individual manual subflows; neither is a human usability benchmark. Raw record references retain completed portions and their limits; unmeasured manual intervals remain visible in the normalized log. AI-06 was added after that run and awaits final browser CI. Acceptance also includes the companion failure/access regressions below.

| ID | Durable browser scenario | Real UI record indices | Manual subflow seconds | Browser result | Automated seconds |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | [register, inspect identity, sign out and sign in](../../../frontend/e2e/accounts-courses.spec.ts) | 0, 62 | 0: 70, 62: 16.858 | Passed | 7.410 |
| AUTH-02 | [reject bad login, reload session, sign out and isolate the next user](../../../frontend/e2e/accounts-courses.spec.ts) | 30, 52, 53, 61 | 52: 8.11, 61: 19.114 | Passed | 8.521 |
| AUTH-03 | [deny private deep links and author actions across accounts](../../../frontend/e2e/accounts-courses.spec.ts) | 54, 66 | 54: 16.146, 66: 41.911 | Passed | 10.767 |
| COURSE-01 | [create metadata and two manual outlines then reopen each](../../../frontend/e2e/accounts-courses.spec.ts) | 1 | 1: 44 | Passed | 6.930 |
| COURSE-02 | [rename, reorder, remove and add outlines without losing activities](../../../frontend/e2e/accounts-courses.spec.ts) | 14, 36 | 14: 71, 36: 27.226 | Passed | 5.939 |
| COURSE-03 | [edit metadata, cancel deletion, then delete and reopen old URL](../../../frontend/e2e/accounts-courses.spec.ts) | 63 | 63: 28.859 | Passed | 8.572 |
| COURSE-04 | [discover by search, difficulty and sort, recover empty results](../../../frontend/e2e/accounts-courses.spec.ts) | 37, 51 | 37: 51.292, 51: 19.61 | Passed | 5.780 |
| COURSE-05 | [generate selected AI outlines, append and persist editable lessons](../../../frontend/e2e/accounts-courses.spec.ts) | 39, 41, 44, 45, 47 | 39: 252.595, 41: 51.336, 44: 63.422, 45: 191.273, 47: 30.269 | Passed | 6.316 |
| MODULE-01 | [edit Markdown, preview, reject empty title and persist learner rendering](../../../frontend/e2e/modules-study.spec.ts) | 58, 65, 69 | 65: 39.998, 69: 34.467 | Passed | 7.046 |
| MODULE-02 | [add, edit, reorder and remove flashcards with saved learner order](../../../frontend/e2e/modules-study.spec.ts) | 11, 34, 55 | 11: 20, 34: 25.422, 55: 17.915 | Passed | 7.444 |
| MODULE-03 | [edit quiz options and answer key then verify learner scoring](../../../frontend/e2e/modules-study.spec.ts) | 12, 35, 56 | 12: 40, 56: 61.858 | Passed | 7.026 |
| MODULE-04 | [configure practice, execute, reload and explicitly remove it](../../../frontend/e2e/modules-study.spec.ts) | 13, 29 | 13: 21, 29: 12.449 | Passed | 6.058 |
| MODULE-05 | [generate activities, cancel then append, refine and save](../../../frontend/e2e/modules-study.spec.ts) | 41, 42, 45, 46, 48 | 41: 51.336, 45: 191.273, 46: 31.168, 48: 9.691 | Passed | 12.705 |
| STUDY-01 | [read content, run embedded code and rerun changed code](../../../frontend/e2e/modules-study.spec.ts) | 23, 50, 58, 65, 69 | 50: 52.061, 65: 39.998, 69: 34.467 | Passed | 5.440 |
| STUDY-02 | [flip and persist every card including the final card](../../../frontend/e2e/modules-study.spec.ts) | 20, 33, 50 | 20: 117, 33: 45.97, 50: 52.061 | Passed | 5.296 |
| STUDY-03 | [rate cards, filter and retain personal ratings](../../../frontend/e2e/modules-study.spec.ts) | 21, 33 | 33: 45.97 | Passed | 6.366 |
| STUDY-04 | [incomplete quiz is blocked, score 50%, retry and persist 100%](../../../frontend/e2e/modules-study.spec.ts) | 24, 48, 50, 68 | 24: 28, 48: 9.691, 50: 52.061, 68: 48.517 | Passed | 6.253 |
| STUDY-05 | [practice output, errors, timeout, reset, solution and saved code](../../../frontend/e2e/modules-study.spec.ts) | 18, 22, 50, 57 | 22: 40, 50: 52.061, 57: 8.419 | Passed | 11.751 |
| STUDY-06 | [complete first module, resume, finish and reload 100% course](../../../frontend/e2e/modules-study.spec.ts) | 25, 32 | 25: 140 | Passed | 6.865 |
| PATH-01 | [create a goal, edit its details and reload the empty path](../../../frontend/e2e/paths-sharing.spec.ts) | 3 | 3: 50 | Passed | 6.707 |
| PATH-02 | [add owned and discovered courses as references, reject duplicate membership](../../../frontend/e2e/paths-sharing.spec.ts) | 4, 9, 67 | 4: 58, 9: 14, 67: 42.562 | Passed | 8.566 |
| PATH-03 | [reorder references, cancel/remove course and cancel/delete path](../../../frontend/e2e/paths-sharing.spec.ts) | 5, 10, 15, 67 | 5: 26, 10: 15, 15: 17, 67: 42.562 | Passed | 6.264 |
| PATH-04 | [discover, follow, reload selected list then unfollow without deleting](../../../frontend/e2e/paths-sharing.spec.ts) | 7 | 7: 33 | Passed | 7.485 |
| PATH-05 | [study a selected multi-course path and retain weighted personal progress](../../../frontend/e2e/paths-sharing.spec.ts) | 27 | Not measured | Passed | 9.464 |
| SHARE-01 | [publish, discover and study, unlist then restore private access](../../../frontend/e2e/paths-sharing.spec.ts) | 66 | 66: 41.911 | Passed | 17.964 |
| SHARE-02 | [grant a named learner, deny outsider, revoke and deny bookmarked access](../../../frontend/e2e/paths-sharing.spec.ts) | 2, 8 | 8: 8 | Passed | 15.043 |
| SHARE-03 | [share a path without implicitly granting its private course](../../../frontend/e2e/paths-sharing.spec.ts) | 6 | 6: 84 | Passed | 14.218 |
| SHARE-04 | [source changes reach reused paths and deletion leaves unavailable reference](../../../frontend/e2e/paths-sharing.spec.ts) | 17 | 17: 34 | Passed | 11.437 |
| SHARE-05 | [reuse counters reflect distinct active references and deletion decrements](../../../frontend/e2e/paths-sharing.spec.ts) | 67 | 67: 42.562 | Passed | 12.293 |
| STATS-01 | [real reading sessions group by inactivity and leave rolling week](../../../frontend/e2e/stats-ai-settings.spec.ts) | 19, 31, 68 | 19: 49, 68: 48.517 | Passed | 9.543 |
| STATS-02 | [same-day repeats, consecutive dates, gap and historical longest streak](../../../frontend/e2e/stats-ai-settings.spec.ts) | 26, 31 | Not measured | Passed | 9.974 |
| STATS-03 | [started course and selected paths differ from ownership and completion](../../../frontend/e2e/stats-ai-settings.spec.ts) | 16, 28, 32, 68 | 68: 48.517 | Passed | 9.454 |
| STATS-04 | [activity and scores survive navigation, login and account isolation](../../../frontend/e2e/stats-ai-settings.spec.ts) | 68 | 68: 48.517 | Passed | 9.691 |
| AI-01 | [default Anvil needs no personal key and generated content persists](../../../frontend/e2e/stats-ai-settings.spec.ts) | 39, 44, 45 | 39: 252.595, 44: 63.422, 45: 191.273 | Passed | 6.726 |
| AI-02 | [save secondary Anvil model and use it after reload without changing other users](../../../frontend/e2e/stats-ai-settings.spec.ts) | 38 | 38: 22.789 | Passed | 8.674 |
| AI-03 | [validate each external provider, persist choice and generate with zero app debit](../../../frontend/e2e/stats-ai-settings.spec.ts) | 40, 41, 49 | 40: 34.866, 41: 51.336 | Passed | 14.072 |
| AI-04 | [replace and remove credential, explicitly return to Anvil and generate](../../../frontend/e2e/stats-ai-settings.spec.ts) | 43, 49 | 43: 119.499 | Passed | 8.573 |
| AI-05 | [unavailable and malformed generation retain draft, retry once with one debit](../../../frontend/e2e/stats-ai-settings.spec.ts) | 39, 45, 47 | 39: 252.595, 45: 191.273, 47: 30.269 | Passed | 10.577 |
| AI-06 | [account-bound local subscription checks, generates, refines and returns to Anvil](../../../frontend/e2e/stats-ai-settings.spec.ts) | 70–76 | 71: 22.812, 73: 15.753, 74: 45.316, 75: 127.285, 76: 16.885 | Pending final CI | Not run |
| SUPPORT-01 | [persist notification preferences, validate phone and report unavailable transport](../../../frontend/e2e/stats-ai-settings.spec.ts) | 59, 60 | 59: 48.414 | Passed | 6.653 |
| SUPPORT-02 | [mobile navigation, keyboard tabs/dialogs and missing-route recovery](../../../frontend/e2e/stats-ai-settings.spec.ts) | 61, 64 | 61: 19.114, 64: 23.676 | Passed | 9.357 |

The initial CI run was canceled after 14 cases timed out at required form labels, before their main UI flows. Its trace showed that exact label matching included a visual asterisk; anchored labels now allow that marker. No initial case is counted as passed. The corrected run [40307745119](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40307745119), on5dd788a, completed32passed/8failed in7.0minutes. Its [40-row timing snapshot](ci-40307745119-timings.json) is preserved verbatim. Failed IDs: COURSE04, COURSE05, MODULE03, STUDY04, STUDY05, PATH02, SHARE01, STATS04. Seven failures arose from mismatched selectors or an unscoped debounced-search action; COURSE05 exposed an invalid synthetic suggestion with one objective where the real validator requires2–4. The fixture and selectors were repaired, then all40 scenarios passed on874d00b in run40310163615. Both run snapshots remain available; earlier failures have not been erased.

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

The coordinator also verified the upgraded strict Mermaid renderer through actual UI on `20c9c59`: author edit → save → reload → lesson retained a real 135.56×162 SVG, protected image, bold/benign HTML and executable JavaScript ([51](screenshots/51-sanitized-lesson-diagram.png), record69,34.467s including coordination). This is a real rendering check; hostile HTML/directives are separately covered by security regressions and the passing MODULE01 browser scenario.

## Live versus mocked external integrations

Real Anvil `llm.primary` generated eight coherent outlines and a saved/refined module with two cards and two quiz questions (44–45). Successful stage HTTP times were 22.548s content, 1.988s cards and 5.193s quiz. The local application balance changed 100 → 90 → 65 for the successful outline/module only; failed attempts were uncharged. The rejected first module attempt's precise output failure cause was not captured. Later intentional replacement in the disposable AI course does not invalidate the earlier screenshots, but they describe that earlier run.

OpenAI/Gemini/Anthropic validation/generation (40–43, 46–49) used mocked HTTP through real adapters. They establish UI/persistence/routing contracts, not vendor uptime, real model quality or external billing. Hosted secondary selection persisted against the live catalog (38); live secondary inference was not qualified. Text capability does not imply image generation, which is explicitly unavailable.

Notifications: records 59–60 show unavailable transports, valid saved toggles/phone, and capture-only email/SMS success/failure feedback ([41](screenshots/41-notifications-unavailable-and-saved.png), [42](screenshots/42-captured-notification-feedback.png)). No external messages were sent. Production scheduled delivery needs a configured transport and separate opt-in verification.

Python/Pyodide: real UI infinite loop timed out at 5.485s including worker startup, with subsequent fresh execution at 0.483s ([09](screenshots/09-python-worker-timeout.png), [10](screenshots/10-python-worker-recovered.png)). Embedded JavaScript also exercised changed output, syntax/runtime error and 5.010s timeout. Workers prevent UI hangs and terminate runs; they are not a network/filesystem sandbox guarantee.

## Validation checkpoint and limits

- Full backend: **272 passed**, 38.84s, Python 3.14.6 in the isolated test environment; CI also runs Python 3.12. Includes JSON/SQLite rollback/concurrency, permission boundaries and AI failure cases.
- Full frontend: **129 passed**, 30 files, 3.61s on Node 24.18.0 and 3.60s on Node 22.16.0 after dependency/security fixes. Frontend lint and production build passed. Vite still warns about chunks over 500kB.
- Browser types and collection: **40 tests in four files**, typecheck passed. Test fixture ASGI smoke passed real auth/storage plus all four mocked provider adapters. All40 browser tests passed in run40310163615; automated per-test durations total355.220seconds, with6.0minutes reported for suite execution.
- CI Node22 exposed a JSDOM Blob/undici fixture incompatibility. Response bodies now use strings and still exercise `Response.blob()`; all five protected-image regressions pass on Node22.16.0. This is a test compatibility repair, not a change to auth/image behavior.
- Full backend Ruff 0.17.2 reports 80 legacy errors; it is not represented as clean or newly gated. Frontend lint is now gated, as is the production build.
- Compatible dependency remediation reduced production advisory metadata from 14 (4 high) to 4 (0 high). [Exact versions and remaining constraints](dependency-review.md) are recorded separately; no blanket force upgrade. Shared raw HTML is now allowlist-sanitized and Mermaid is strict with protected configuration, preserving ordinary Markdown/tables/code/protected images. Malicious HTML and directive-downgrade regressions pass.
- The40 baseline scenarios are verified on874d00b; independent Task7/whole-branch review and final 41-case CI remain pending. External provider uptime, real delivery, real multi-day elapsed activity, a physical mobile device and production multi-process JSON writes are not certified by these local/deterministic tests. JSON transaction isolation is one process; use SQLite for concurrent processes.

The [current catalog](../../user-journeys.md) records adopted policies D1–D8. The naming/AI workspace redesign and relaunch remain deferred follow-on work.

## Task 7 addition: local subscription

AI-06 adds a 41st deterministic browser scenario without renumbering the original 40 baseline IDs: authorized local Codex selection and inference check, outline/full-module generation with cards and quiz, manual refinement/save/reopen, zero Anvil debit, account isolation and explicit return to Anvil. This addition does not retroactively extend run40310163615's 40-case result. Its final browser execution remains pending; the coordinator completed the real subscription UI flow on disposable content.

The local adapter uses configured candidates (initially `gpt-6-luna`) rather than live app-server discovery. A temporary synthetic config probe established that `mcp_servers={}` does not clear inherited entries, and app-server rejects `--ignore-user-config`; production therefore uses only isolated `codex exec` for inference and plain read-only CLI version/login checks. Candidate presence is not model entitlement; Settings offers an explicit real inference check. See [configuration and limits](../../local-codex-subscription.md). CI replaces the process boundary unconditionally and cannot consume a real subscription. Independent Task7 and whole-branch reviews remain coordinator-owned gates.


Real `gpt-6-luna` UI evidence is preserved in records70–76. Initial login checking failed (70; 41.541s) because this CLI rejects strict-config on login; the fixed read-only status path passed the explicit inference check, save and reload (71; 22.812s; [53](screenshots/53-codex-subscription-selected.png)). The first eight-outline generation correctly failed validation (72; 53.989s): most modules had only one objective. The generation prompt now explicitly requires 2–4 objectives per module, with unchanged validation and a JSON/SQLite regression. The UI retry produced eight coherent modules with two objectives each (74; 45.316s; [54](screenshots/54-live-codex-outlines.png)).

The separate learner remained on Anvil and had no subscription option (73; 15.753s). The author then generated a dictionary lesson, two cards and two quiz questions, manually refined the lesson, saved and reopened it, and inspected the saved answer keys/explanations (75; 127.285s; [55](screenshots/55-live-codex-quiz-saved.png)). The author balance stayed65 throughout, then explicit Anvil selection/save/reload passed (76; 16.885s). These times include tool coordination and inspection; they are not pure model latency and must not be added as a benchmark. The initial failures remain in the audit.

Task7 local verification: **294 backend tests passed** (38.45s); **133 frontend tests in31 files passed** on Node24.18.0 (3.39s); full frontend lint/build, scoped changed-backend Ruff, browser types and collection of **41 scenarios in four files**, and the isolated ASGI smoke (four HTTP adapters plus subscription check/full-content/cards/quiz/zero debit) passed. Existing Vite chunk-size warnings remain. Public CI uses fake processes and does not certify subscription entitlement; the real UI flow above supplies that narrow live evidence for `gpt-6-luna` at this time.
