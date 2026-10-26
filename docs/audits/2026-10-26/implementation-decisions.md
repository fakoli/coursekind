# Baseline implementation decisions

These decisions were made during the authorized baseline repair. Earlier prototype decisions remain recorded even where the later isolation finding superseded them. Final code review at af5d483 cleared all identified findings; final-head CI40324667864 passed all required jobs.

Ruling: Adopt documented working policies D1–D8 for this baseline — the owner requested completion as described, and the catalog states these proposals explicitly — refinements may require metric or permission changes later.

Ruling: External Codex choice means OpenAI API models with a personal API key, with clear UI copy — no subscription authentication protocol was specified — subscription login would need separate integration if desired.

Ruling: Path completion uses equal weighting per referenced course; unavailable and empty courses contribute zero — preserves existing whole-course model without leaking inaccessible module counts — module weighting later would require recalculating displayed percentages, not discarding underlying module progress.

Ruling: BYOK requests record usage without deducting shared-Anvil application credits — separates owner-defined local-AI chargeback/limits from external provider billing; optional clarification was unanswered while independent work continued — if the owner wants an additional platform fee, add explicit per-provider debit policy and revise tests/UI.

Ruling: Implement the requested subscription option as an opt-in local Codex connection bound to one explicitly configured Study Buddy account — the owner asked to use their existing subscription for local validation and no different answer arrived to the optional local-versus-per-user question during independent work — if multi-user subscription sign-in is desired now, this needs the separate official per-user OAuth integration rather than sharing the host login.

Ruling: Use bounded configured Codex model candidates with explicit live validation instead of app-server catalog discovery — a synthetic probe proved mcp_servers={} merges with inherited configuration rather than clearing it, and model discovery does not justify reading host configuration or enabling integrations — if automatic entitlement discovery is needed later, it requires a separately qualified isolated discovery mechanism; candidate listings alone do not prove availability.

Ruling: Keep the unqualified Codex CLI subscription prototype out of the ready baseline PR and preserve its experiment/evidence in Git while deferring to a proper OAuth follow-up — actual CLI qualification failed the required isolation boundary, and no answer arrived to the optional scope question while independent review continued — if subscription support is needed in this PR, completion requires the separately scoped supported OAuth setup and another validation/review pass. Pending userreply may override deferral; do not weaken isolation. Finalfixwave will combine removal with wholebranch findings.

Ruling: Restrict app-served user media to validated inert raster images and stop server-side external URL fetching, preserving existing files and safe browser-rendered remote references — active SVG and unrestricted image import cross the app-origin/server-network boundaries, and a qualified sanitizer/downloader would enlarge this baseline — users with uploaded SVGs may need raster conversion or file upload; a future safe importer can restore additional formats without weakening the boundary.

## Review scope dispositions

The whole-branch review’s “Declined to judge” entries are retained in [review-findings.md](review-findings.md). The coordinator accepts each as an explicit limit, not as a passing result:

- Naming/relaunch/AI workspace: deferred by the owner.
- Per-module path composition, collaboration/groups and additional practice types: outside the adopted whole-course baseline.
- Dedicated subscription OAuth/custom host: separate follow-up after the CLI failed qualification; the CLI execution path is removed.
- Real external-vendor entitlement/availability/quality/billing: adapter mocks only; no live claim.
- Arbitrary lesson factual/pedagogical accuracy: requires a separate content evaluation.
- Production notification delivery/scheduling: provider configuration and explicit live opt-in remain required; no real messages were sent.
- Hostile practice-code OS/network isolation: workers provide responsiveness/termination, not a security service.
- Exam-grade grading/proctoring: not part of personal study tracking.
- Multi-process JSON and multi-file crash atomicity: unsupported documented deployment modes.
- Distributed database/deduplication and load capacity: no multi-host or scale certification.
- Reconstruction of missing legacy activity/card history: intentionally prohibited; preserve records without inventing history.
- Follow pruning timing: unreadable follows are pruned on Following read; access revocation is immediate on subsequent server checks.
- Exhaustive large-library pagination/search usability: requires later growth validation.
- Physical devices/all browsers/assistive technologies: current UI evidence is bounded; no exhaustive accessibility certification.
- Anvil uptime/fleet benchmarks outside the observed run: operational follow-up, no fleet changes.
- Remaining dependency/Ruff/bundle debt: retained as documented after reachable boundary repairs, without a zero-vulnerability claim.
- Comprehensive pentest of all inherited endpoints/deployment/DoS behavior: not claimed; the concrete media/access findings actually identified are included in this repair.

Ruling: Repair the newly reproduced quiz retry identity regression with a targeted follow-up despite the final-review single-wave cap — the later user mandate explicitly requires autonomous remediation and a credible foundation, and a lost-response duplicate study attempt is load-bearing — this adds one narrow implementation/review cycle, not another broad review sweep.

The scoped review additionally declined to certify combined course-metadata/outline atomicity, general collaborative module concurrency, automated legacy SVG conversion, a replacement image downloader, and uncommitted coordinator evidence. These remain explicit bounded limitations; Coursekind versioned workspace changes will have their own atomicity/concurrency gate. The targeted quiz repair required two narrow checks: immutable identity first, then resolve-before-new-submission to preserve durable score ordering. Both are cleared in the final verification.
