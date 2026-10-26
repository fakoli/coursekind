### Task 6: Validate all journeys and publish the comprehensive PR

**Files:** automated integration/UI journey tests and fixture helpers, new dated baseline audit/report in `docs/audits/`, catalog status updates, README links, this plan and execution ledger.

- [ ] Run full backend and frontend tests, production build, lint and whitespace checks. Run permission/concurrency/AI failure integrations with disposable storage.
- [ ] Walk all 40 journeys in the rendered app with synthetic author/learner personas, record actual timings, persistence and failures, and capture critical visible outcomes. Exercise mobile and keyboard plus the original failed cases. Use mock provider/delivery transports for external error cases; separately label live Anvil evidence. Do not label a mocked external provider as live verified.
- [ ] Update the journey catalog to current behavior and record resolved policies, implementation details, validation commands/results, and remaining external-environment limits. Retain the historical audit unchanged.
- [ ] Have an independent whole-branch review; fix material findings and rerun covering tests. Commit, push the dedicated feature branch, open one comprehensive PR and attach it to this chat. Do not merge.

CI-discovered validation follow-up: repair Node22 image-test fixture incompatibility without weakening assertions; triage npm production audit and apply the smallest compatible upgrades for reachable vulnerabilities (Mermaid DOMPurify/Lodash and client router as applicable), verify full affected suites/build and repeat audit. No blanket force upgrades. Report concrete remaining applicability/version constraints.


### Validation-discovered scope additions (26 October)

- Repair Node22 protected-image test fixtures without changing runtime behavior.
- Update compatible vulnerable rendering/routing dependencies, record precise residual advisory/version constraints, and qualify diagram compatibility.
- Close the newly identified cross-user authored-content boundary: sanitize raw HTML, use strict Mermaid with protected security configuration, retain benign Markdown/tables/code/protected images, and regress malicious HTML/directive handling. This is a baseline access/content fix, not the deferred product redesign.
