# Task 6 validation implementation report

Date: 2026-10-26. Originating host: MacBook. Branch: `codex/local-startup-fix`.
Worker scope: durable browser acceptance, isolated server/fixtures, CI, current
catalog/audit normalization, regression qualification and validation-discovered
compatibility/security repairs. Coordinator owns actual CUA checks, whole-branch
independent review, final push/PR status and user delivery.

## Status

**DONE_WITH_CONCERNS for implementation and local verification; overall Task6 is
not complete while CI browser execution and whole-branch review are pending.**
No browser was launched locally by this worker. Forty named browser tests were
collected/typechecked; this is not a browser pass. Initial CI discovered a Node22
fixture issue, which was repaired and tested on Node22. Browser CI feedback is
still being collected by the coordinator; subsequent repairs must append here.

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
- All69 actual CUA source records preserved. Normalizer embeds original records,
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
| `python3 scripts/normalize-journey-audit.py` | 69 records,17 unmeasured; all40 journey IDs mapped |
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
