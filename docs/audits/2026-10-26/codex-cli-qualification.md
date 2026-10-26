# Codex CLI isolation qualification — failed

**Result:** CLI0.162.1 does not meet Task7's full isolation requirements through the supported exposed controls examined. Keep the optional provider disabled. Successful learning-content generation and the 41-case mocked CI run are functional evidence, not proof that the real CLI execution boundary is safe to enable.

## Reproduction

The manual-only [qualification script](../../../backend/scripts/qualify_codex_isolation.py) creates temporary HOME, CODEX_HOME and cwd, then runs the actual installed CLI against a fake Responses SSE endpoint bound only to127.0.0.1. It never reads/copies real credentials or touches global Codex configuration. The only auth value is a literal synthetic noncredential. Production execution flags are reused; the diagnostic deviations are a custom loopback model provider and API auth, replacing OpenAI/ChatGPT transport. This does not test ChatGPT billing or entitlement. The script is not part of public CI and must be invoked explicitly.

```sh
cd backend
uv run python scripts/qualify_codex_isolation.py --binary /absolute/path/to/codex
uv run python scripts/qualify_codex_isolation.py --binary /absolute/path/to/codex --additional-controls
```

Both runs have a20-second process deadline and use the production bounded-output/process-group boundary. The fake server returns final text only; it does not ask the CLI to execute tools. Only safe summaries are printed; no raw model prompts/process diagnostics/auth data are emitted. Temporary integration commands could only touch a marker inside the fixture.

## Observed results,26 October2026

Both runs exited0, completed a turn and sent exactly one request to the loopback server.

| Probe | Production flags | Additional documented controls |
| --- | --- | --- |
| Hostile user config marker included | No | No |
| Invalid global rule file parsed | No (run completed) | No (run completed) |
| Hostile project AGENTS marker included | No | No |
| Hostile global CODEX_HOME/AGENTS.md marker included | **Yes** | **Yes** |
| Synthetic MCP marker command started | No | No |
| Collaboration tools advertised | **Yes**, including spawn_agent | No |
| apply_patch advertised inside functions.exec | **Yes** | **Yes** |
| Overall isolation qualification | **Failed** | **Failed** |

The additional-controls diagnostic added `agents.enabled=false`, `features.multi_agent_v2=false`, `features.goals=false`, `tools.experimental_request_user_input.enabled=false`, `tools.update_plan.enabled=false`, `skills.include_instructions=false`, `skills.bundled.enabled=false`, and a neutral `model_instructions_file`. No such speculative changes were applied to production. It narrowed tool advertisement but did not remove global instructions or apply_patch. Tool advertisement is not proof that every advertised operation would execute successfully; conversely, a final-text-only fake response cannot certify that those capabilities are unavailable.

## Primary-source explanation

The official [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) documents `agents.enabled` separately from historical feature flags and describes `model_instructions_file` as a base-instruction replacement. The installed CLI's strict-config parser accepted the diagnostic controls. Neither the documented configuration nor the generated installed public `ThreadStartParams` schema exposed a global-user-instructions suppression or an allow-no-tools setting.

Official source inspected at commit `970111f6cb62cc02fe36a82ea7d71b37a2889c97`:

- [CodexHomeUserInstructionsProvider](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/codex-home/src/instructions/mod.rs) reads `AGENTS.override.md`, then `AGENTS.md`, from Codex home independently of the project instruction byte limit.
- [Configuration fields](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/config/src/config_toml.rs) provide base/developer instruction options and project byte limits, without an exposed global-instructions suppression field.
- [Rust extension ToolPolicy](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/ext/extension-api/src/tool_policy.rs) supports an empty allowed-tools list at host startup. [UserInstructionsProvider](https://github.com/openai/codex/blob/970111f6cb62cc02fe36a82ea7d71b37a2889c97/codex-rs/ext/extension-api/src/user_instructions.rs) is also host-injected. These Rust embedding interfaces are not equivalent to controls exposed by the installed CLI/public app-server protocol.

The installed CLI's generated experimental `ThreadStartParams` schema has `baseInstructions`, `developerInstructions`, `config`, `environments`, and `selectedCapabilityRoots`, but no ToolPolicy/allowedTools or global-user-instruction suppression. An empty environments array disables environment access, not the global instruction provider. Therefore app-server is not established as a safe drop-in alternative. Building a custom Rust host or handling per-user Responses OAuth would be a separate integration scope.

## Follow-up boundary

No further production changes or flag experiments are authorized until the scope decision. The controller has offered proper dedicated OAuth (requiring user sign-in/setup) versus finishing the baseline PR while deferring the optional subscription integration. Runtime opt-in remains disabled. Do not copy/symlink auth files or modify global instructions to circumvent this finding.

The separate descendant-process defect is fixed in `4743616`: cleanup signals the created process group even after the leader exits and bounds reaping to2seconds. Two harmless local fork regressions failed before that fix and passed afterward; all20 adapter tests and scoped Ruff passed. That fix does not resolve the instruction/tool qualification failures above.
