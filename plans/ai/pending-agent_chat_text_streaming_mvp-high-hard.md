# Agent Chat Text Streaming MVP

## Status

⬜ Renderer/runtime integration only. Host lifecycle is in `pending-acp_host_runtime-med-hard.md`; agent detection is in `pending-agent_registry-low-med.md`.

## Product questions — STOP before UI

Confirm: (1) what unavailable state should appear when no ACP agent is detected, (2) whether one assistant panel can switch agents while a run is active, (3) whether the first MVP exposes retry/abort labels or only controls, and (4) whether a user-created thread is the unit that owns an ACP session. **STOP:** no chat mockup or implementation until these answers are recorded. Preserve the completed panel foundation layout; do not invent provider selectors or MCP toggles here.

## Goal

Connect the existing assistant-ui panel to a Rust ACP session for text-only streaming through `useExternalStoreRuntime`. Preserve ACP message semantics and keep the renderer free of ACP SDK/process/provider code.

## Exact likely files

- `apps/desktop/src/agent/acpThreadAdapter.ts` — external-store runtime, session/request filtering, abort mapping.
- `apps/desktop/src/agent/AssistantPanel.tsx` and `src/panels/AssistantPanelSurface.tsx` — runtime injection and configured/unavailable states after STOP.
- `apps/desktop/src/native/commands.ts` and new `src/native/acp.ts` — typed command/listen adapters.
- `apps/desktop/src/agent/acpThreadAdapter.test.ts`, `AssistantPanel.test.tsx`, and Tauri event adapter tests.
- `apps/desktop/src-tauri/src/commands/acp.rs` only for command/event DTO compatibility; lifecycle logic remains the host story.
- `apps/desktop/package.json` — remove `@agentclientprotocol/sdk` only after no source import remains.

## Rust/frontend contracts and event names

`onNew` calls `agent_prompt` with `{acpSessionId, threadId, text}`; abort maps to `agent_cancel({acpSessionId, requestId})`. Session creation/selection calls `agent_spawn`/`agent_session_new` through `src/native/acp.ts`.

Subscribe to `agent://session-update`, typed `{sessionId, requestId, sequence, update}`. MVP consumes only ACP text deltas and terminal/stop updates, appending text to one assistant `ThreadMessageLike` text part; `agent://error` is typed `{sessionId, requestId, code, message, retryable}`. Events for another session/request or a duplicate sequence are ignored. Unknown ACP updates are logged through a redacted adapter and not rendered. No renderer `@agentclientprotocol/sdk` import.

## Dependencies and order

1. AI contracts story.
2. ACP host can expose a mock/session command contract; use a fake event source before the real process.
3. Agent registry story provides detected agent state.
4. Product STOP above, then UI/runtime wiring.
5. History is intentionally separate and can follow this story.

## Tests

- Normal delta ordering and concatenation; duplicate/out-of-order/session-mismatched events.
- Cancel via `AbortSignal`, host error, disconnect, empty output, and retryable versus terminal error.
- Composer disabled/enabled state and accessible unavailable/error/loading states.
- No provider/ACP secret in `ThreadMessageLike`, adapter logs, or event fixture.
- No real process spawn in CI; mock Tauri commands/events only.

## Manual checks

Run a mock ACP agent and then a configured local agent. Send text, verify incremental output, abort, close/reopen the panel, and confirm another session's events cannot alter the transcript. Inspect the bundle for `@agentclientprotocol/sdk` after removal.

## Consent, local/cloud, and mobile constraints

ACP agent auth is agent-owned; Thinkbrain must not request or display its credential. Agent filesystem/terminal consent is not implemented here. Tauri Mobile uses the same adapter and assistant-ui runtime; verify soft-keyboard composer behavior, narrow panel scrolling, app suspension cancellation, and no desktop PATH assumptions.

## Acceptance criteria

- [ ] `useExternalStoreRuntime` maps only session-filtered ACP text deltas/terminal states into one assistant text part.
- [ ] Abort, disconnect, duplicate/out-of-order events, errors, unavailable state, and composer accessibility are deterministic and tested.
- [ ] Renderer has no ACP SDK/process/provider/secret path and mobile uses shared adapters safely.

## Automated validation

Run adapter/component/native-event tests with fake commands/events, package import scan, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: mock and approved local stream, abort, reopen, and cross-session filtering. Mobile: test keyboard, narrow scrolling, suspension cancellation, and unavailable state.

## Non-goals

No provider gateway, model chat, history persistence, tools/plans/MCP rendering, `session/request_permission`, context injection, host planning/editing/merge logic, arbitrary process execution, or extension installation.

## Handoff expectations

Deliver runtime adapter, fake event fixtures, component/accessibility tests, SDK-removal evidence, manual desktop/mobile report, and unresolved UX answers.
