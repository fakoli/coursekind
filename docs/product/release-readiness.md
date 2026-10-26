# Coursekind local v1 release readiness

Production candidate: **4868fd2**, 26 October 2026. Independent aggregate review and both scoped repairs are approved with no remaining identified findings. Actual UI acceptance is complete. Exact-production-head [CI40363622442](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40363622442) passed all 49 browser cases with zero retries in 7.7 minutes, 536 backend tests, 211 frontend tests and Node22/24 lint/build checks. The local-v1 completion gate is satisfied. PR #23 remains a draft; no merge or public deployment occurred.

Coursekind turns a goal into a course you can keep improving. The display name changed while existing routes, storage identities, course/module IDs and user data remain compatible. Anvil `llm.primary` remains the default.

## Delivered requirements

| User need | Delivered behavior and acceptance |
| --- | --- |
| Courses, modules and study activities | Manual course/module editing, lesson content, flashcards, quizzes and configured Python/JavaScript practice; repaired save/retry/completion flows and stable learner records. |
| Learning paths and sharing | Ordered whole-course references, current-access checks, visibility/named recipients, original authorship, reuse counts and live module/progress summaries. Sharing a path never grants private source access. |
| Personal learning statistics | Account-scoped activity, timezone-aware streaks, courses in progress and followed paths; generation does not fabricate learning activity. |
| Model choice and accounting | Anvil default plus OpenAI/Gemini/Anthropic API keys; explicit provider/model selection, no fallback, local quota accounting and clear selected retry costs. |
| One workspace for new or existing material | Private goal briefs, existing-course/path entry, editable defaults, archive/restore, compact persistent sections and mobile/keyboard access. |
| AI-first planning and building | Structured course/path plans, explicit source reuse, manual refinement, bounded lesson/card/quiz drafts, separate Review and Apply, persisted jobs and explicit recovery. |
| Safe revisions | Scoped typed changes, readable comparisons, conflict detection, immutable history and compensating restore that preserves study records. |
| Recovery across source changes | Live path membership and per-record authorized discovery; unavailable history counts never hide a valid new draft or reveal revoked material. |
| JEV integration | Explicit advisory probabilities for answer support, ambiguity and objective alignment using a selected objective, lesson excerpt and quiz item; no score or completion effect. |
| Local operation | Locked backend dependencies, setup/backup/restore/rollback guide, single-process bounds, safe errors, feature gates and bounded live smoke helper. |

All 40 original active browser journeys remain, with nine additional workspace cases covering six journey groups. The latest local suites pass **536 backend tests and 211 frontend tests**, plus lint, build, browser type checking and scoped Ruff. The exact final production run passed all 49 browser cases with zero retries; its timing artifact is committed in the product audit.

Actual UI evidence includes goal-only entry through study-ready material in 59.5 seconds, partial build retry, revisions and preserved quiz history, real Chrome 200% zoom, 360px navigation, keyboard focus, delayed old-account-response rejection, quota rejection before inference, and recovered drafts after source revocation. Timings include observation/tool overhead and are not model latency benchmarks. See the [43-observation product walkthrough](../audits/2026-10-26-coursekind/walkthrough-summary.md) and [baseline audit](../audits/2026-10-26/README.md); historical failures remain visible beside their fixes.

The normal local app now runs `4868fd2` at http://127.0.0.1:5173/workspaces. Its existing session, Anvil selection and 25-credit balance were retained. A stopped-process private backup preceded the update, and all 8 original data files were byte-identical after startup. The disposable test instance and synthetic data are separate.

## External qualification and deliberate limits

- The live three-dimension JEV feature check passed. Probabilities are advisory and educational accuracy remains uncalibrated.
- The last live Anvil plan attempt returned HTTP 503 in 1.05 seconds, with zero application debit and no fallback/retry. Earlier failures are retained. Live Anvil goal-to-study qualification remains unavailable during model maintenance; deterministic UI/provider tests do not convert that into a pass.
- External BYOK adapters are qualified with mocked HTTP, not real vendor entitlement/billing/teaching-quality certification. The Codex CLI subscription prototype was removed after failed isolation qualification; OpenAI API-key support is distinct from subscription access. Supported isolated OAuth remains follow-up work.
- Local application credits are accounting/quota units, not money. A plan plus first module requires 35 Anvil credits; the normal account currently has 25. Manual work is free; quota changes remain an explicit operator decision.
- JSON and SQLite are supported single-process modes. Distributed execution, multi-file JSON power-loss atomicity and public-scale guarantees are not claimed.
- Public deployment, repository/domain renaming, trademark/legal clearance, production notification delivery and adoption validation were not performed.
- Collaboration/groups, per-module path composition, AI-generated practice projects, arbitrary shell tools, ingestion/RAG and exam-grade assessment remain outside local v1.
- Inherited bundle-size and dependency maintenance debt remains documented; no zero-vulnerability or comprehensive pentest claim is made.

See the [operating guide](coursekind-local-v1.md), [autonomous decisions](implementation-decisions.md), [aggregate review](../audits/2026-10-26-coursekind/aggregate-review.md) and [final scoped approval](../audits/2026-10-26-coursekind/discovery-fix-review.md).
