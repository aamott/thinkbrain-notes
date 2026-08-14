- name: Core workspace/file types diverged from desktop Native* types — dead scaffold
- file: /media/adam/extex/projects/thinkbrain-notes/packages/core/src/index.ts (and apps/desktop/src/native/commands.ts)
- lines: index.ts 1-62; commands.ts 35-99, 289-314; settings.ts 48-53, 80-85
- description: Cross-cutting issue spanning `packages/core/src/index.ts`, `packages/core/src/settings.ts`, and `apps/desktop/src/native/commands.ts`.

  Core declares platform-agnostic workspace/file types: `WorkspaceDescriptor`, `MarkdownFileEntry`, `MarkdownFileContents`, `WorkspaceEntry`, `WorkspaceSnapshot`. The desktop layer defines parallel `Native*` types (`NativeWorkspaceDescriptor`, `NativeMarkdownFileEntry`, `NativeMarkdownFileContents`, `NativeWorkspaceEntry`, `NativeWorkspaceSnapshot`) that mirror the Rust serde shapes (snake_case). No adapter converts between the two — the desktop layer uses `Native*` end-to-end, and the core types are only referenced by `packages/core/src/index.test.ts`.

  Additionally, the following core index scaffold exports are referenced only by `packages/core/src/index.test.ts` and have no production consumer across the whole repo (verified by grep over `apps/` and `packages/`):

  - `AppPlatform` (line 1) — no caller.
  - `AppIdentity` (line 3) + `appIdentity` (line 52) — only in `index.test.ts`.
  - `DesignTokenNames` (line 8) + `designTokenNames` (line 57) — only in `index.test.ts`. The desktop layer reads `--tn-*` tokens directly from CSS; it never imports these names.
  - `WorkspaceDescriptor` (line 15) — only used inside `WorkspaceSnapshot` (line 47), which itself is unused in production.
  - `MarkdownFileEntry` (line 20) — desktop uses its own `NativeMarkdownFileEntry` (snake_case from Rust) in `apps/desktop/src/native/commands.ts`.
  - `MarkdownFileContents` (line 28) — desktop uses `NativeMarkdownFileContents`.
  - `WorkspaceEntry` (line 36) — desktop uses `NativeWorkspaceEntry`.
  - `WorkspaceSnapshot` (line 46) — desktop uses `NativeWorkspaceSnapshot`.

  These were early scaffold types anticipating a platform-agnostic workspace contract, but the desktop layer evolved its own `Native*` shapes that map 1:1 to Rust serde output. The core types now act only as test fixtures. They are not strictly dead (tests reference them) but they are unused production API that misleads readers into thinking there is a cross-platform contract in use.

  Separately, `packages/core/src/settings.ts` (lines 48-53, 80-85) declares a `WorkspaceSettings` interface and `DEFAULT_WORKSPACE_SETTINGS` constant with shape `{ version; editor: { defaultFolder: string | null } }`. The desktop app defines a **different** `WorkspaceSettings` and `DEFAULT_WORKSPACE_SETTINGS` in `apps/desktop/src/workspace/workspaceSettings.ts` with shape `{ showHidden: boolean; ... }`. Every import of `DEFAULT_WORKSPACE_SETTINGS`/`WorkspaceSettings` in `apps/` resolves to the desktop module, never to core. The core versions are referenced only by core tests. They are dead production code. The name collision is a latent hazard: a future `import { WorkspaceSettings } from "@thinkbrain/core"` in the desktop layer would silently pick up the wrong shape.

  This means:
  1. The core workspace contract is unused production code.
  2. There is no actual platform-agnostic abstraction layer in use — the "platform-agnostic" claim in `packages/core/AGENTS.md` is aspirational for these types, not realized.
  3. The `WorkspaceSettings` name collides between core (`editor.defaultFolder`) and desktop (`showHidden`).

  Suggested action: decide whether core should own the workspace/file contract (and the desktop layer adapt `Native*` → core) or whether the desktop layer owns it (and core drops the unused types). The current state is the worst of both: core carries the types and tests but no consumer, and the desktop layer has divergent namesakes. Pick one direction and remove the other. If removing: drop the core `WorkspaceSettings` interface and `DEFAULT_WORKSPACE_SETTINGS` constant (and any core tests for them), drop the unused scaffold types/constants (`AppPlatform`, `AppIdentity`, `appIdentity`, `DesignTokenNames`, `designTokenNames`, `WorkspaceDescriptor`, `MarkdownFileEntry`, `MarkdownFileContents`, `WorkspaceEntry`, `WorkspaceSnapshot`) and their tests. The desktop layer owns workspace settings and file types now. If a platform-agnostic contract is needed later, reintroduce it under distinct names.

- verification: Grepped all five core type names across `apps/` — 0 non-`Native` matches. Read `apps/desktop/src/native/commands.ts` lines 35-99 and 289-314 confirming `Native*` definitions. Read `packages/core/src/index.test.ts` confirming it is the only consumer. Grepped `\bMarkdownFileEntry\b|\bMarkdownFileContents\b|\bWorkspaceEntry\b|\bWorkspaceSnapshot\b|\bWorkspaceDescriptor\b|\bappIdentity\b|\bdesignTokenNames\b|\bAppPlatform\b|\bAppIdentity\b|\bDesignTokenNames\b` across `apps/` — 0 matches. Grepped `DEFAULT_WORKSPACE_SETTINGS|WorkspaceSettings\b` across `apps/` — all matches resolve to `apps/desktop/src/workspace/workspaceSettings.ts` or its consumers (WorkspaceExplorer.tsx, workspaceSettingsFile.ts, settingsStore.ts, workspaceSettingsSerialization.ts and their tests). No `@thinkbrain/core` import pulls these symbols into the desktop app.
- savings: ~38 lines (types + constants + corresponding test lines) if removed.
