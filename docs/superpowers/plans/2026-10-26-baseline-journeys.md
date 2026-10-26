# Complete the Existing Learning Journeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make all 40 catalogued journeys usable and protect existing content, then open one comprehensive PR with reproducible validation.

**Architecture:** Keep the existing React/FastAPI application and storage abstraction. Add shared resource access rules, explicit path-follow records, durable study events, and per-user AI preferences. Repair existing authoring and study flows without introducing the proposed AI workspace or changing the product name.

**Tech Stack:** React 19, TypeScript, TanStack Query, FastAPI, Pydantic 2, JSON/SQLite, pytest, Vitest.

**Spec:** `docs/user-journeys.md`; observed failures F01–F14 in `docs/audits/2026-10-25/README.md`. The owner's subsequent instruction authorizes implementing missing baseline functionality as well as fixing defects.

## Global Constraints

- Preserve the earlier uncommitted journey fixes, all existing user content, course IDs, and progress. Work on the existing dedicated `codex/` feature branch; include the earlier fixes in this PR.
- No renaming, relaunch, or conversational workspace redesign in this change.
- Follow the storage abstraction; never expose credentials in API responses, logs, fixtures, or git.
- Keep the current manual authoring and explicit Next/Finish completion semantics.
- Use disposable storage and synthetic accounts for tests. Never send real notification messages during validation.
- Default AI is Anvil `llm.primary`; offer other hosted models only when actually available. External provider calls require the current user's key and explicit provider selection.
- Working policies D1–D8 are adopted for this baseline as described below, with concrete tests. Whole-course live references; study/reuse permission for recipients, owner-only editing; follow separate from authorship; distinct active path-course reuse; events grouped into sessions after 30 minutes inactivity; rolling seven days; user IANA timezone (UTC default); streak yesterday remains current until today ends; explicit module completion; progress remains tied to stable module IDs.
- OpenAI/Codex means models available through the OpenAI API with the user's API key. A ChatGPT/Codex subscription is not an API credential. No subscription OAuth integration is implied.

## Review Focus

- Revocation must stop nested reads, progress, ratings, reuse, and generation without leaking inaccessible titles.
- Concurrent writes, duplicate requests, and failed replacement must preserve old data and avoid double charges/counts.
- Sign-out/account switching must remove private cached data and prevent in-flight old requests repopulating it.
- Repeated card reviews and revisiting a page must not invent mastery or study sessions.
- Invalid structured AI output, provider errors, and removed keys must preserve drafts and credits without silent fallback.

### Task 1: Make local persistence safe

**Files:** `backend/storage/json_storage.py`, `backend/storage/base.py` as needed; new `backend/tests/test_json_storage_concurrency.py`.

**Interfaces:** Preserve CRUD and batch signatures; implement the existing `transaction()` contract with rollback and consistent nested calls if needed by later services. Provide collection-safe writes across JSONStorage instances in one process and protect on-disk readers from partial JSON. Document process-level constraints.

- [ ] Write failing tests for simultaneous creates/updates/deletes and inherited batch creation: all unique documents persist and JSON parses. Test failed multi-record replacement rolls back and readers never see a truncated file.
- [ ] Run those tests and record expected failures.
- [ ] Implement synchronized read/modify/write, same-directory atomic replacement, and safe batch operations. Validate all batch inputs before mutation; do not swallow corruption or exceptions.
- [ ] Run focused tests and existing storage tests; commit only the task's files. Report any additional interface needed before dependent work.

### Task 2: Complete access, sharing, path following, and contributions

**Files:** course/path models, `backend/services/{course,module,learning_path,flashcard_rating,reference}_service.py`, new `backend/services/access_service.py` if useful, their routes, access checks in progress/generation services, frontend course/path pages and their hooks/API/types; new sharing components and focused tests.

**Interfaces:** Central `AccessService` (or a clearly documented equivalent) provides `require_course(course_id, user_id)`, `require_path(path_id, user_id)` for readable resources and owner checks. Add optional `shared_with: list[str]` IDs persisted on course/path, with an owner-only email-based grant/revoke endpoint that returns recipient identities only to the owner. Do not enumerate accounts publicly. Expose public and directly shared path discovery, `/paths/following`, POST/DELETE `/paths/{id}/follow`, and `is_following` in path detail. A path never grants implicit access to a private course. Expanded path detail includes unavailable course IDs/reasons without private metadata. Counts derive from distinct active path references, with own versus other-owner counts, rather than a drifting counter.

- [ ] Add failing API/service tests for owner, named recipient, unrelated user, anonymous, private/unlisted/public, and revoked access across nested module/progress/rating/generation reads/writes. Include public path with inaccessible course.
- [ ] Implement one consistent access policy, sharing grants/revocation, independent follow persistence, and accurate contribution aggregates. Preserve live course references and source ownership. Follow twice and duplicate course insertion are idempotent; unfollow/removal/deletion reconcile counts. Reorder validates exact membership, including duplicates.
- [ ] Add visible visibility/recipient controls, shared/public path browsing, Following versus My Paths, Follow/Unfollow, owner-only edit/remove/add/delete actions, accessible Move up/Move down controls, unavailable-reference placeholders, and labeled total/other-owner reuse counts. Course and module editors must not advertise editing for non-owners; enforce direct editor routes too.
- [ ] Add frontend tests covering sharing save/revoke, follow reload, reorder, and stale contribution invalidation. Run focused backend/frontend tests and build; commit the task files and report the final API contracts for statistics and AI tasks.

### Task 3: Make study events and personal statistics accurate

**Files:** progress/user models, progress service/routes, auth profile timezone if needed, `ModuleViewer`, `CodeSandbox`, progress hooks/API/types, Dashboard components; new progress-event regression tests.

**Interfaces:** Dashboard adds `study_sessions_week`, `selected_paths`, active/completed selected path counts, `timezone`. Keep existing response fields for compatibility. Persist meaningful append-only events with stable timestamps and user ownership. Explicit actions `read_content`, `review_flashcard`, `submit_quiz`, `practice`, `complete` qualify; passive start/page refresh does not. Group each user's consecutive meaningful actions into sessions separated by more than 30 minutes; count sessions with activity in rolling seven days. Timezones accept IANA names. Compute current/longest streak from event history. Track stable flashcard identity for distinct deck progress; repeated ratings/reviews remain events but cannot complete unreviewed cards.

- [ ] Write failing controlled-clock tests for three study days in one module, midnight/timezone boundaries, yesterday grace, retained longest streak, rolling week/session grouping, duplicate event retries, distinct-card progress, read-started courses before first completion, reused courses counted once, and followed versus authored paths. Verify denied/revoked sources do not leak into dashboard summaries.
- [ ] Implement event persistence and aggregate statistics; preserve old progress with a documented conservative migration/backfill. Add practice reporting and elapsed active study time without page-refresh credit, save/retry idempotency, and persist quiz/practice history where required by catalog D8.
- [ ] Display clearly labeled weekly study sessions, selected paths, started courses, time, and streaks. Ensure review/quiz/practice/finish updates survive navigation and remain personal. Use semantic keyboard controls for flashcard flipping and correct-answer selection.
- [ ] Run focused statistics/study tests and relevant frontend tests; commit and document exact definitions and migration limits.

### Task 4: Make AI generation reliable and expose model preferences

**Files:** new AI preference/provider models/services, `user_settings.py`, `anvil_client.py`, `ai_generation_service.py`, `ai_service.py`, generation models/routes, `course_orchestrator.py` as needed; Settings AI component/hook/API/types; `useModuleSuggestions`, module generation hooks and focused tests; `.env.example` and dependency declarations only as needed.

**Interfaces:** Authenticated `/auth/ai-preferences` GET/PUT/DELETE credential operations plus provider/model catalog and validation endpoints (final route contract documented). Responses contain provider, model, configured/masked status only, never raw keys. Encrypt stored credentials using configured stable server encryption key; development may use a protected persistent local key file, production requires explicit configuration. Provider adapters for Anvil, OpenAI, Gemini, Anthropic use official HTTP APIs, fixed endpoints, and the selected user's credentials. Snapshot provider/model per generation operation; no silent fallback. Anvil catalog from its `/models`, filtered to text routes; show unavailable selection truthfully.

- [ ] Add failing tests for user-isolated settings, key validation/replacement/deletion, masked responses/storage encryption, unavailable model, request routing for all four providers using fake HTTP transports, preference change in flight, malformed/empty/truncated generation, and exact application-credit accounting.
- [ ] Implement bounded structured output with schema validation and a bounded repair/retry policy. Split full module content/cards/quiz into manageable generation stages when necessary; generated outputs must satisfy requested counts and quiz indices. Check funds before generation, charge only once after a valid artifact, and provide idempotent retry responses; invalid/provider-failed operations do not consume credits. Ensure full-course orchestration uses the same contracts and permission checks.
- [ ] Implement preferences UI: default Anvil, real hosted catalog, external provider plus credential validation and model selection, replacement/removal, truthful status, and explicit fallback choice. Verify actual selected routes for outline, module, cards, quiz, and coaching.
- [ ] Preserve suggestion descriptions/objectives. Replace-all must stage and validate all new modules before atomic replacement; any failure leaves prior modules and drafts intact. Keep append and retry safe.
- [ ] Run focused tests/build plus one real Anvil outline → module → editable saved activities cycle using environment-managed credentials. Record durations and model, never secrets. Commit and report external live-validation limits honestly.

### Task 5: Close account, notification, admin, and accessibility gaps

**Files:** `useAuth`, AuthProvider/App guards/query setup, API client, admin page/hooks, notification model/service/Settings, affected quiz/card/toggle components; focused frontend/backend tests.

**Interfaces:** Sign-out/token identity changes cancel old queries and remove user-specific cache before new identity renders. Handle other-tab storage changes. API error extraction understands backend `{error:{code,message,details}}` and ordinary FastAPI errors. Admin guard runs before admin queries; one understandable denial, no toast loop. Phone number validates international E.164 when SMS enabled, and delivery tests use captured adapters.

- [ ] Add failing tests for A→logout→B without reload with cached/in-flight private queries, auth expiry and cross-tab logout, structured server errors, non-admin direct navigation, invalid phone preferences, disabled unconfigured delivery, toggle state announcements, and keyboard-only primary study actions/dialogs.
- [ ] Implement cache isolation and guards, useful recoverable errors, notification input/state validation and honest provider availability. Use native/radio/button semantics and accessible names throughout touched flows. Preserve saved preferences per user and no real delivery in tests.
- [ ] Run relevant tests, full frontend lint and build; fix touched-flow regressions and commit.

### Task 6: Validate all journeys and publish the comprehensive PR

**Files:** automated integration/UI journey tests and fixture helpers, new dated baseline audit/report in `docs/audits/`, catalog status updates, README links, this plan and execution ledger.

- [ ] Run full backend and frontend tests, production build, lint and whitespace checks. Run permission/concurrency/AI failure integrations with disposable storage.
- [ ] Walk all 40 journeys in the rendered app with synthetic author/learner personas, record actual timings, persistence and failures, and capture critical visible outcomes. Exercise mobile and keyboard plus the original failed cases. Use mock provider/delivery transports for external error cases; separately label live Anvil evidence. Do not label a mocked external provider as live verified.
- [ ] Update the journey catalog to current behavior and record resolved policies, implementation details, validation commands/results, and remaining external-environment limits. Retain the historical audit unchanged.
- [ ] Have an independent whole-branch review; fix material findings and rerun covering tests. Commit, push the dedicated feature branch, open one comprehensive PR and attach it to this chat. Do not merge.
