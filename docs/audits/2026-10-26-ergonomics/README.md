# Journey ergonomics review — 26 October 2026

The owner's goal is comfortable, understandable use, particularly in iOS Safari. The review follows the existing `docs/user-journeys.md` catalog. Changes preserve course, module, path, sharing and AI behavior while improving the route to those capabilities.

## Findings and implemented changes

| Journey | Friction observed | Change | Verification |
| --- | --- | --- | --- |
| Return home / STATS-01–04 | Saturated illustrated banner competed with Continue Learning; narrow stat cards squeezed labels beside icons. | Quiet greeting surface, clearer actions and stacked stat content on phones. | Rendered phone review; existing stats browser cases. |
| Browse / COURSE-04, COURSE-06 | Create Course wrapped into two lines; titles were truncated; path-reference breakdowns dominated cards. | Header stacks on phones, full wrapping titles, compact total reuse count; full ownership breakdown remains on course detail. Collection controls share one visual treatment. | Actual 390px course list; physical-coordinate touch tests in Chromium/WebKit; reuse-count regression still checks detailed counts. |
| Enter/resume / STUDY-06, SUPPORT-03 | Learners had to scroll through sharing and AI authoring details to reach modules; no primary study action. | Start learning, Continue learning or Review course links to the first unfinished module (first module for a completed course). Modules precede AI setup and sharing. Delete is separated at the bottom. | Actual completed-course Review entry; synthetic mobile Start entry; existing completion/resume suite. |
| Read / STUDY-01 | Small code toolbar controls were hard touch targets. | Larger wrapping toolbar buttons; 16px mobile form text; content remains readable without changing stored Markdown. | Existing execution/edit/rerun tests; rendered lesson inspection. |
| Flashcards / STUDY-02–03 | Activity navigation differed from other sections; flip hint described mouse clicks. | Consistent 44px activity choices in a two-column mobile arrangement; tap-aware flip hint. | Actual flashcard screen; flip, final-card persistence, ratings and filters tested synthetically. |
| Quiz / STUDY-04 | Activity choices needed clearer grouping; result actions could crowd narrow screens. | Shared activity controls and wrapping result actions. | Actual quiz answer layout; incomplete submission, scoring and retry tests. |
| Practice / STUDY-05 | Run Code wrapped awkwardly beside a redundant Code Editor label; Reset was small. | 44px Run/Reset controls, nonwrapping labels, wrapping toolbar, redundant label hidden on phones. | Actual initial finding; execution/error/reset/solution tests; final rendered practice review. |
| Create course / COURSE-01, COURSE-05 | Mobile stepper showed only numbers; Tags field could squeeze its Add button; course-type borders were harsh. | Visible step names with current-step semantics, named Difficulty/Tags fields, constrained tag input and consistent borders. | Actual creation page; manual outlines and AI outline tests. |
| Edit modules / MODULE-01–05 | Activity choices did not match the learner's navigation; practice tools were cramped. | Same responsive activity choices and improved shared code controls. | Existing Markdown, flashcard, quiz, practice, AI generation/refinement browser journeys. |
| Paths / PATH-01–05 | Long titles and reorder controls competed for width; sharing/delete distracted from courses. | Wrapping path titles, separate reorder-control row on phones, sharing and delete after the course list. | Actual path list/detail review; create, add, reorder, follow and study tests; mobile reorder/overflow regression. |
| Sharing / SHARE-01–06 | Always-open controls had previously obscured content. | Preserve collapsed disclosure and unsaved drafts; retain all permission operations. | Existing grant/revoke/visibility tests and course/path mobile disclosure tests. |
| Workspace / WORKSPACE-01–06 | Shared button changes initially caused horizontal overflow at 200% text size. | Removed the global nonwrapping button constraint; buttons remain at least 44px high and may wrap when needed. | Caught by full-suite regression; corrected 360px/200% keyboard-and-draft test passed. |
| Account / settings / AI-01–05 | Shared controls benefit from readable phone inputs and larger buttons; provider semantics must remain intact. | Shared typography/touch sizing only. | Existing login, isolation, settings, provider choice, credential removal and failure/retry cases. |

## Evidence and limits

- The 53-case full browser run passed 51 cases. Its two failures were the obsolete verbose card-count assertion and a real workspace overflow regression at 200% text size. Both were corrected; the focused eight-case run passed, including the new mobile study route in Chromium and WebKit. Raw results are retained in `initial-journey-timings.json` and `focused-journey-timings.json`; failures are not erased.
- Frontend checks passed: 212 unit/component tests, lint, production build and browser-test TypeScript checks. Existing large-bundle build warning remains.
- Actual rendered 390×844 review covered home, courses, course detail, content, flashcards, quiz, practice, course creation and path list/detail. No real course content or sharing permissions were changed. Local screenshots are retained outside the public repository because they contain the owner's course data.
- Automated fixtures exercise destructive/save actions in isolated storage. AI and delivery transports are controlled fixtures: this is not a new live Anvil, JEV or notification-provider qualification.
- Automated elapsed times include setup/assertions and are not human completion times. Physical iPhone Safari and a timed study with representative users remain unverified.
- The prior PR head's CI touch test had a search debounce race: the card could detach while the coordinate helper scrolled. The test now awaits the matching search response before tapping. No sleeps or retries were added.

## Follow-up priorities

1. Validate the final screens on the owner's physical iPhone, including the software keyboard and safe-area inset. Browser emulation cannot establish thumb comfort.
2. Observe first-time users creating a goal and selecting the next study activity. Record hesitations and actual human times before reorganizing the workspace further.
3. Consider a dedicated author-management view if users continue to find module editing controls distracting during study. This review keeps editing available and avoids a new hidden navigation model.
4. Split the large content-rendering bundle in a performance-focused change; build warnings alone do not establish real-device load time.

## Final focused validation

The final six mobile browser cases passed in 29.4 seconds across Chromium and mobile WebKit, including the search-race correction. The enhanced STUDY-06 case passed in 5.5 seconds and now uses Continue learning to reach the unfinished module, then Review course to return to the first module after completion. The primary study action waits for progress loading before choosing a destination. The latest-result table covers 55 browser scenarios, all with a passing measured result across these runs; it is not a claim of one clean 55-case run. Full CI reruns on the pushed head. Final actual desktop review also covered the course list and practice screen.
