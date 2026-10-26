# Browser acceptance

`npm run test:e2e` runs 40 named Chromium journeys (original stable IDs) against real API routes and a
fresh temporary JSON database. `npm run test:e2e:list` and `npm run test:e2e:types`
do not launch a browser. Install Python/uv dependencies in `backend`, npm
packages in `frontend`, and Chromium with `npx playwright install chromium`.
The GitHub Actions `browser-journeys` job installs these and runs all journeys.

The suite binds only 127.0.0.1:8018 and 4178, refuses to reuse existing servers,
starts Vite in explicit `e2e` mode with environment-file loading disabled, and uses unique synthetic example.com accounts. That mode fixes the browser API URL to `/api/v1` and its proxy to the disposable backend, regardless of ambient `VITE_API_URL`/`VITE_API_PROXY`. Normal development mode retains its existing environment behavior. It
never accesses the normal development ports 8010/5173 or existing user data.
`server.py` is a test-only executable, never imported by production. Its private
control routes set the study clock and external failure modes. Provider requests
use the real adapter code with `httpx.MockTransport`; notification `send` methods
are captured and delivery remains unconfigured in the browser scenario. No real
key, provider request, email or SMS is used. AI-06 is deferred after failed CLI isolation qualification; historical results remain in the audit, and the executable provider/fake-process fixture have been removed. The non-browser fixture smoke is
`cd backend && uv run python ../frontend/e2e/smoke.py`.

API calls prepare fixtures and verify persistence; user flows use rendered UI
controls. Each test has a fresh Playwright context, users and content. One worker
serializes the global test clock and failure control. Tests use semantic names,
condition-based waits and zero retries. Code execution scenarios run real
JavaScript workers. Python/Pyodide remains a separate manual/CDN integration;
this suite does not pretend a mocked runtime verifies Python.

`test-results/journey-timings.json` records every journey, result and measured
wall time, including setup/assertion overhead. An unstarted test has null time
and Not run status. HTML reports, screenshots and failure traces are uploaded
as the seven-day `browser-journey-evidence` CI artifact. Credentials/tokens in
these artifacts are synthetic only. Passing the named main scenarios does not
certify every acceptance branch; see the audit's coverage matrix for companion
unit/integration regressions and remaining manual/environment limits.

Authored HTML uses a safe allowlist. Script/iframe elements, event handlers,
inline CSS and unsafe link protocols are removed from rendered output; standard
Markdown, tables, code and protected images remain supported. Mermaid is fixed
to strict mode with HTML labels/callbacks disabled and protected security keys;
diagram directives cannot downgrade it. MODULE-01 checks benign diagram output
alongside hostile HTML/directive input after save/reload.
