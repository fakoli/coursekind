# Task 6 validation implementation report

Date: 2026-10-26. Originating host: MacBook. Branch: `codex/local-startup-fix`.
Worker scope: durable browser acceptance, isolated server/fixtures, CI, current
catalog/audit normalization, regression qualification and validation-discovered
compatibility/security repairs. Coordinator owns actual CUA checks, whole-branch
independent review, final push/PR status and user delivery.

## Status

**DONE for Task6 implementation and baseline validation.** All40 browser journeys
passed without retries on874d00b in CI run40310163615; backend and Node22/24
frontend test/lint/build jobs also passed. Task6 implementation/specification and
quality review are approved after round1 fixes, as confirmed by the coordinator.
Independent whole-branch review and the newly requested Task7 optional subscription
provider remain pending; this does not mark the full branch released. No browser
was launched locally by this worker. Earlier checkpoints below are historical.

## Implementation

- Standard `@playwright/test`, four spec files, one meaningful named scenario for
  each of 40 stable IDs. Real UI actions create/edit/save/study/share/follow/
  revoke/delete; API calls seed isolated prerequisites and supplement visible
  persistence assertions. Added full-module staged generation and manual
  refinement to MODULE05, beyond card-only status checks.
- Temporary backend JSON directory; unique synthetic accounts per test; fixed
  loopback ports 8018/4178; existing servers are never reused. Test-only server
  constructs Settings without `.env` files and explicitly supplies dummy/no
  service credentials. Normal ports/data at8010/5173 are never touched.
- Real application routes, services, auth and transactions remain active.
  Provider HTTP uses `httpx.MockTransport` through real Anvil/OpenAI/Gemini/
  Anthropic adapters. Notification sends are captured; the browser preference
  scenario checks unavailable transport and no delivery. Real JavaScript workers
  exercise output/errors/5-second timeout. Python remains separately evidenced
  by coordinator CUA, avoiding false browser-runtime mocks.
- Backend study clock control allows actual UI actions across session and streak
  boundaries; no fake UI stats. One worker prevents shared-clock interleaving.
- Every test emits an ID/status/wall time. Unstarted cases remain Not run with
  null duration; no retries obscure failures. CI uploads HTML, traces, screenshots
  and JSON timings for seven days. Action timeout10s and navigation15s bound
  missing selectors while whole-journey budget remains60s.
- CI adds browser job, gates frontend lint and build, and supports manual
  workflow dispatch. Existing Python3.12 and Node22/24 matrix remains.
- All70 actual CUA source records preserved. Normalizer embeds original records,
  handles three timing units, retains17 null times and maps explicit later
  retests. All40 IDs have raw evidence and durable scenario rows. No blank status
  is promoted to Pass. Historical25October audit unchanged.
- Catalog now reflects implemented controls, D1–D8, live versus mocked limits,
  learning-state persistence and contribution/progress definitions. README links
  current audit and suite; removed inaccurate spaced-repetition/image claims.

## Validation-discovered repairs

1. Node22's undici `Response(new JSDOM.Blob(...))` rejects the fixture with
   `object.stream is not a function`. Protected-image tests now use string
   Response bodies and still exercise the real `Response.blob()` renderer path.
   Five focused cases passed Node22, then the full final129-test suite passed.
2. Compatible dependency updates remove all four production high advisories;
   exact versions and residual constraints are in
   `docs/audits/2026-10-26/dependency-review.md`. Production metadata14→4;
   residual2moderate build-time selector-parser entries and2low Mermaid/KaTeX
   entries remain. Major Mermaid12 and parser/plugin migrations are explicitly
   deferred by coordinator, not silently forced. Full dev+prod metadata still
   reports23 advisories; no zero-audit claim.
3. Shared authored HTML previously flowed through `rehype-raw` without a safe
   allowlist, and Mermaid used loose mode. Added `rehype-sanitize` after raw
   parsing, fixed Mermaid to strict mode, disabled HTML labels and locked
   security/DOMPurify/themeCSS settings against directives. Scripts/iframes,
   unsafe URLs, event handlers and inline CSS are removed while ordinary
   Markdown/tables/code/images remain. New tests check malicious HTML, benign
   content and an actual parsed directive attempting to downgrade security.
   Existing protected-image regressions pass. MODULE01 requires actual SVG
   rendering after save/reload, alongside hostile markup; coordinator separately
   verifies rendered diagram compatibility through CUA.

## Commands and results

Commands run with explicit Node LTS PATH and `login:false` where relevant.
No command requiring service API keys was executed.

| Command | Result |
| --- | --- |
| `node --version` with `/Users/sekoudoumbouya/.nvm/versions/node/v24.18.0/bin` first in PATH | v24.18.0 |
| `env -u DEBUG /tmp/study-buddy-baseline-20261026/backend/.venv/bin/python -m pytest tests -q` in backend | 272 passed,38.84s; Python3.14.6 isolated environment; no backend production changes afterward |
| `npm run test` final Node24 | 129 passed/30files,3.61s |
| `npm run test` final Node22.16.0 | 129 passed/30files,3.60s |
| `npm run lint` after dependency/security fixes | Passed |
| `npm run build` after dependency/security fixes | Passed; existing >500kB chunk advisory retained |
| `npm run test:e2e:types` | Passed, including latest scenario changes |
| `npm run test:e2e:list` | 40 tests/four files; no browser execution |
| isolated Python `frontend/e2e/smoke.py` | Passed real auth/storage + all four mocked provider adapters; initially caught unsupported `.test` registration emails, corrected to synthetic `example.com` |
| `uv run --with ruff ruff check .` in backend, Ruff0.17.2 | 80 existing errors; not claimed clean or newly gated; no automatic broad reformat |
| `npm audit --omit=dev --json` after compatible updates | 4 metadata advisories:0high/2moderate/2low; see dependency review |
| `python3 scripts/normalize-journey-audit.py` | 70 records,17 unmeasured; all40 journey IDs mapped |
| `git diff --check` | Passed at each implementation checkpoint |

Direct standalone `ruff` was unavailable; the successful diagnostic invocation
uses `uv run --with ruff`. Test/browser data, timing files and failure traces are
synthetic only. The full frontend build is a compilation qualification, not an
actual browser-rendering assertion.

## Self-review and remaining boundaries

- No suite mutation targets existing user data or sends real notifications.
- Test-only control endpoints exist only in `frontend/e2e/server.py`, never in
  production app import/startup. Settings construction prevents local .env or
  ambient service configuration from enabling real provider/delivery calls.
- Content/API/permission/accounting assertions remain real; transport mocks are
  explicitly named. Each named test has actions plus visible/persisted outcomes.
- Browser tests are freshly introduced and need CI selector/execution review;
  failures must be fixed, not skipped or weakened. Timing includes setup/assertion
  overhead. Manual subflow timing cannot certify full journey duration.
- Real external vendor inference, real notification delivery, live secondary
  Anvil generation, physical phone rendering and production multi-process JSON
  storage are not certified. Real primary Anvil and Python worker evidence are
  coordinator-owned and referenced faithfully in the audit.
- Historical progress cannot reconstruct missing legacy dates/card identities.
  Browser workers terminate code; they are not a network security boundary.
- Residual dependency advisories,80legacy backend Ruff findings and Vite chunk
  size remain explicit; no broad cleanup or major dependency migration was
  smuggled into the baseline.
- Whole-branch review and final publication remain coordinator responsibilities.

## Commits

- `a058ac5` — isolated40-journey browser suite/CI/timing implementation.
- `15406f9` — Node22 protected-image fixture compatibility.
- `0e01523` — compatible rendering/routing dependency updates and advisory review.
- `20c9c59` — safe shared HTML/strict Mermaid plus bounded browser waits.
- Subsequent docs/scenario/CI followups are recorded below as they complete.

### First CI feedback and diagram followup

- Initial run40305008539 canceled after14 browser cases timed out at first form
  fill. Trace/error-context artifacts showed exact `getByLabel` matching the
  required visual `*`, despite the accessible-name snapshot omitting it. Commit
  `5dd788a` uses anchored optional-marker labels for auth/path forms; all visible
  and persisted assertions remain. No initial browser case is reported passed.
- Corrected run40307745119 passes backend and both Node22/24 test/lint/build
  jobs; browser execution is pending at this checkpoint.
- Coordinator actual CUA on20c9c59 verified strict Mermaid real SVG, protected
  image, rich formatting and executable JavaScript after save/reload. Raw
  record69 and screenshot51 merged verbatim; normalized log now70 records and
  still17 null durations.
- Bounded source audit added explicit response waits for failed generation and
  unchanged-provider credential replacement to prevent test-control mutations
  racing in-flight requests; notification toggles wait for loaded defaults.
- `7f0a505` records the catalog/audit/report; `5dd788a` repairs first CI labels.

### Task6 review round1 fixes

Read `task-6-review.md` and addressed Important1 plus Minor1/2. The API client
prioritizes `VITE_API_URL`; overriding only Vite's proxy was not sufficient
isolation. Playwright now starts explicit `--mode e2e`, pins `VITE_API_URL=/api/v1`,
and the Vite config disables env-file loading and ambient VITE-variable exposure
only in that mode. It also defines the relative API URL and fixed8018 proxy at
configuration level, so an inherited URL cannot bypass fixture storage. Normal
development mode behavior is unchanged. A focused test resolves actual Vite
configuration in a temporary directory containing conflicting `.env`,
`.env.local`, `.env.e2e`, `.env.e2e.local` values plus ambient URLs; it verifies
none enter client env and both API targets remain fixed. No normal API is contacted.

Pinned test-backend `anvil_model="llm.primary"`; the non-browser fixture smoke
now asserts this while launched with conflicting `ANVIL_MODEL`. COURSE04 now
uses three matching public courses with distinct creation order and2/1/0 active
references. All three sort modes assert different exact visible title orders,
then verify attribution/module count, no-match recovery and private exclusion.

Focused validation only (unchanged full suites not repeated):
- Node24 `npm run test -- src/test/e2eConfig.test.ts`:2passed,0.207s.
- `npm run test:e2e:types`, `npx tsc -b`, `npm run lint`:passed.
- `ANVIL_MODEL=ambient-must-not-escape` isolated Python fixture smoke:passed
  auth/storage/allfourprovider adapters with pinnedprimary assertion.
- `git diff --check`:passed. Browser sorting execution remains pending CI.

Self-review: no production request destination changed; dedicated test mode
excludes developer env while ordinary mode still accepts its configured proxy.
Temporary test env files contain synthetic invalid destinations and are removed.
No broad code/test/dependency changes or Task7 provider implementation included.
Existing Ruff/build/dependency debt remains explicitly disclosed (review Minor3).


### CI run40307745119 failure repairs and typing correction

Run40307745119 on5dd788a completed32passed/8failed in7.0minutes. Saved
error-context and network traces were inspected directly from the downloaded
artifact, without launching a local browser. All40 statuses and wall times are
preserved verbatim in `docs/audits/2026-10-26/ci-40307745119-timings.json`.

- COURSE04: real byline is `by Learner · 1 module`; already corrected in fb82dbc
  alongside the three-course sort discrimination requested by review.
- COURSE05: suggestion endpoint returned503, with validation failure after two
  attempts. Mock output supplied one objective; production requires2–4. Fixture
  now supplies two; expanded smoke validates suggestion counts/objectives for all
  four adapters. Browser test explicitly awaits successful suggestion response
  and chooses the generated module by its checkbox name, preserving append and
  editable persisted lesson assertions.
- MODULE03/STUDY04/STATS04: actual visible score text includes `Score: `;
  assertions still require exact50%/100% results and persisted attempts/history.
- STUDY05: actual buttons are `Run Code` and `Solution Show`; solution syntax
  renders a code element inside a div, not pre. Output/error/timeout/reset/saved
  code assertions remain intact.
- PATH02: debounced search briefly retained20 Add to Path buttons. Scope the
  action to the card containing the exact unique course heading; membership,
  duplicate exclusion and source navigation assertions remain.
- SHARE01: role-based combobox name is Visibility; label text also contains
  nested options. Use the exact accessible combobox name.

Correction to the preceding round1 validation entry: final `npx tsc -b` initially
failed on optional config fields in the new test and an old unused expect-error
for global.fetch. The earlier reported pass was premature. Optional chaining in
the proof and globalThis.fetch without an obsolete suppression resolve these.
Final verified commands on Node24.18.0 (loginfalse, explicitPATH):
- `npx tsc -b`:passed.
- `npm run test -- src/test/e2eConfig.test.ts src/api/client.test.ts`:13passed,
  2files,0.598s. Existing full129 suite was not unnecessarily repeated.
- `npm run test:e2e:types`:passed; `npm run lint`:passed.
- `npm run test:e2e -- --list`:40tests in4files (listing only).
- `ANVIL_MODEL=ambient-must-not-escape` isolated fixture smoke:passed auth,
  storage and all four adapters for both flashcards and valid module suggestions.
- `git diff --check`:passed.

Self-review: no production logic changed in this repair wave, no outcome was
removed or replaced by status-only coverage, and no case skipped/retried. Current
head still requires browser CI rerun and independent review. Task7 optional
subscription provider remains outside this task.


### Final Task6 baseline verification

Coordinator confirmed CI run40310163615 allgreen on exact implementation head
`874d00b2533e8e50928f99d109182d38fdb86022`. The downloaded timing artifact,
measured2026-10-26T10:54:28.008Z, independently contains40 distinct IDs, allpassed,
retry0 and positive durations. Browser suite execution was6.0minutes; individual
fixture-plus-test durations total355.220seconds. Backend and both Node22/24
frontend test/lint/build jobs passed in the same run. Task6 implementation/spec
and quality reviews are approved after round1 fixes (coordinator confirmation).

Copied `ci-40310163615-timings.json` verbatim into the audit and updated all40
matrix rows with Passed plus a separate automated-seconds column. Manual70record
raw/normalized evidence,17null intervals and prior failed-run40307745119 timings
remain unchanged. These deterministic mocked-provider tests do not certify live
provider uptime, real notification delivery, physical-device behavior or elapsed
multi-day use. Existing Ruff/dependency/build warnings remain disclosed.

This final change is documentation-only. No tests were rerun. Validation:
- Parsed downloaded artifact:40unique IDs,40passed,0retries,allpositive durations.
- Compared retained JSON bytes with artifact source:identical.
- Matched all40 table durations/statuses to artifact rows; manual columns retained.
- `git diff --check`:passed.

Task6 baseline gate is complete. Independent whole-branch review and new Task7
subscription-provider implementation/verification remain pending before full
release. Self-review: the green claim is scoped to874d00b, preserves failed-run
history and separates automated timings from manual subflow observations.
