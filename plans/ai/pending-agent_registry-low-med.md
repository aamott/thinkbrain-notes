# ACP Agent Registry and Detection

## Goal

Provide an allowlisted, renderer-safe registry of ACP agent launch metadata and best-effort availability. Separate detection from process lifecycle and never expose arbitrary shell execution.

## Exact likely files

- `apps/desktop/src/agent/agentRegistry.ts` — renderer-facing metadata only if detection is native-fed; no `child_process`/shell.
- `apps/desktop/src/native/acp.ts` and `src/native/commands.ts` — typed `agent_list_available` adapter.
- `apps/desktop/src-tauri/src/ai/agent_registry.rs` — canonical allowlist, executable/path probing, invocation args, ACP support state.
- `apps/desktop/src-tauri/src/commands/acp.rs`, `commands/mod.rs`, `lib.rs`, `capabilities/default.json` — typed registration.
- `apps/desktop/src/agent/agentRegistry.test.ts` and Rust registry tests.

## Contracts

`agent_list_available` returns `{agents: [{agentId, displayName, available, acpMode: "native" | "extension-required", version?: string}], defaultAgentId?: string}`. It never returns an arbitrary path or shell string to the renderer. Native spawn consumes only a registered `agentId`, active workspace root, and approved extra arguments (no user-supplied command line). `agent_spawn` returns an opaque `{processId/sessionHandle}`; renderer never gets environment variables.

The initial allowlist may include the names already recorded in the existing story, but each entry must be verified against current ACP support before implementation; do not silently claim an agent is supported. PATH probing is non-blocking and must not start an agent or send network traffic.

## Dependencies and order

- Depends on ACP host command DTOs and product approval of supported agents.
- Blocks ACP text-streaming availability state and host spawn.
- Extension-required entries remain unavailable until extension registration; no extension bypass.

## Tests

Unit-test PATH found/missing, malformed version, duplicate IDs, default selection, and arbitrary-command rejection. Assert detection does not start a subprocess, open a network connection, or read credentials.

## Manual checks

Verify no subprocess starts during detection, Mistral/default behavior only when actually present, and clear unavailable state. Confirm the renderer sees metadata only and cannot submit an executable or arbitrary args.

## Consent, local/cloud, and mobile constraints

Detection is not consent: an installed agent does not authorize ACP filesystem/terminal access or remote model/context transfer. Registry probing is local-only and must not trigger cloud traffic. On mobile, PATH probing is expected to return unavailable unless a mobile-native agent mechanism is approved; the UI must not suggest desktop installation commands, and the same typed `agent_list_available` result must drive the unavailable state.

## Acceptance criteria

- [ ] Renderer receives only allowlisted metadata and typed availability; arbitrary commands/paths/args are rejected.
- [ ] Detection is local, non-blocking, secret-free, and never starts a process or network request.
- [ ] Desktop/mobile unavailable states are explicit and truthful.

## Automated validation

Run registry adapter/Rust tests for allowlist, PATH found/missing, malformed versions, duplicates, default selection, arbitrary-command rejection, `pnpm lint`, and `pnpm typecheck`.

## Manual desktop/mobile checks

Desktop: verify detection does not spawn and only present allowlisted agents appear. Mobile: verify unavailable state without PATH/install guidance or process assumptions.

## Non-goals

No ACP lifecycle, provider auth, process permissions, terminal capability, extension installation, settings UI, or custom shell execution.

## Handoff expectations

Deliver supported-agent decision record, allowlist/availability contract, tests, platform matrix, and unresolved owner questions.
