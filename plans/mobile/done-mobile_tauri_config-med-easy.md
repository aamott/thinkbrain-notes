# Story: Mobile Tauri Config

**Status:** ✅ done · **Urgency:** medium · **Difficulty:** easy

## Goal

Configure mobile-specific Tauri settings and platform capability declarations.
Desktop-only commands (terminal, process-spawn) are unavailable on mobile and
must not be invoked there. Declarations are soft compatibility/unavailable
behavior, not security enforcement.

## Approach

A single `platform_capabilities` Tauri command reports what the current
platform can serve. The renderer reads it on boot and uses it to downgrade
commands whose `requires` field names a capability the platform lacks — the
palette shows them greyed-out with a message rather than silently failing.

This is **not** a security sandbox. The Rust side remains the authority for
every command; if a renderer bypasses the gate and invokes anyway, the command
returns its normal error. Commands already stubbed at the Rust level (sync
credentials on Android) do not need a renderer gate — the stub *is* the
declaration.

No `tauri.android.conf.json` / `tauri.ios.conf.json` needed: the single
`tauri.conf.json` works for all platforms. Platform differences are handled by
`cfg!` macros in Rust, not by config file splits.

## Acceptance Criteria

- [x] Mobile builds report desktop-only commands (terminal, process-spawn) as
      unavailable and do not invoke them.
- [x] Capability declarations are documented and handled as soft compatibility
      signals, not a security sandbox or hostile-extension boundary.
- [x] Desktop builds are unchanged.
- [x] `pnpm qa` passes.

## What shipped

- **Rust**: `platform_capabilities` command in `workspace_managed.rs`, reports
  `canSpawnProcess`, `hasKeychain`, `canOpenFolder`, `canCreateManagedWorkspace`,
  `opensWorkspaceInNewWindow`. All driven by `cfg!` macros.
- **Frontend**: `usePlatformCapabilities` Zustand store
  (`native/platformCapabilities.ts`) loads capabilities on boot.
  `DesktopCommand` gains a `requires?: PlatformCapability` field;
  `useDesktopCommands` downgrades commands whose required capability is absent
  to `unavailable` with a platform-appropriate message.
- **`toggle-bottom-panel`** marked `requires: "canSpawnProcess"` — the terminal
  dock is the only bottom panel surface and needs process spawning.

## References

- `plans/pending-mobile-med-hard.md` — capability gating decision
- `plans/pending-extensions-low-hard.md` — platform-aware capabilities
- `apps/desktop/src-tauri/src/commands/workspace_managed.rs` — Rust command
- `apps/desktop/src/native/platformCapabilities.ts` — frontend store
- `apps/desktop/src/commands/commandRegistry.ts` — command gating
