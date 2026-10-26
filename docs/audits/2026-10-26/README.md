# Baseline repair validation — 26 October 2026

Status: in progress. This report records the repaired baseline; the 25 October audit remains historical evidence. The product rename and AI workspace overhaul are deferred.

## Method

Rendered browser checks use a disposable local backend on port 8011 and frontend on port 5174, with separate author and learner origins. Real user data is untouched. Each measured interval is an automated walkthrough wall time, including browser/tool interaction and inspection, not a benchmark of human completion speed. Interrupted runs are identified and must be retimed before release claims. API/fixture setup is distinguished from UI actions. External provider and notification tests use captured transports; live Anvil evidence is recorded separately.

## Journey acceptance ledger

A subflow passing does not mark its entire journey complete. Pending rows remain pending until all acceptance branches are checked.

| ID | Journey | Final result | Evidence / limitations |
| --- | --- | --- | --- |
| AUTH-01 | Create an account | Pending final validation | — |
| AUTH-02 | Sign in, resume a session, and sign out | Pending final validation | — |
| AUTH-03 | Respect ownership and isolate learner data | Pending final validation | — |
| COURSE-01 | Create a manual course with module outlines | Pending final validation | — |
| COURSE-02 | Maintain an existing course's outline | Pending final validation | — |
| COURSE-03 | Edit course details and delete an owned course | Pending final validation | — |
| COURSE-04 | Discover and open accessible courses | Pending final validation | — |
| COURSE-05 | Plan a course with AI assistance | Pending final validation | — |
| MODULE-01 | Write and maintain lesson content | Pending final validation | — |
| MODULE-02 | Author a flashcard deck inside a module | Pending final validation | — |
| MODULE-03 | Author a quiz and answer key | Pending final validation | — |
| MODULE-04 | Configure and remove practice | Pending final validation | — |
| MODULE-05 | Generate and refine module activities with AI | Pending final validation | — |
| STUDY-01 | Read a lesson and run embedded examples | Pending final validation | — |
| STUDY-02 | Review every flashcard, including the last | Pending final validation | — |
| STUDY-03 | Rate cards and focus on difficulty | Pending final validation | — |
| STUDY-04 | Take a quiz, learn from mistakes, and retry | Pending final validation | — |
| STUDY-05 | Practice with starter code, feedback, and a solution | Pending final validation | — |
| STUDY-06 | Complete modules and resume the course | Pending final validation | — |
| PATH-01 | Create and edit a goal-based path | Pending final validation | — |
| PATH-02 | Build a path from existing courses | Pending final validation | — |
| PATH-03 | Reorder, remove courses, and delete a path | Pending final validation | — |
| PATH-04 | Select and follow someone else's path | Pending final validation | — |
| PATH-05 | Learn through a path and keep summaries accurate | Pending final validation | — |
| SHARE-01 | Choose course visibility and let another user study it | Pending final validation | — |
| SHARE-02 | Share a course with specific people and revoke access | Pending final validation | — |
| SHARE-03 | Share a learning path inside the product | Pending final validation | — |
| SHARE-04 | Handle edits, deletion, and revoked course access in reused paths | Pending final validation | — |
| SHARE-05 | Show authors how useful their courses are | Pending final validation | — |
| STATS-01 | See how often I studied in the last week | Pending final validation | — |
| STATS-02 | Maintain current and longest study streaks | Pending final validation | — |
| STATS-03 | See courses in progress and paths I selected | Pending final validation | — |
| STATS-04 | See activity and progress that survive navigation | Pending final validation | — |
| AI-01 | Use Anvil by default without a personal key | Pending final validation | — |
| AI-02 | Choose among available Anvil models | Pending final validation | — |
| AI-03 | Bring a key and choose an external provider/model | Pending final validation | — |
| AI-04 | Replace or remove my provider credential and return to Anvil | Pending final validation | — |
| AI-05 | Handle generation errors, limits, and provider changes | Pending final validation | — |
| SUPPORT-01 | Set notification preferences | Pending final validation | — |
| SUPPORT-02 | Navigate, recover from errors, and use the app on mobile/keyboard | Pending final validation | — |

## Incremental rendered checks

See `walkthrough-log.json` for subflows, measured times, and limitations. Final screenshots and full results will be added after the remaining fixes.

## Repair evidence so far

- Module reordering stays on the course page and survives reload: [saved order](screenshots/02-module-reorder-persisted.png).
- Revoking a private course blocks the recipient lesson: [denied lesson](screenshots/03-revoked-module-denied.png). A path retains a generic [unavailable course placeholder](screenshots/04-followed-path-unavailable-course.png).
- A named recipient can render an authenticated private lesson image: [recipient image](screenshots/06-protected-image-recipient.png). Subsequent revocation returned 404 for both recipient and anonymous image requests; the owner still received 200 with Cache-Control: no-store.
- Before the statistics repair, following a path did not produce selected-path statistics or recommendations: [pre-fix dashboard](screenshots/07-before-followed-path-metrics.png). This is recorded as a failure, not a passing acceptance result.

- Actual Python browser execution now stops an infinite loop at the five-second execution limit ([timeout](screenshots/09-python-worker-timeout.png)) and runs normally afterward ([recovery](screenshots/10-python-worker-recovered.png)). Startup adds roughly half a second in this run.
- A followed path now produces [selection statistics and recommended lessons](screenshots/11-selected-path-dashboard.png) before studying. Passive reloads add no sessions; an explicit read produces [one session, started course, and streak](screenshots/12-meaningful-study-statistics.png).
- Completed modules produce a [completed selected path](screenshots/13-completed-selected-path.png). The screenshot also records an incorrect empty-state sentence, reported for repair. Revoking one course reduces the path to [50% with a redacted unavailable reference](screenshots/14-revoked-path-progress.png) while retaining historical study totals.

- The final Task 3 build repairs that empty-state sentence: [completed dashboard guidance](screenshots/15-completed-dashboard-guidance.png). Practice removal also persists across Save and reload; re-enabling and saving restores the configured exercise.

- Controlled dated events for one module show [four weekly sessions, current streak one, longest three](screenshots/17-history-based-statistics.png). The same screen exposes a missing Continue Learning recommendation for a directly studied course; repair pending.
- Switching synthetic accounts without reload reproduces [stale private dashboard data](screenshots/16-account-switch-cache-leak-before-fix.png); account-cache repair remains pending.

- Directly studied courses now appear in [Continue Learning](screenshots/18-direct-course-resume-fixed.png), and the recommendation opens the correct lesson. A repeated card encounter records a second review event while [unique deck progress stays at one of two](screenshots/19-repeated-card-distinct-progress.png).

- Negative authoring checks reproduced [silent partial-card removal](screenshots/20-incomplete-card-silently-discarded.png) and [acceptance of blank quiz options](screenshots/21-invalid-quiz-accepted.png); explicit validation/draft-preservation repairs are planned.
- Course Save during a stopped local API retained the draft and showed failure; after restart, retry and reload [preserved the outline edit without duplicates](screenshots/22-course-save-retry-persisted.png).

- Hosted model selection survives reload ([secondary selected](screenshots/23-hosted-model-selection.png)). Initial live generation returned503 during concurrent model benchmarking/restoration; the draft and100-credit balance remained intact. Live retry follows restoration.
- With external HTTP explicitly mocked, [BYOK preferences persist masked](screenshots/25-mocked-byok-saved.png), outline→one module→two cards/two questions→manual refinement [saves and reloads](screenshots/26-mocked-generation-editable-saved.png), and [credential removal does not silently fall back](screenshots/28-provider-key-removal-no-fallback.png). These are mocked-provider UI results, not live external-vendor validation.
- Closing the generated-card dialog incorrectly [appended cards](screenshots/27-ai-card-dialog-close-appends-before-fix.png); reported for repair and browser retest.

- After restoration, real Anvil primary returned [eight coherent outlines](screenshots/29-live-anvil-outline.png). A full module retry saved a complete lesson, two flashcards and [two quiz questions](screenshots/30-live-anvil-quiz-saved.png); an author note persisted after Save/reload. First module attempt failed safely; its precise output failure cause was not captured. Successful stage times were22.548s content,1.988s cards,5.193s quiz, all finish_reason=stop. Only the successful outline/module charged10+25 local application credits (100→65); failed attempts charged zero.

- Generated-card dialog repair now passes actual UI checks: [Close/Escape preserve the two-card deck](screenshots/31-generated-card-dismissal-fixed.png) through Save/reload, explicit Append saves17 cards, and explicit Replace saves15. External HTTP was mocked for these checks.

- Atomic replacement UI check: injected mocked-provider503 after lesson generation [retained both saved modules and the selection draft](screenshots/32-ai-replacement-failure-preserves-draft.png). Explicit retry, Save and reload produced exactly one selected module with two cards/two questions. This intentionally replaced the disposable AI course content; prior live-generation screenshots remain evidence of that earlier run.

- Personal extra quiz generation survives reload: [12 learner questions and saved prior attempt](screenshots/33-personal-extra-quiz-persisted.png), while the authored module editor still contains only its original two questions. Gemini and Claude selection/credential validation/generation also passed rendered checks with external HTTP mocked; Anvil primary was explicitly restored afterward.

- Optional-activity fixture exposed two additional repair targets: cards/quiz/practice-only lessons [open an empty Content tab with a read-credit action](screenshots/34-empty-content-tab-before-fix.png), and a fresh practice module [clears first-run output after saving history](screenshots/35-first-practice-output-reset-before-fix.png). A second run displays5 correctly. These are recorded failures pending Task5 repair.

- Task5 frontend checkpoint: [account switching now isolates private data](screenshots/36-account-switch-cache-isolated.png) without reload; cross-tab sign-out redirects the other tab and Back stays signed out. Invalid login shows Invalid credentials; valid login survives reload. [Non-admin navigation has one clear denial and recovery link](screenshots/37-nonadmin-guard.png).
- [Partial flashcards retain drafts with explicit errors](screenshots/38-incomplete-card-validation-fixed.png). [Blank quiz options are rejected](screenshots/39-quiz-validation-fixed.png); removing earlier options remaps the answer key, removing the correct option requires reselection, and repaired questions save/reload.
- Optional activities now open their available tab and omit absent reading controls. Fully empty outlines have truthful guidance. [Fresh practice output stays visible alongside its first saved run](screenshots/40-first-practice-output-fixed.png).

- Notification retest confirms [unconfigured delivery is explicit and preferences persist](screenshots/41-notifications-unavailable-and-saved.png), including E.164 validation. Local capture-only adapters exercised [success and failure feedback](screenshots/42-captured-notification-feedback.png) for email/SMS; no real messages were sent.
- A transient API outage during session resume now shows a [private-content gate with Retry session](screenshots/43-session-outage-retry-gate.png). Restarting the test API and retrying restores the same account without entering credentials.
- Registration partial-success test created one synthetic account, then interrupted automatic sign-in: [the screen still presents a generic failure and Create account](screenshots/44-registration-partial-success-before-fix.png). Clear sign-in recovery is being repaired. Duplicate email already reports a useful error.
