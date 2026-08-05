# Technical Decisions

> Cross-cutting implementation decisions. This is a reference document, not an
> epic. Read alongside `plans/app-vision.md` for full context.

## Platform

Decision: Build a cross-platform application, desktop-first.

- Frontend: React, TypeScript, Vite
- Desktop shell/native bridge: Tauri v2
- Backend/native code: Rust
- Mobile (Phase 2): Tauri Mobile for Android/iOS — same webview stack as
  desktop, not a separate app

Mobile is a responsive variant of the desktop app, not a separate codebase.
Tauri v2 Mobile uses the same webview as desktop, so the entire React frontend,
`packages/ui`, CodeMirror 6, and the adapter pattern are reused. Mobile is a
build target of `apps/desktop/` (via `tauri android init` / `tauri ios init`),
not a separate `apps/mobile/` directory. The shared-core architecture and
platform adapter interfaces are designed from day one so that `packages/core`
never couples to desktop-only APIs; mobile reuses the same Tauri adapters as
desktop (no separate Expo/native adapters).

### Known Tauri Mobile limitations

- Android keyboard / `visualViewport` issue (tauri-apps/tauri#10631) affects
  text editing — the webview viewport does not resize correctly when the soft
  keyboard opens. Must be verified and worked around before mobile editing
  ships.
- CodeMirror 6 mobile quirks (Android scrolling, IME/Gboard, iOS touch
  selection) need explicit testing and likely fixes.
- Single webview only — not a problem for this app.

## Repository Structure

Decision: Use a workspace-style repository with platform-specific apps and
shared packages.

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP, also the mobile build target
    src/            # React UI and frontend state (shared with mobile)
    src-tauri/      # Rust/Tauri native bridge (desktop + mobile targets)

packages/
  core/             # platform-agnostic logic and adapter interfaces
  ui/               # React (DOM) components — shared by desktop and mobile
```

There is no `apps/mobile/` directory. Mobile is a Tauri Mobile build target of
`apps/desktop/` (via `tauri android init` / `tauri ios init`), using the same
webview, the same React frontend, the same `packages/ui`, and the same Tauri
adapters. Mobile uses the same CSS design tokens as desktop — there is no
separate token mapping or `StyleSheet` layer.

Do not split `packages/core` into many packages until the codebase has enough
complexity to justify it.

## Package Manager and Build Orchestration

Decision: Use `pnpm` workspaces without Turborepo for MVP.

- `pnpm` is stable, widely supported, and works well with Tauri/Vite/React.
- Bun is fast, but `pnpm` is the safer default for broad dependency compatibility.
- Turborepo can be added later if build orchestration becomes painful.

## Editor

Decision: Use CodeMirror 6 directly for the Markdown editor.

Do not use Monaco or `@uiw/react-md-editor` unless this decision is explicitly
changed.

## Storage

Decision: Markdown files are the source of truth.

- Notes are normal `.md` files.
- Metadata uses YAML frontmatter.
- Attachments are normal files referenced by relative paths.
- No proprietary note format is allowed.

## Database and Indexes

Decision: Use SQLite FTS5 as a disposable cache for indexing and search.

- SQLite must never be the source of truth.
- The index must be rebuildable from workspace files.
- Database files must be stored in the OS application-data directory, not inside
  the workspace/vault.
- Prefer implementing SQLite/indexing through the Tauri/Rust layer so filesystem
  access, app-data paths, background work, and database behavior stay native and
  predictable.

## Search

Decision: MVP search supports Markdown text, filenames, tags, and aliases using
SQLite FTS5.

## Git

Decision: Use system Git for MVP.

- Invoke installed Git binaries through the desktop/native layer.
- Do not implement embedded Git for MVP.

## Settings

Decision: Use human-readable JSON settings.

Settings levels:
1. Application settings
2. Workspace settings stored outside the workspace
3. Extension settings, deferred until the `extensions` epic is active; when
   implemented, non-secret values reuse the registry through extension-scoped
   namespaces

Workspace settings must live in the OS application-data/config area, keyed by
workspace identity/path. Do not place app settings files inside the user's
workspace.

## Extensions

Decision: For the foreseeable beta, extensions are trusted local, same-context
JavaScript modules. Maintainability and easy development take priority over
hostile-extension isolation. Built-ins ship first; local-directory development
loading is the primary development path, and later install-from-file may warn
that an extension runs with app privileges.

Capabilities are soft declarations and compatibility gates, not a security
sandbox. They document intended access, allow the app to disable or warn about
unsupported features (including platform-specific features), and must not be
presented as adversarial isolation. Defer install-from-URL, signing,
marketplace/discovery, and strong process/iframe isolation.

Non-secret extension settings reuse the existing JSON settings registry through
extension-scoped, namespaced APIs and remain outside the workspace. Credentials
never live in JSON: the Rust/native layer uses the OS secret store through
platform adapters. An encrypted app-data fallback is an explicitly deferred
security decision, not an assumed or current storage path. APIs return scoped
operations and never bulk/raw cross-extension secrets. See
`plans/extensions/pending-extension_secret_storage-med-hard.md`.

Every extension activation owns a disposable resource scope. Commands, panels,
event subscriptions, timers, file watchers, background tasks, and other
registered resources must be disposed automatically on deactivation, unload, and
failed activation.

## UI Components and Themes

Decision: Build `packages/ui` early using reusable React components, CSS
variables, and accessibility-focused primitives.

- Use custom app components backed by Radix UI-style primitives where useful.
- Avoid a heavy, opinionated component framework that fights a desktop/editor UI.
- Theme tokens should be CSS variables.
- No inline styles (`style={{}}` or `<style>` in JSX). Use CSS Modules
  (`*.module.css`) co-located with components. Shared tokens/themes as CSS
  variables in `packages/ui`. Mobile uses the same CSS tokens as desktop
  (same webview, no `StyleSheet` layer).

MVP may include built-in themes and theme tokens. Third-party theme packages are
deferred until the `extensions` epic is active.

### Mockup v3 adoption

Decision: `mockup_v3/` is the visual and interaction reference for the desktop
shell, not production code or a package dependency. Translate its Tailwind v4
classes and mock state to React components with co-located CSS Modules, shared
`--tn-*` tokens, existing stores, and real feature boundaries. Do not restore
the older movable-action/slot design from `mockup2.htm`.

The shared token set includes chrome-specific semantic surfaces: title bar,
activity bar, sidebar, editor, panel, status bar, and active/inactive tabs in
both light and dark themes. Runtime panel dimensions are the sole exception to
the no-inline-styles rule: write scoped custom properties through CSSOM on the
shell root; do not use JSX `style` props.

Browser tabs are registered as an unavailable tab kind until a separate
security decision approves a Tauri webview strategy, navigation policy, and
capability/CSP boundary. Do not use a raw iframe as a shortcut.

The standalone reference application is not part of the production workspace
or its quality gate. Root ESLint ignores `mockup_v3/`; its separate toolchain
may be run deliberately when the reference itself changes. Production lint
continues to cover `apps/` and `packages/` without suppressing errors.

## AI

Decision: AI remains optional and is implemented only through the `ai` epic.

- Desktop agent chat uses `@assistant-ui/react` with
  `useExternalStoreRuntime`. The renderer owns message state and consumes
  typed Tauri events directly; there is no transport/provider-abstraction
  layer in the renderer.
- ACP is the host-to-agent protocol and lives in Rust, using the official
  `agent-client-protocol` Rust crate. Rust owns the full ACP client lifecycle
  (`initialize`, `session/new`, `session/prompt`, `session/update`,
  `session/cancel`, later `session/request_permission`) and emits typed Tauri
  events filtered by session ID. The renderer never imports
  `@agentclientprotocol/sdk`.
- The Rust/native gateway owns provider calls, cancellation, credentials, and
  outbound network policy. Renderer code never stores or receives provider
  secrets. Chat history is stored locally in OS app-data through an
  assistant-ui history adapter; Assistant Cloud is off by default.
- The host is deterministic and does not duplicate agent reasoning or merge
  conflicts. ACP filesystem/terminal permission is separately requested and
  enforced by the native host (allow once / always / deny).
- Cloud model use and sending note/workspace context require explicit consent.

ACP permission requests carry the agent-provided options and tool-call update
for a specific session. The renderer presents the information; the native ACP
host enforces the user's answer and does not reconstruct an agent plan.

## Proposed Confirmations for Mockup v3

These are the recommended defaults reflected in `ui-shell` and `ai`; confirm
them before implementation begins because changing any one expands the work.

1. **Styling:** keep CSS Modules and shared `--tn-*` tokens. Do not adopt
   Tailwind in production just because the mockup uses it.
2. **Dynamic panel widths:** use scoped CSSOM custom-property updates, not JSX
   inline styles or a finite set of `data-*` width buckets.
3. **Desktop chat transport:** use custom Tauri IPC/native-event transport,
   not a local HTTP server or an assumed `/api/chat` endpoint.
4. **AI versus ACP:** ship model chat and explicit ACP Agent sessions as
   separate modes that share assistant-ui presentation but not a wire protocol.
5. **Browser tabs:** retain an unavailable tab placeholder until a dedicated
   webview security, navigation, and CSP/capability decision is approved.
6. **Extensions panel:** render a clearly unavailable panel; do not pull
   marketplace/installation work forward from the `extensions` epic.

## Sync

Decision: Built-in cloud sync is deferred.

The project follows Bring Your Own Sync. MVP must avoid storing app caches in the
workspace so users can safely use external sync tools.

## State Management

Decision: Use Zustand for MVP app/UI state.

Zustand is lightweight, simple, and appropriate for editor tabs, active
workspace/document state, sidebar state, indexing status, and settings state.

## Frontmatter Mutation Policy

Decision: Opening, indexing, or searching a note must not rewrite the note.

The app manages `created_at` and `updated_at` frontmatter fields during explicit
note creation/save operations:
- `created_at` is set when the app creates a new note if the field is missing.
- `updated_at` is updated when the user explicitly saves a note through the app.
- Indexing and opening a note must not update timestamps.
- Unknown frontmatter fields must be preserved.
