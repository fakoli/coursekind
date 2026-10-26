# Whole-branch baseline review

Reviewed 26 October 2026 on the MacBook. Base `9703fe7ab4f8b6be91c5e3aeed5397fbab9da8a7`; implementation head `4743616d4361dd04693be78810cda1e2c00f967d`. Requirements: `docs/user-journeys.md`, `docs/superpowers/plans/2026-10-26-baseline-journeys.md`, adopted D1–D8, and the controller's explicit isolation/content-preservation constraints. This is the broad branch gate, not another approval of each isolated task.

The checkout advanced through evidence-only commits during review; production source was unchanged. The later `docs/audits/2026-10-26/codex-cli-qualification.md` and controller's rendered stale-outline reproduction are additional evidence about this fixed implementation. No source, index, HEAD, configuration, user data, credentials, or other report was changed by this review. This report is its only file output. No subagents or full-suite reruns were used.

## Strengths

- JSON storage serializes same-directory operations across instances, stages transactions, uses atomic file replacement, fails on corruption, and rolls back nested transactions/cancellation. SQLite now serializes connection access and uses savepoints. Tests exercise actual storage boundaries, including failed batch writes and cancellation. The JSON crash/multiprocess limits are stated accurately.
- Generation separates remote work from the final storage transaction. Access, request identity, balance, artifact persistence, result replay and debit are checked together at finalization. Immutable provider snapshots, exact structured counts, failure-safe full-course replacement, zero BYOK debit, and safe provider diagnostics are substantial improvements.
- Named sharing, independent path references/follows, current membership-derived contribution counts, generic unavailable references, and live nested access checks form a coherent architecture. Recipient identities do not enter the public resource models.
- Study events are append-only and personal; stable card IDs distinguish current-deck progress from repeat history. Sessions, local-date streaks, explicit completion and retained historical maximums are grounded in evidence rather than invented mastery. Worker execution has actual termination, startup/execution deadlines and output caps.
- Account transitions remove/cancel private queries before the next identity renders, reject responses from an old token, and gate verification outages. Raw HTML sanitization, strict Mermaid configuration, safe 422 diagnostics, protected-image credential origin checks, and truthful notification availability close real boundaries.
- The validation effort is unusually concrete: named browser scenarios, disposable accounts/storage, real route/adapter boundaries, controlled-clock statistics, captured notifications, raw rendered observations and explicit real-versus-mocked provider distinctions. The reported 294 backend / 133 frontend tests and 41 browser cases at `d45aea3` are meaningful evidence, although not proof against the integration cases below.

## Issues

### Critical (Must Fix)

No P0 incident or unconditional catastrophic failure was established. The P1 issues below nevertheless block readiness.

### Important (Should Fix)

#### WB-01 — P1: The opt-in Codex provider does not meet its required isolation boundary

- **Files:** `backend/services/codex_subscription.py:144`, `:164`, `:224`, `:230`; `docs/local-codex-subscription.md`; later qualification evidence in `docs/audits/2026-10-26/codex-cli-qualification.md`.
- **Trigger/effect:** Enable the provider for its bound account and run the supported CLI 0.162.1. The actual synthetic-home qualification found global `CODEX_HOME/AGENTS.md` included in the model request and tool schemas still advertised, including `apply_patch` inside `functions.exec` and, under the production flags, collaboration. `project_doc_max_bytes=0`, ignored user config/rules, feature flags and “Do not use any tools” do not suppress those capabilities/instructions. Account binding prevents other app accounts from directly selecting the provider; it does not isolate the host agent from authored course text. The qualification did not execute hostile tools, so this report does not claim every advertised tool succeeded or that credentials were stolen.
- **Why it matters:** This violates the explicit Task 7 requirement to suppress host instructions/tools. Functional generation, fake-process CI and corrected descendant cleanup cannot certify this boundary. The version gate currently calls this version qualified even though the concrete qualification failed.
- **Disposition:** Keep runtime disabled and remove/defer the selectable execution path from the ready baseline, preserving historical evidence and the independent 2–4-objective prompt repair. The controller's stated defer/removal decision is appropriate. A dedicated OAuth/custom host integration is separate work requiring its own qualified boundary; do not copy tokens, alter global instructions, or substitute more unqualified flags. Rereview removal/migration behavior, including a stored `codex_subscription` preference, before readiness.

#### WB-02 — P1: Saving a stale course outline silently deletes newly added modules

- **Files:** `frontend/src/services/saveModuleOutlines.ts:10`, `:34`; `frontend/src/pages/CourseEditor.tsx:57`, `:97`.
- **Trigger/effect:** Open the course editor with module A. In another tab add and save module B. Save the first editor without changing its outline. The helper fetches the *current* module list, then deletes every module absent from the *old* draft, treating B as an intentional removal. B's entire saved lesson/cards/quiz/practice disappear and its old URL fails. The same issue applies to a concurrently generated module.
- **Evidence:** Executing the real helper in memory with current IDs `m1,m2` and the initialized `m1` draft deleted `m2`. The controller additionally reproduced the real UI sequence against disposable course `18809991…`: newly saved module `239036cb…` was deleted by an unchanged old editor, recorded in evidence commit `66cf68a` / screenshot 56.
- **Fix:** Carry the editor's original membership/revision and explicit removals, and validate it atomically at the server before destructive reconciliation. Preserve unfamiliar additions or return a recoverable conflict; never infer removal from absence in a stale draft. Keep retry identity for already-created modules and preserve existing content/IDs/progress. Test both an addition before Save and a concurrent change during reconciliation, including a stale deleted module that must not be silently resurrected as a new empty ID.

#### WB-03 — P1: Active uploaded SVG bypasses the shared-content sanitizer

- **Files:** `backend/api/routes/uploads.py:108`, `:114`, `:137`; `backend/services/image_service.py:14`, `:47`, `:70`; `frontend/src/components/common/CourseImage.tsx:47`.
- **Trigger/effect:** An ordinary author uploads an SVG containing script/event handlers, publishes or unlists their course, and places a link to the uploaded resource in shared content. Upload checks extension/size only and returns the original bytes as inline `image/svg+xml`. Under the same-origin API proxy, opening that URL as a document executes SVG active content in the application origin; the app's bearer token is in that origin's localStorage. Markdown/rehype sanitization never processes these bytes. Rendering SVG as an `<img>` is not itself the exploit; document navigation is the relevant boundary.
- **Evidence:** An in-memory call to the actual public image route returned 200 with `content-type: image/svg+xml`, `cache-control: no-store`, no sandbox CSP and no attachment disposition. Source inspection establishes that uploaded bytes are stored unchanged. No malicious browser execution or real token access was attempted.
- **Fix:** Reject active/user SVG or sanitize/rasterize it to a qualified inert representation before serving, including existing uploaded/generated SVG paths. Preserve existing files rather than deleting user content. Do not rely only on response CSP: authenticated `CourseImage` creates a fresh blob URL, so newly opened blob documents also need a safe representation. Add harmless script/event/external-reference fixtures and benign raster/SVG compatibility checks. Bundled trusted UI SVGs need not be removed.

#### WB-04 — P1: Image import permits server-side requests to internal services and returns their bodies

- **Files:** `backend/services/image_service.py:89`, `:108`, `:118`, `:142`; reachable from changed `backend/api/routes/modules.py:72`, `:129` and `backend/api/routes/uploads.py:57`.
- **Trigger/effect:** Any registered account can create its own course, then import `http://127.0.0.1/...`, a private/link-local address, or an attacker URL redirecting there. Only the HTTP scheme is checked; aiohttp follows redirects. A non-image response is accepted, assigned a `.jpg` extension, stored and returned through the app image URL, enabling the author to retrieve internal response bytes. The ownership check does not limit this to a trusted operator.
- **Evidence:** A network-free fake transport around the actual method received `http://127.0.0.1/internal`; its synthetic `text/plain` body was saved unchanged and an app image URL returned. No internal service was contacted. This helper is inherited code, but is directly reachable through the reviewed authoring/media surface; it is not a new bug attributed to this branch.
- **Fix:** Either disable server-side external fetching while retaining local uploads/existing content, or implement a qualified downloader that rejects non-public destinations, validates DNS/actual connections and every redirect, rejects URL credentials, streams with a hard byte limit, and validates actual supported image content. A hostname string check alone is insufficient against redirects/rebinding. Verify loopback/private/link-local/IPv6 and redirect denial with fake transports, plus a normal permitted image import if that capability remains.

#### WB-05 — P2: Anonymous public/unlisted reads contradict the adopted access policy

- **Files:** `backend/services/access_service.py:14`, `:21`, `:33`; `backend/api/routes/modules.py:44`, `:100`; `backend/api/routes/uploads.py:91`; `backend/tests/test_access_sharing.py:132`.
- **Trigger/effect:** A signed-out caller requests a public or unlisted course/path/module/media URL. `can_read` returns true based on visibility before requiring a user, and the relevant routes accept `OptionalUser`. Public discovery also permits anonymous access. This is not merely a frontend login redirect: direct HTTP returns the content. Filesystem fallback bypasses the predicate as well.
- **Evidence:** The real predicate returned true for both `public` and `unlisted` with `user_id=None`; the image-route probe returned 200. Existing tests explicitly expect anonymous 200s, so green CI currently reinforces the wrong policy.
- **Fix:** Enforce D2's authenticated public/unlisted policy consistently at the route/central policy boundary and update the visibility matrix. Test signed-out direct lists, detail, nested modules and media, plus signed-in public/unlisted access and private recipient revocation. Preserve trusted filesystem study content for authenticated users. The controller confirmed D2 is an adopted requirement, not an unresolved policy question.

#### WB-06 — P2: Finish discards an earlier failed card review

- **Files:** `frontend/src/pages/ModuleViewer.tsx:216`, `:222`, `:345`.
- **Trigger/effect:** Card A's review save fails. Navigate to card B and successfully review it. After A's rejection has settled, Finish sees only the current B encounter and the still-pending map; A was removed from that map in `finally`. It writes completion and navigates away even while the unsaved-action alert represents A. A's review/retry opportunity is lost. This is separate from the already-tested final-card failure.
- **Evidence:** Rendered the actual ModuleViewer in a fresh JSDOM with synthetic hooks: A failed twice, B succeeded, then requests were `review(A), review(A), review(B), complete`, followed by navigation to `/courses/c`. No saved A event existed. The controller independently reproduced this in real UI using two targeted synthetic 503s: Finish navigated to a 100%-completed course with only 1/2 cards reviewed (evidence commit `7fc7c24`, screenshot 57).
- **Fix:** Retain all unsaved review encounters, including settled failures, until acknowledged. Completion must await/retry them with their original event IDs or remain on the page with useful recovery. A single `failedStudyAction` slot also cannot represent several unresolved card saves. Add a two-card regression where the first save fails, a later one succeeds, and Finish remains blocked until the original failure is successfully retried.

#### WB-07 — P2: Server module-count cache stays stale after module membership changes

- **Files:** `backend/services/course_service.py:254`, `:269`; `backend/services/module_service.py:115`, `:148`, `:205`; `backend/services/course_orchestrator.py:110`.
- **Trigger/effect:** Read My Courses/Discover so `modules:count:<course_id>` is cached, then add/delete/batch-create/generate a module. Module mutations do not invalidate that key. Fresh list HTTP requests still return the old `CourseResponse.module_count` for up to 60 seconds, even though detail/list-modules shows the actual membership. Client query invalidation does not clear this server cache.
- **Evidence:** Real CourseService and ModuleService with an isolated in-memory store: `list_user_courses` returned 0, `create_module` saved one module, `list_user_courses` still returned 0, and `list_modules` returned 1. Affected query routes include `GET /api/v1/courses/mine`, `/discover`, and accessible-course listing, through `_batch_get_module_counts`.
- **Fix:** Remove this small-data count cache or invalidate/reconcile it for every committed membership mutation, including direct orchestrator writes and delete/replace. Avoid invalidating before a transaction commits in a way that allows an old count to be repopulated. Test warmed-cache create/delete/batch/generated replacement through the real services/routes, not only mocked frontend invalidation.

#### WB-08 — P2: A refreshed module response erases an unsaved editor draft

- **Files:** `frontend/src/pages/ModuleEditor.tsx:75`; `frontend/src/hooks/useModuleEditorForm.ts:33`.
- **Trigger/effect:** Edit lesson text/cards/quiz without saving. Another owner tab changes the same module (even just its title). Once the module query refetches—for example, focus after its five-minute stale window or an explicit generation invalidation—the effect re-populates title/content/cards/quiz unconditionally and clears the unsaved state. The author's draft disappears without a discard decision. Sandbox drafts have an explicit protection, but the other fields do not.
- **Evidence:** Rendered the actual ModuleEditor with real form/card/quiz hooks and synthetic data dependencies. After entering `Unsaved local lesson`, a refreshed module object with only a remote title change reset the textarea to `Saved lesson`.
- **Fix:** Initialize by module identity and reconcile refreshes without overwriting dirty fields; present a conflict/reload choice if server content changed. Reset correctly when changing modules/new-module routes. Ensure generation cancel/error and unrelated invalidations retain all local fields. Add a changed-response/dirty-draft regression; identical structurally shared responses alone are insufficient to exercise this case.

#### WB-09 — P2: A curator cannot select their own path for learning

- **Files:** `frontend/src/pages/LearningPathDetail.tsx:227`; supporting service `backend/services/learning_path_service.py:127`; selected-path statistics `backend/services/progress_service.py:449`.
- **Trigger/effect:** Create a personal learning path, add courses, and attempt to follow it. The only Follow/Unfollow control is guarded by `!isOwner`. My Paths and the discovery cards expose no alternative. The server correctly supports an owner follow, but ordinary UI users cannot create it, so their personal plan never enters Following/Selected Paths or path-prioritized Continue Learning. A manually/API-established own follow also cannot be unfollowed in this screen.
- **Why it matters:** The product model explicitly permits a person to be both author and learner, and D1/D5 distinguish ownership from selection. Separate concepts require an explicit owner selection control, rather than making authorship prevent selection. This needs no automatic following or change to the attribution model.
- **Fix:** Offer the same explicit Follow/Unfollow action to the owner alongside author controls. Verify create-own-path → follow → reload/dashboard → unfollow, without changing ownership or personal progress. This finding is from the complete UI/service call path; no extra browser run was performed.

### Minor (Nice to Have)

#### WB-10 — P3: Module detail/update responses omit persisted objectives

- **File:** `backend/services/module_service.py:416`.
- `_parse_module` reconstructs a Module without `objectives`, although create/batch/generation now persist them and summaries return them. Reading a saved module therefore reports an empty objectives array; a client round-trip using that response could erase the persisted objectives. A pure parser probe with one stored objective returned `[]`.
- Include `objectives=data.get("objectives", [])` in the read projection and verify create/get/update/batch consistency. This is a small API contract repair, not evidence that the current outline UI itself has already overwritten the stored objectives.

## Recommendations and verification boundaries

Resolve the findings in one coherent fix wave, preserving earlier repairs and existing user content. For WB-02 and WB-08, prefer explicit conflict/preservation behavior over last-writer deletion/reset. For media, a narrow, testable restriction is preferable to claiming a sanitizer/downloader is safe without qualification. The subscription removal must leave Anvil as the explicit default and retain honest historical evidence; do not silently reroute a stored subscription selection.

After focused regressions, run the normal required CI once on the final implementation head and repeat the changed real UI flows (stale authoring, card failure recovery, own-path selection, counts, sharing/media). No reported full suite was rerun here. `40314773513` at `d45aea3` was supplied as green; `40316340683` at `4743616` was pending when this review was commissioned, and this reviewer did not independently certify its eventual result. The 20 adapter regressions at 474 address descendant cleanup only.

The review proceeded in bounded passes across storage; ACL/routes/media; course/path authoring and persistence; provider preferences/adapters/accounting; events/statistics/learner state; auth/cache boundaries; rendering/workers; settings/accessibility; CI/fixtures and evidence. Test source was sampled for the concrete boundary contracts and missing scenarios rather than every assertion being re-executed. Binary screenshots were treated as controller evidence references, not as independently re-walked UI. No production inference, credentials, notification delivery or actual user data was used in probes.

The candidate ordinary same-tab practice autosave race was **rejected after inspection**, not deferred: `useUpdateModuleProgress` uses a shared TanStack mutation scope, serializing those writes. Similarly, current JSON cross-instance locking, current-card identity intersection, replay access rechecks, and the prior credential-422 fix were examined and did not produce new findings.

The disclosed dependency debt is reasonable to retain for this baseline after the concrete active-content issues above are fixed: four production metadata advisories, zero high, with two moderate build-time selector-parser entries and two low KaTeX-chain entries requiring an existing pollution condition. The documented compatible upgrades plus strict Mermaid/HTML handling improve the reachable boundary; this is not a zero-vulnerability claim. The 80 legacy Ruff findings and Vite chunk warnings are disclosed cleanup/performance debt, not by themselves proof of a failing journey. No broad dependency-major upgrade or formatting sweep is required by this review.

## Declined to judge

Each line below is a separate explicit boundary for controller disposition; none is silently treated as passing.

- Product naming, branding, relaunch and conversational AI workspace redesign: explicitly excluded from this baseline.
- Per-module path composition, collaborative editing, groups, and multiple/non-code practice activities: the adopted baseline retains whole-course live references and the existing module model.
- A new dedicated subscription OAuth/Rust-host implementation: separate integration scope; the reviewed CLI implementation itself is judged and blocked by WB-01, not excused by this deferral.
- Real OpenAI/Gemini/Anthropic entitlement, availability, quality and external billing: supplied evidence uses fake vendor HTTP; only adapter behavior is qualified here.
- General model pedagogical correctness or factual accuracy for arbitrary generated lessons: structured/count/error contracts were reviewed, but this is not a pedagogical evaluation dataset.
- Production email/SMS delivery and scheduling infrastructure: tests capture delivery and the catalog distinguishes preference persistence from real delivery; no actual messages were sent.
- Full hostile-code OS/network isolation for Python/JavaScript practice: workers are explicitly a responsiveness/lifecycle boundary, not a secure execution service; this review checks termination and that app credentials are not handed to worker code.
- Exam-grade tamper-resistant grading/proctoring: this baseline stores personal study results and makes no secure-assessment/mastery claim; self-reported quiz scores are not being certified as fraud resistant.
- Multi-process JSON coordination and multi-file crash-atomic recovery: explicitly documented unsupported deployment modes; use the database backend for that requirement.
- Multi-host database operation, distributed generation deduplication and large-library performance/load capacity: outside the documented single-instance baseline; no scalability certification follows from process-local locks or the current whole-collection scans.
- Reconstruction of historical study dates/card identities from legacy aggregates: D8 explicitly forbids inventing unavailable evidence; the stored legacy records are retained.
- Immediate permanent follow deletion at grant revocation: the recorded policy prunes unreadable follows when Following is read; revocation access enforcement is judged separately and must remain effective.
- Exhaustive large-library pagination and search usability beyond the initial library: the catalog separately identifies this growth coverage; no load-scale acceptance was run.
- Physical-device rendering, every browser/assistive-technology combination, and an exhaustive accessibility certification: supplied geometry/keyboard/browser evidence is bounded and the screenshot compositor limit is disclosed.
- Live Anvil uptime outside the recorded successful smoke/window and operational fleet benchmarks: historical success is not a current uptime guarantee; no fleet changes were performed.
- Full remediation of all development-only dependency advisories, 80 legacy Ruff findings and bundle-size warnings: assessed as disclosed bounded debt; unrelated major migrations/style cleanup would enlarge this repair without resolving the concrete blockers.
- A comprehensive penetration test of every unchanged admin/auth/reference endpoint, denial-of-service limit and deployment configuration: this is a broad branch/integration review with targeted outside-diff checks, not a claim that the entire inherited application is vulnerability free. The concrete inherited SVG/import risks actually found are reported as WB-03/WB-04 rather than discarded.

## Assessment

**Ready to merge? No.**

The core architecture and substantial validation are strong, but the fixed branch still has reproducible content loss and incomplete save recovery, plus concrete media/access boundary gaps and an unqualified optional host-agent integration. Address WB-01–WB-09, repair the small WB-10 projection omission while touching that area, and obtain scoped rereview plus final-head CI before marking the comprehensive PR ready. Do not merge as part of this review.
