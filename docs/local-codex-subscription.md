# Optional local Codex subscription

Anvil remains the default. A trusted local operator on macOS or Linux can enable **Codex (local subscription)** for exactly one Study Buddy account while Anvil is unavailable. This uses the host's existing Codex ChatGPT login, with subscription usage limits and zero Anvil application-credit debit. It is separate from OpenAI API-key billing. This baseline is for a trusted loopback deployment, not a publicly reachable or remotely shared service; it does not implement per-user OAuth or share the host subscription among app users.

1. Install the official **codex-cli 0.162.1** and sign in with ChatGPT using `codex login`. Verify with `codex login status`. The integration fails closed on other CLI versions until their controls are qualified.
2. Find the authorized Study Buddy user's ID from their authenticated `/api/v1/auth/me` response. Set the operator-only environment configuration below, then restart the backend. Use the absolute executable path returned by `command -v codex`.

   ```dotenv
   CODEX_SUBSCRIPTION_ENABLED=true
   CODEX_SUBSCRIPTION_USER_ID=the-authorized-study-buddy-user-uuid
   CODEX_SUBSCRIPTION_BINARY=/absolute/path/to/codex
   CODEX_SUBSCRIPTION_MODELS=["gpt-6-luna"]
   CODEX_SUBSCRIPTION_TIMEOUT_SECONDS=180
   ```

3. Open Settings as that account, choose **Codex (local subscription)** and a configured model candidate, then click **Check selected model**. This sends a small real inference request against the subscription. A successful check applies to that model at that time; it does not guarantee subsequent requests or remaining quota. Save AI preferences to use it for generation. Saving a candidate itself checks configuration/login, not inference entitlement.
4. Generate and refine learning content normally. Successful generation uses the existing immutable provider/model snapshot, structured validation, atomic application and exactly-once success ledger. Replaying a completed request does not generate again. Failed generation records no successful usage or Anvil debit. The connection check consumes subscription inference but does not create a learning-content generation ledger entry.
5. To return, explicitly select Anvil, choose its model and save. Switching providers or removing app credentials never calls `codex logout`, changes the host login, or deletes another provider's saved key. Disabling the server option blocks further Codex calls without silently changing a saved selection.

No API-key field appears for Codex subscription, and the API rejects one if supplied. Other users cannot inspect its connection, validate, list candidates or generate through the subscription. Default Anvil behavior and per-user encrypted API keys remain unchanged.

## Execution boundary

The app never reads, copies, exports or stores OAuth tokens or `auth.json`. The CLI owns its authentication. The child receives only HOME, USER, LANG, TMPDIR and CODEX_HOME when present, plus a fixed system PATH; vendor API keys, proxy overrides and runtime injection variables are stripped. The configured executable must be absolute and is never client-controlled. Prompts go through stdin and model IDs are checked against bounded operator candidates; neither can supply executable paths, arguments or environment.

Each inference uses a new temporary directory, `exec --ignore-user-config --ignore-rules --ephemeral --strict-config`, read-only sandboxing, no approval escalation, OpenAI provider with forced ChatGPT auth, zero project-instruction bytes, disabled web search, and disabled shell, apps, plugins, hooks, browser, computer, image, skills-search, memory, workspace-dependency, code-mode-host and multi-agent features. It requires a schema-valid response envelope, one completed turn, a zero process exit and the existing content validators. Both output pipes share a 1 MiB limit; stdout is parsed and stderr is discarded. Timeout, cancellation and output overflow kill/reap the child process group. Errors contain actionable safe text rather than raw diagnostics or host paths. There is no automatic provider fallback.

The 20-second version and plain `login status` probes are read-only and start no agent; this CLI rejects `--strict-config` on login, so those execution-only flags are applied to `exec`.

## Candidate list and verification limits

`CODEX_SUBSCRIPTION_MODELS` supplies at most 20 safe model IDs; the initial candidate is `gpt-6-luna`. This is not an exhaustive live catalog or a claim of entitlement. Production does **not** use app-server: a synthetic configuration probe showed that `mcp_servers={}` retains inherited server entries under recursive config merge, and app-server has no `--ignore-user-config` flag. Configured candidates plus explicit isolated inference checks avoid reading or activating host integrations for discovery.

Tests replace the process boundary and explicitly disable ambient subscription opt-in. Public CI never launches Codex, uses subscription credentials or consumes real subscription quota. AI-06 adds a deterministic browser journey to the original 40 stable baseline IDs. Real UI inference timing/quality and final browser CI evidence are tracked separately in the [26 October audit](audits/2026-10-26/README.md).
