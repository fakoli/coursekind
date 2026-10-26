# Coursekind product acceptance — in progress

Original40 browser journeys passed at `af5d483` in [baselineCI](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40324667864). New product work remains in progress.

Workspace lifecycle code reviewed and actualUI retested through `d92da47`.330 backend tests and163 frontend tests pass with lint/build; inherited Vite large-chunk warning remains. Remote CI40330344648 at `4c9690e` passed all40 browser journeys with retry0 plus backend/Node22/24 checks. Planning and build UI are implemented and the first course/build/study plus mixed-reuse path loops passed actual browser validation with an explicitly selected mock provider at `a1e6f33`. Live Anvil planning returned HTTP503 twice during model maintenance, with zero application debit. Task2 CI found a Python3.12 import compatibility failure; `81bb7d2` repairs it with an annotation-resolution regression and passes383 backend tests on isolated Python3.12. Scoped review is clean; [CI40337912952](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40337912952) passed all42 browser cases (5.6minutes),383 backend tests and both Node22/24 frontend/lint/build jobs at `81bb7d2`. Revisions and Jev remain pending.

Synthetic disposable UI records below include observation overhead; these are not server latency benchmarks. Historical failures remain after successful fixes.

| Journey | Scenario | Result | Observed time | Commit |
| --- | --- | --- | --- | --- |
| WORKSPACE-01 | Create from goal alone then save parameters and reload | pass | 27.3s | `374d415` |
| WORKSPACE-01 | Archive, find archived workspace, restore | pass | 18.7s | `374d415` |
| WORKSPACE-01 | Other account deep-links private workspace | pass | Not timed | `374d415` |
| WORKSPACE-01 | Open existing course twice without duplication | pass | 10.9s | `374d415` |
| WORKSPACE-06 | Two-tab stale brief recovery | pass | 26.8s | `9ae518e` |
| WORKSPACE-01 | Archive then restore in same editor and save new edit | fail | Not timed | `9ae518e` |
| WORKSPACE-02 | Existing owned path opens workspace with shared course references | pass | Not timed | `9ae518e` |
| WORKSPACE-01 | Dirty draft survives archive/restore, saves and reloads | pass | 14.8s | `d92da47` |

[Raw walkthrough records](walkthrough-log.json), [implementation evidence](workspace-implementation-report.md), [independent review](workspace-review.md), [scoped repair review](workspace-fix-review.md).


Planning/build review evidence: [initial review](planning-build-review.md), [cancellation repair review](planning-build-cancellation-review.md), [Python compatibility review](planning-build-compatibility-review.md), and [implementation/test report](planning-build-implementation-report.md).

The actual UI also passed partial-batch recovery: an injected second-module provider failure preserved the first draft, and selected-step retry retained attempt1 for the first and completed attempt2 for the second. Generated quiz submission saved one attempt at100%. These are deterministic external-provider fixtures, not claims of external live-model quality. Anvil default and user data remain unchanged in the normal app.


## Scoped revisions and restore checkpoint

Code `928d7f9`, renderer repair `cc6fd8f`:454 backend tests and175 frontend tests pass; final repair focused15 tests plus lint/build pass. [Initial review](revisions-review.md) found an omitted flashcard visual comparison; [scoped repair review](revisions-fix-review.md) approves visible inert references/removals in proposal and history. [Implementation report](revisions-implementation-report.md) contains commands and exact boundaries. [CI40344615240](https://github.com/fakoli/my-ai-study-buddy/actions/runs/40344615240) at `cc6fd8f` passed all44 browser cases in7.1minutes with zero retries, plus454 backend tests and181 frontend tests on both Node22/24 matrices. Task3 is accepted.

Actual UI passed quiz-only revision, study, reload and restore. The original three-question quiz returned while both100% and50% attempts remained; card IDs, ratings and prior activity survived. [Preservation checks](revision-preservation-checks.json) supplement the rendered [restored-study screenshot](10-restored-quiz-keeps-history.png). A second-tab manual edit correctly blocked stale Apply; explicit regeneration applied against the fresh state without losing that note. A draft saved before the revision upgrade still applied. Manual path-reference removal and restore preserved the source course and original module identities. The remaining readable-course-name polish in comparisons is assigned to Task5.
