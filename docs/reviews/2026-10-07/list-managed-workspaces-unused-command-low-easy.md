# `list_managed_workspaces` is registered and typed but never invoked from the renderer

- **Urgency:** low
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src-tauri/src/commands/workspace_managed.rs`
- **Lines:** 96–100 (registered at `commands/mod.rs:61`, typed at `native/commands.ts:49–52`)

## Description

A repo-wide grep finds no production renderer call to
`invokeNativeCommand("list_managed_workspaces", ...)` — only a test harness
mock (`shell/phone/PhoneShell.testHarness.tsx:71`). The workspace manager UI
uses `list_known_workspaces`, which calls `list_managed_workspaces_in` on the
Rust side directly (`workspace_known.rs:68`), so the command's only function
is duplicated by an internal helper.

`commands/mod.rs:17-23` states the policy explicitly: "an unused command is
deletable like any dead code" — the registered IPC surface should not carry
endpoints nothing calls.

## Recommendation

Delete the `#[tauri::command]` wrapper (`pub fn list_managed_workspaces`),
keep `list_managed_workspaces_in` as the shared internal helper, remove the
`NativeCommandMap` entry in `native/commands.ts`, the `mod.rs` registration
line, and bump the `APP_COMMAND_PATHS` count from 60 to 59.

## Verification

`grep -rn "list_managed_workspaces" apps/desktop/src` returns only
`native/commands.ts` (the type map) and the PhoneShell test harness mock —
no caller.
