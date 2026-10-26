# User Journey Fixes Implementation Plan

**Goal:** Fix the five failures reproduced in the local browser QA and retest each journey.

**Architecture:** Keep existing FastAPI storage and React Query APIs. Persist course outlines using existing module endpoints, restore sandbox round trips, repair Python stream capture, connect learner actions to progress mutations, and align activity types across backend and frontend.

**Tech stack:** FastAPI/Pydantic, React/TypeScript, pytest, Vitest/Testing Library, browser QA.

**Spec:** The five reproducible failures in the October 25 QA conversation.

## Constraints

- Preserve existing user content and the earlier AI completion-budget fix.
- Stay on `codex/local-startup-fix`; no remote publishing is required.
- Use failing behavioral regressions before implementation; test real components with only external boundaries substituted.

## Tasks

- [x] Course outline persistence: component regressions for create and edit (rename, add, order, remove, preserve module content). Synchronize outlines through existing module APIs before navigating; report save failures and avoid duplicating partial creates.
- [x] Sandbox round trip: API regressions for create, batch create, read, update and explicit removal. Pass sandbox through service construction/parsing and allow client null removal.
- [x] Python output: run production execution code with a real-Python test adapter; verify stdout, stderr and repeated execution. Clear capture buffers without disconnecting Python streams.
- [x] Study progress: component regressions for final-card review, duplicate navigation, module changes, Finish/Next completion and failed saves. Record the final review and await completion before navigation; refresh dashboard/path/module caches.
- [x] Activity feed: API regression after a flashcard review and frontend label regression. Add the recorded event to the shared contract and renderer.
- [x] Verify: run full backend/frontend suites, production build, changed-file checks, and an independent code review. Restart the local backend and rerun create/edit, sandbox/Python, final-card/quiz/Finish, dashboard/activity and learning-path browser journeys.

## Review focus

Preserve rich module content on outline edits; handle partial saves; persist explicit sandbox removal; avoid duplicate reviews and stale module progress; keep failures visible without navigating away.

## Verification results

- Backend: 155 pytest tests passed, including six new API regressions.
- Frontend: 57 Vitest tests passed (previous baseline 41).
- Production frontend build passed; existing large-bundle warning remains.
- Live Anvil E2E: 7/7 checks passed, including real explanation and flashcard generation.
- Browser: outline create/edit/reorder, sandbox reload, inline/editor/practice Python output (5 then 7), final flashcard review, quiz scoring, Next/Finish completion, and populated activity feed verified. Original lesson shows 10/10 cards and 100% completion; learning-path progress API returns 100%.
- Independent review findings on stale caches and failed-review navigation resolved with failing-then-passing regressions. Repeated-session review progress is bounded to deck size while history is retained.
- Source whitespace checks pass. Changed-file lint still reports the pre-existing ModuleEditor set-state-in-effect error (confirmed against HEAD).
- Separate pre-existing path-card module-count display issue remains outside the five requested fixes. Mobile, image generation and notification delivery were not retested.

## Follow-up: path module counts and ModuleEditor lint

Both previously listed remaining issues are resolved. Path course cards use actual accessible module summaries, and cached path details refresh after manual, batch, outline and generated-content module creation/removal. ModuleEditor derives untouched sandbox data from the query and keeps keyed drafts for edits/explicit removal; no synchronous sandbox state copy in the hydration effect. Browser verified a one-module path card and sandbox edit/run/save/reload. Regression-first verification: 157 backend tests, 63 frontend tests, production build, focused ESLint and whitespace checks pass. Independent review finding on generated-content path invalidation resolved. Local dependency files were unreadable; npm ci restored the existing lockfile with no manifest/lock changes.
