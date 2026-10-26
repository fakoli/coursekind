# Coursekind release readiness

Status: local v1 build in progress, 26 October 2026. This is a reviewable draft on PR #23, not a public deployment or completed launch.

Coursekind turns a learning goal into a course or path that its author can review, build, revise and study. The display name changed; repository identity, existing routes, saved course/module IDs and user data remain compatible. Anvil `llm.primary` remains the default.

## Requirements and acceptance evidence

| User need | Implementation and current evidence | Remaining acceptance |
| --- | --- | --- |
| Create individual courses with modules | Existing manual course/module flows repaired; original 40 browser journeys passed at baseline and Task1 | Final product regression run |
| Study lesson content, flashcards, quizzes and practices | Baseline content/read, immutable review/quiz retries and configured Python/JavaScript practices validated | Final continuity checks after revision/restore |
| Combine courses into learning paths | Ordered whole-course references, live counts and equal-course progress | Final regression; per-module path selection is outside this v1 |
| Share courses and paths while retaining authorship | Current-access checks, explicit visibility/recipients, reused original IDs; sharing a path does not grant private source-course access | Final regression after workspace revisions |
| Track usefulness of reused courses | Baseline reuse counts and source attribution retained | Final regression |
| Personal activity, streaks, in-progress courses and followed paths | Baseline account-scoped activity and timezone semantics validated | Final regression; no generation event should count as study |
| Choose models, default to local Anvil, optionally bring API keys | Anvil plus OpenAI/Gemini/Anthropic BYOK; explicit selection and no automatic fallback | External BYOK contract tests are mocked; subscription login remains deferred |
| Start with a goal or existing content in one workspace | Private brief, idempotent existing-material entry, reload/archive/restore, mobile creation | Passed Task1 UI/review/CI; final polish remains |
| AI plans courses/modules with less manual entry | Structured plans, manual edits, refinement, private apply, explicit course reuse | Actual first-course and mixed-reuse UI passed; corrected Task2 CI pending |
| Build study-ready material from the plan | Default one module, maximum three per batch, lesson plus requested cards/quiz, explicit review/apply | Actual build/reload/dismiss/apply/study and partial retry passed with mock provider |
| Safely revise what AI creates | Typed scoped revisions, before/after review and conflict-safe apply | Task3 in progress |
| Recover earlier content without erasing learning history | Immutable history and compensating restore | Task3 in progress |
| Complement generation with JEV | Explicit advisory review of selected objective, lesson excerpt and quiz item | Task4 pending; initial synthetic API connectivity is not feature acceptance |
| Credible product operation | Onboarding, recovery, accessibility, dependencies, backup and rollback instructions, truthful limits | Task5 and final adversarial review pending |

## Evidence boundaries

The original baseline gate passed 40 browser journeys with no retries, 306 backend tests and 145 frontend tests. Task1 then passed the same 40 browser journeys, 330 backend tests and 163 frontend tests. Task2's corrected Python 3.12 backend suite passes 383 tests. Exact commits, CI links, screenshots and observed UI timings live in the [baseline audit](../audits/2026-10-26/README.md) and [product audit](../audits/2026-10-26-coursekind/README.md).

Actual UI walkthrough timings include human/agent observation and tool overhead. They are not inference benchmarks or server latency percentiles. Deterministic provider fixtures validate application behavior, count/schema handling, retries and preservation; they do not establish live model quality.

Two explicit live Anvil plan attempts returned HTTP503 during local model maintenance. Both retained a discoverable failed job and charged zero application credits. Testing then explicitly selected mock OpenAI in the separate disposable validation account. The normal app's Anvil selection and data were unchanged. Live qualification remains open, not silently converted into a pass.

The Codex subscription CLI prototype was removed after its isolation qualification failed. The supported OpenAI option currently uses an API key; subscription access is not represented as ordinary API credit. Reintroducing it requires a supported isolated authentication/runtime integration.

## Deliberate local-v1 limits

- One application process owns job execution. JSON and SQLite transactions are tested; distributed coordination and multi-file JSON power-loss atomicity are not claimed.
- Public deployment, domain/trademark clearance, repository renaming and production notification delivery have not been performed.
- Existing practices are supported. AI-generated practice projects, arbitrary shell tools, automatic grading, source ingestion/RAG and collaboration are deferred.
- JEV results are advisory probabilities, not factual certification or learner scores. Educational calibration remains separate work.
- BYOK external billing can occur even when an application operation fails; application credits account for local Anvil usage and are not currency.
- New content remains private until the author explicitly changes sharing.

## Completion gate

Before calling the local v1 complete, finish Tasks3–5, obtain their independent reviews, resolve important findings, run the final backend/frontend and browser suites, walk the new UI journeys, update the normal local runtime to the accepted commit, and publish a final evidence report and comprehensive draft PR. No merge or public deployment is authorized by this completion gate.
