# Codex subscription — deferred after failed qualification

The selectable CLI provider, operator configuration, process adapter and executable AI-06 test have been removed from the ready baseline. Anvil `llm.primary` remains the default. OpenAI API access still uses a user-supplied API key.

A stored `codex_subscription` choice remains visible as retired in Settings. Generation fails closed until that user explicitly chooses an available provider and model and saves. No automatic fallback or credential migration occurs; the host Codex login/configuration is never changed.

The historical prototype and process cleanup are preserved in Git at `4743616d4361dd04693be78810cda1e2c00f967d`. Successful functional/CI evidence does not qualify host isolation. The [failed isolation evidence](audits/2026-10-26/codex-cli-qualification.md) remains authoritative.

The manual synthetic diagnostic and its adapter dependency are preserved together at [commit 2cd8b76](https://github.com/fakoli/my-ai-study-buddy/blob/2cd8b76/backend/scripts/qualify_codex_isolation.py). Inspect that immutable revision in a separate checkout to reproduce the historical diagnostic. It is not an enabled integration or a CI test. No current setup path enables subscription inference. A future integration requires its own instruction/tool isolation qualification.
