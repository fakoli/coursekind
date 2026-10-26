# Coursekind autonomous build report

26 October 2026 · MacBook · production code `4868fd2`

Study Buddy is now **Coursekind**: “Turn a goal into a course you can keep improving.” The local app is running at [Workspaces](http://127.0.0.1:5173/workspaces), with the existing login, data and Anvil default preserved. The active checkout is `/Users/sekoudoumbouya/code/coursekind-local-v1`; the cloud-stalled Documents checkout was left untouched.

[Draft PR #23](https://github.com/fakoli/my-ai-study-buddy/pull/23) contains the baseline repairs and product build. It has not been merged or deployed publicly. The product is a credible local v1; public relaunch operations remain a separate stage.

## What changed

- Repaired the original course/module authoring, lesson/flashcard/quiz/practice, learning-path, sharing, reuse-count, statistics and provider-selection journeys.
- Added one private workspace for starting with a goal or improving existing courses and paths. AI creates structured plans and bounded module drafts; authors review and apply them explicitly.
- Added scoped revisions, readable comparisons, conflict-safe Apply, immutable history and compensating Restore without erasing quiz attempts, ratings, progress, sharing or accounting.
- Added durable jobs, selected-step retry, safe provider errors, quota guidance and explicit provider/model/cost disclosure. Restart and unknown outcomes do not automatically repeat inference.
- Integrated **JEV** as an optional advisory check of selected objectives, lesson excerpts and quiz items. The API key stays on the backend. Review probabilities never change grades, completion or access.
- Added compact persistent sections, mobile/keyboard/zoom checks, locked backend dependencies, setup/backup/restore/rollback documentation and a bounded opt-in live smoke helper.

## Verification

Local gates: **536 backend tests, 211 frontend tests**, lint, production build, browser type checking and scoped Ruff passed. Final exact-code [CI40363622442](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40363622442) passed **all 49 browser cases with zero retries in 7.7 minutes**, all 536 backend tests, and 211 frontend tests plus lint/build on Node22/24. Local-v1 acceptance is complete.

Independent whole-branch adversarial review found five P2 transition defects. The first repair resolved warm learner caches, mounted brief versioning, effective retry disclosure and asynchronous keyboard return focus. The path-membership repair exposed a further recovery problem: one inaccessible historical job hid newly saved drafts. A narrow follow-up implemented per-record authorized discovery with unavailable-history counts. Final scoped review approved all remaining findings. Reports preserve both failed and successful checkpoints.

Actual browser evidence includes **86 baseline observations and 43 product observations**, with failures retained. Measured examples:

| Observed journey | Time | Qualification |
| --- | ---: | --- |
| Single learning goal → reviewed plan → built draft → applied study-ready module | 59.5s | Controlled provider; actual UI |
| Dirty brief through plan Apply, save, and immediate progress update | 26.217s | Actual UI; course 50%→25% after added modules |
| Warm rated deck → replacement → restore, without hard reload | 98.726s | Hard rating 1→0→1; prior study records retained |
| New manual path proposal → Dismiss returns keyboard focus | 4.36s | Actual keyboard interaction |
| Previously hidden saved draft → review/apply/reload/reopen | 20.459s | No regeneration; revoked history stayed protected |
| Fresh plan after source repair → apply/reload/reopen | 8.633s | Controlled provider; inaccessible older plan remained hidden |

Times include observation and tool overhead, not just inference latency. Untimed checks are explicitly marked rather than estimated. See the [complete itemized walkthrough](../audits/2026-10-26-coursekind/walkthrough-summary.md) and [original journey catalog](../user-journeys.md).

## Challenges resolved

The cloud-backed checkout began returning dataless placeholders and stalled reads, so work recovered from the pushed branch into a nonsynced checkout with protected runtime/data restored separately. A Python3.12 annotation import incompatibility was fixed and covered. Reviews found and repaired stale editor versions, omitted visual comparisons, stale JEV selections, warm study caches, keyboard-focus loss and cross-flow source-access recovery. The charged-but-hidden-draft finding warranted a documented exception to the usual one-wave final-review cap; hiding paid work would violate the requested durable baseline.

The normal runtime update used a stopped-process private backup. All 8 original data files remained byte-identical after startup, and the existing session, Anvil `llm.primary` and 25-credit balance were verified in the UI. No generation or real notification was triggered on that normal account. Disposable test services and tabs were stopped/closed; their private fixtures remain available for investigation.

## Honest limits and follow-up

- Live JEV feature qualification passed. Its probabilities are advisory and not calibrated educational certification.
- The last live Anvil attempt returned HTTP 503 in 1.05s, with zero application debit and no fallback/retry. A live Anvil goal-to-study run still needs a healthy model endpoint after maintenance. Mocked provider tests validate application behavior, not model quality or uptime.
- OpenAI/Gemini/Anthropic BYOK adapters are tested against mocked HTTP. Codex subscription access is deferred: the CLI prototype failed isolation qualification and was removed. API-key OpenAI support is a separate option.
- Local Anvil credits are usage/accounting quotas. The normal account has 25; a new plan plus first module costs 35. Manual authoring remains free. This build did not silently grant quota.
- Public deployment, repository/domain renaming, trademark/legal clearance, production notification delivery, distributed storage and public-scale validation remain outside local v1.
- Existing dependency and bundle maintenance debt remains recorded. There is no comprehensive-pentest or zero-vulnerability claim.
- Shared Hindsight retention was unavailable; durable decisions and evidence are committed in this repository.

Read the [operating guide](coursekind-local-v1.md), [release readiness](release-readiness.md), [product decisions](implementation-decisions.md), [baseline decisions](../audits/2026-10-26/implementation-decisions.md), and [build log](autonomous-build-log.md) before a public relaunch. The working tree and draft PR are preserved for review.
