# Assistant UI Desktop Thread and Local History

## Status

⬜ UI/runtime history story; separate from ACP streaming and provider transport.

## Product questions — STOP before UI

Decide: (1) whether history is one global thread list or workspace-scoped, (2) how users create/rename/delete/clear a thread, (3) whether deleting history also closes an ACP session, (4) whether assistant metadata/tool activity is visible in the first history list, and (5) whether history is retained on mobile logout/uninstall. **STOP:** no history mockup or implementation until answers are recorded. Do not use Assistant Cloud, browser storage, or vault files.

## Goal

Use assistant-ui `AssistantRuntimeProvider`/`useExternalStoreRuntime` with a Tauri-backed local `ThreadHistoryAdapter` that persists explicit/completed turns and session links in OS app-data.

## Exact likely files

- `apps/desktop/src/agent/acpThreadAdapter.ts` — consume history without owning a second transcript store.
- `apps/desktop/src/agent/threadHistoryAdapter.ts` — adapter serialization, save/load/delete/clear.
- `apps/desktop/src/agent/AssistantPanel.tsx`, `src/panels/AssistantPanelSurface.tsx` — runtime and history states after STOP.
- `apps/desktop/src/native/commands.ts` and `src/native/ai.ts` — typed app-data history commands.
- `apps/desktop/src-tauri/src/ai/history.rs` — app-data path, atomic versioned persistence, size limits/redaction.
- `apps/desktop/src-tauri/src/commands/ai.rs`, `commands/mod.rs`, `lib.rs` — command registration.
- `apps/desktop/src/agent/threadHistoryAdapter.test.ts`, `AssistantPanel.test.tsx`, Rust history tests, and migration fixtures.

## Contracts and typed boundaries

Commands: `ai_list_threads`, `ai_read_thread({threadId})`, `ai_save_thread({threadId, messages, metadata})`, `ai_delete_thread`, `ai_clear_threads`. Persist `ThreadMessageLike` only after explicit save or completed turn; metadata contains mode/provider/model/session link IDs but no credential, full context payload, raw tool secret, or unredacted error. Use versioned schema, atomic write, bounded message count/bytes, and typed `history_corrupt`, `history_too_large`, and `history_unavailable` errors.

One UI thread can link one ACP session via `AgentSessionLink`, but transcript and ACP protocol semantics remain distinct. Do not persist every streaming delta unless product approves; save the final redacted assistant turn and user turn after completion.

## Dependencies and order

- AI contracts first.
- Text streaming/agent session IDs provide runtime data.
- Native app-data settings conventions and product STOP.
- History can land before permissions/context; it must redact future tool/context parts conservatively.

## Tests

Round-trip messages/metadata, atomic failure recovery, corrupt/old-version migration, size limits, secret/context redaction, cancel/error partial-turn policy, concurrent saves, thread/session link restoration, delete/clear, and no vault/browser/cloud writes. Renderer tests restore transcript, loading/error/empty states, keyboard/focus/narrow panel, and ensure no duplicate store.

## Manual checks

Create/send/cancel/error/reopen threads, restart desktop and restore history, delete/clear, corrupt the app-data file, inspect vault and browser storage, and verify no secret/content leaks to logs. Test mobile rotation, keyboard, app suspension, and storage quota/uninstall policy after product decision.

## Consent, local/cloud, and mobile constraints

History is local-only by default and is not consent to send content remotely. Remote context must be omitted/redacted before persistence unless explicitly approved by the product policy. Tauri Mobile reuses the adapter and app-data location but must handle OS backup/uninstall semantics and constrained storage explicitly.

## Acceptance criteria

- [ ] Approved thread/history workflow is implemented through assistant-ui and one bounded app-data adapter.
- [ ] Save/load/delete/clear, corruption/size errors, redaction, session links, and no-duplicate-store behavior are tested.
- [ ] Desktop/mobile focus, keyboard, narrow layout, suspension, storage limits, and approved retention behavior are verified.

## Automated validation

Run history/core/native/component tests, migration/atomic-write fixtures, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Manual desktop/mobile checks

Desktop: create/send/cancel/error/reopen/restart/delete/clear and corrupt-file recovery; inspect vault/browser storage/logs. Mobile: rotation, keyboard, suspension, quota, and approved uninstall behavior.

## Non-goals

No Assistant Cloud, sync, vault history files, provider gateway, ACP lifecycle, permission policy, prompt/context injection, or UI design before STOP.

## Handoff expectations

Deliver approved history mockups/decision record, schema/migration contract, adapter/tests, redaction/retention report, and unresolved user questions.
