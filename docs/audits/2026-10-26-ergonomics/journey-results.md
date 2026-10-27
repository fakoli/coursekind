# Latest measured result per scenario

Automated wall time including fixtures/assertions; not human usability time. Earlier failures remain in the source JSON files.

| Browser | Scenario | Result | Seconds |
| --- | --- | --- | --- |
| chromium | AUTH-01 — register, inspect identity, sign out and sign in | passed | 3.952 |
| chromium | AUTH-02 — reject bad login, reload session, sign out and isolate the next user | passed | 4.04 |
| chromium | AUTH-03 — deny private deep links and author actions across accounts | passed | 7.34 |
| chromium | COURSE-01 — create metadata and two manual outlines then reopen each | passed | 3.415 |
| chromium | COURSE-02 — rename, reorder, remove and add outlines without losing activities | passed | 3.506 |
| chromium | COURSE-03 — edit metadata, cancel deletion, then delete and reopen old URL | passed | 5.329 |
| chromium | COURSE-04 — discover by search, difficulty and sort, recover empty results | passed | 4.239 |
| chromium | COURSE-05 — generate selected AI outlines, append and persist editable lessons | passed | 3.337 |
| chromium | SHARE-06 — mobile course and path sharing opens on demand and keeps drafts | passed | 3.838 |
| chromium | COURSE-06 — touch opens the whole course card and preserves separate actions | passed | 4.76 |
| chromium | MODULE-01 — edit Markdown, preview, reject empty title and persist learner rendering | passed | 5.431 |
| chromium | MODULE-02 — add, edit, reorder and remove flashcards with saved learner order | passed | 4.184 |
| chromium | MODULE-03 — edit quiz options and answer key then verify learner scoring | passed | 4.084 |
| chromium | MODULE-04 — configure practice, execute, reload and explicitly remove it | passed | 3.359 |
| chromium | MODULE-05 — generate activities, cancel then append, refine and save | passed | 8.838 |
| chromium | STUDY-01 — read content, run embedded code and rerun changed code | passed | 2.852 |
| chromium | STUDY-02 — flip and persist every card including the final card | passed | 3.704 |
| chromium | STUDY-03 — rate cards, filter and retain personal ratings | passed | 4.235 |
| chromium | STUDY-04 — incomplete quiz is blocked, score 50%, retry and persist 100% | passed | 4.566 |
| chromium | STUDY-05 — practice output, errors, timeout, reset, solution and saved code | passed | 9.887 |
| chromium | STUDY-06 — complete first module, resume, finish and reload 100% course | passed | 5.543 |
| chromium | PATH-01 — create a goal, edit its details and reload the empty path | passed | 6.914 |
| chromium | PATH-02 — add owned and discovered courses as references, reject duplicate membership | passed | 5.957 |
| chromium | PATH-03 — reorder references, cancel/remove course and cancel/delete path | passed | 3.324 |
| chromium | PATH-04 — discover, follow, reload selected list then unfollow without deleting | passed | 4.092 |
| chromium | PATH-05 — study a selected multi-course path and retain weighted personal progress | passed | 5.167 |
| chromium | SHARE-01 — publish, discover and study, unlist then restore private access | passed | 10.99 |
| chromium | SHARE-02 — grant a named learner, deny outsider, revoke and deny bookmarked access | passed | 9.336 |
| chromium | SHARE-03 — share a path without implicitly granting its private course | passed | 8.08 |
| chromium | SHARE-04 — source changes reach reused paths and deletion leaves unavailable reference | passed | 6.829 |
| chromium | SHARE-05 — reuse counters reflect distinct active references and deletion decrements | passed | 6.891 |
| chromium | STATS-01 — real reading sessions group by inactivity and leave rolling week | passed | 4.905 |
| chromium | STATS-02 — same-day repeats, consecutive dates, gap and historical longest streak | passed | 5.88 |
| chromium | STATS-03 — started course and selected paths differ from ownership and completion | passed | 6.023 |
| chromium | STATS-04 — activity and scores survive navigation, login and account isolation | passed | 5.672 |
| chromium | AI-01 — default Anvil needs no personal key and generated content persists | passed | 3.471 |
| chromium | AI-02 — save secondary Anvil model and use it after reload without changing other users | passed | 4.481 |
| chromium | AI-03 — validate each external provider, persist choice and generate with zero app debit | passed | 7.691 |
| chromium | AI-04 — replace and remove credential, explicitly return to Anvil and generate | passed | 4.584 |
| chromium | AI-05 — unavailable and malformed generation retain draft, retry once with one debit | passed | 8.818 |
| chromium | SUPPORT-01 — persist notification preferences, validate phone and report unavailable transport | passed | 3.553 |
| chromium | SUPPORT-02 — mobile navigation, keyboard tabs/dialogs and missing-route recovery | passed | 5.207 |
| chromium | WORKSPACE-01 — goal, reviewable plan, first draft, explicit apply and study survive reload | passed | 3.799 |
| chromium | WORKSPACE-02 — mixed new and explicitly reused courses preserve original authorship | passed | 2.872 |
| chromium | WORKSPACE-03 — partial build survives reload and explicit retry preserves the first draft | passed | 3.206 |
| chromium | WORKSPACE-06 — mobile keyboard sections preserve drafts and account switch removes private material | passed | 5.198 |
| chromium | WORKSPACE-06 — disabled workspace writes preserve baseline navigation and typed goal | passed | 3.09 |
| chromium | WORKSPACE-05 — explicit TypeSafe disclosure, cache and identical-content restore staleness | passed | 12.619 |
| chromium | WORKSPACE-05 — unavailable and malformed advisory retain material, explicit retry works | passed | 2.51 |
| chromium | WORKSPACE-04 — quiz-only revision, study, reload and restore preserve attempts and other content | passed | 4.356 |
| chromium | WORKSPACE-04 — a baseline edit in a second tab rejects stale apply and keeps the proposal | passed | 3.867 |
| mobile-webkit | SHARE-06 — mobile course and path sharing opens on demand and keeps drafts | passed | 3.919 |
| mobile-webkit | COURSE-06 — touch opens the whole course card and preserves separate actions | passed | 5.417 |
| chromium | SUPPORT-03 — mobile browsing leads directly into study with reachable activities | passed | 4.159 |
| mobile-webkit | SUPPORT-03 — mobile browsing leads directly into study with reachable activities | passed | 5.196 |
