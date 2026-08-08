# Technical Decisions

> Cross-cutting implementation decisions. Reference document, not an epic.
> Read alongside `plans/app-vision.md` for full context.

## Platform

Decision: Cross-platform, desktop-first.

- Frontend: React, TypeScript, Vite
- Desktop shell/native bridge: Tauri v2
- Backend/native code: Rust
- Mobile (Phase 2): Tauri Mobile for Android/iOS — same webview stack, not a
  separate app or codebase. Mobile is a build target of `apps/desktop/`
  (`tauri android init` / `tauri ios init`), reusing the full React frontend,
  `packages/ui`, CodeMirror 6, and Tauri adapters. `packages/core` never
  couples to desktop-only APIs.

### Known Tauri Mobile limitations

- Android keyboard / `visualViewport` issue (tauri-apps/tauri#10631) — webview
  viewport doesn't resize when soft keyboard opens. Must be worked around
  before mobile editing ships.
- CodeMirror 6 mobile quirks (Android scrolling, IME/Gboard, iOS touch
  selection) need explicit testing and likely fixes.
- Single webview only — not a problem for this app.

## Repository Structure

Decision: Workspace-style repo with platform-specific apps and shared packages.

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP, also the mobile build target
    src/            # React UI and frontend state (shared with mobile)
    src-tauri/      # Rust/Tauri native bridge (desktop + mobile targets)

packages/
  core/             # platform-agnostic logic and adapter interfaces
  ui/               # React (DOM) components — shared by desktop and mobile
```

No `apps/mobile/` directory. Don't split `packages/core` into many packages
until complexity justifies it.

## Package Manager

Decision: `pnpm` workspaces without Turborepo for MVP.

`pnpm` is stable and works well with Tauri/Vite/React. Turborepo can be added
later if build orchestration becomes painful.

## Editor

Decision: CodeMirror 6 directly for the Markdown editor.

Do not use Monaco or `@uiw/react-md-editor` unless explicitly changed.

## Storage

Decision: Markdown files are the source of truth.

- Notes are normal `.md` files; metadata uses YAML frontmatter.
- Attachments are normal files referenced by relative paths.
- No proprietary note format.
- Canvas documents (`.canvas` JSON) are the explicit non-Markdown vault-file
  exception — see `plans/pending-canvas-low-hard.md`. Canvas settings, cache,
  and viewport/session state remain outside the vault in OS app-data/config.

## Database and Indexes

Decision: SQLite FTS5 as a disposable cache for indexing and search.

- SQLite is never the source of truth; the index is rebuildable from workspace
  files.
- Database files live in OS app-data, not inside the workspace/vault.
- Implement through the Tauri/Rust layer so filesystem access, app-data paths,
  background work, and database behavior stay native and predictable.

## Search

Decision: MVP search supports Markdown text, filenames, tags, and aliases via
SQLite FTS5.

## Git

Decision: System Git for MVP.

Invoke installed Git binaries through the native layer. No embedded Git.

## Settings

Decision: Human-readable JSON settings.

Levels:
1. Application settings
2. Workspace settings (stored outside workspace, in OS app-data/config, keyed
   by workspace identity/path)
3. Extension settings — deferred until `extensions` epic; non-secret values
   reuse the registry through extension-scoped namespaces

Never place app settings files inside the user's workspace.

## Extensions

Decision: Trusted local, same-context JavaScript modules for the foreseeable
beta. Maintainability and easy development over hostile-extension isolation.
Built-ins ship first; local-directory loading is the primary dev path.

Capabilities are soft declarations and compatibility gates, not a security
sandbox. They document intended access and allow disabling/warning about
unsupported features. Defer install-from-URL, signing, marketplace/discovery,
and strong process/iframe isolation.

Non-secret extension settings reuse the JSON registry via extension-scoped
namespaced APIs, outside the workspace. Credentials never live in JSON — the
Rust layer uses the OS secret store. Encrypted app-data fallback is explicitly
deferred. See
`plans/extensions/pending-extension_secret_storage-med-hard.md`.

Every extension activation owns a disposable resource scope. Commands, panels,
event subscriptions, timers, file watchers, and background tasks are disposed
automatically on deactivation, unload, and failed activation.

## UI Components and Themes

Decision: `packages/ui` with reusable React components, Tailwind v4 utilities,
and `--tn-*` CSS token variables.

- shadcn/ui components built on Radix UI primitives where useful.
- No heavy, opinionated component framework that fights a desktop/editor UI.
- Theme tokens are CSS variables in `packages/ui/src/styles/tokens.css`,
  switched via `[data-thinkbrain-theme]`. Mobile uses the same tokens.
- No inline styles for static styling — use Tailwind utilities. Dynamic
  computed values (tree-depth padding, pixel positioning) are acceptable
  exceptions. Runtime panel dimensions use scoped CSSOM custom properties on
  the shell root, not JSX `style` props.
- Built-in themes and tokens for MVP. Third-party theme packages deferred
  until `extensions` epic.

### Desktop shell visual system

Decision: React components with Tailwind utilities, shared `--tn-*` tokens,
existing stores, and real feature boundaries. Do not restore the older
movable-action/slot layout design.

Chrome-specific semantic surfaces in the token set: title bar, activity bar,
sidebar, editor, panel, status bar, and active/inactive tabs (light + dark).

Browser tabs are registered as an unavailable tab kind until a separate
security decision approves a Tauri webview strategy, navigation policy, and
CSP/capability boundary. No raw iframe shortcut.

Production lint covers `apps/` and `packages/` without suppressing errors.

## AI

Decision: AI is optional, implemented only through the `ai` epic.

- Desktop agent chat uses `@assistant-ui/react` with
  `useExternalStoreRuntime`. Renderer owns message state and consumes typed
  Tauri events directly — no transport/provider-abstraction layer in the
  renderer.
- ACP is the host-to-agent protocol, lives in Rust via the
  `agent-client-protocol` crate. Rust owns the full ACP client lifecycle
  (`initialize`, `session/new`, `session/prompt`, `session/update`,
  `session/cancel`, later `session/request_permission`) and emits typed Tauri
  events filtered by session ID. Renderer never imports
  `@agentclientprotocol/sdk`.
- Rust/native gateway owns provider calls, cancellation, credentials, and
  outbound network policy. Renderer never stores/receives provider secrets.
  Chat history stored locally in OS app-data; Assistant Cloud off by default.
- Host is deterministic — does not duplicate agent reasoning or merge
  conflicts. ACP filesystem/terminal permission separately requested and
  enforced by native host (allow once / always / deny).
- Cloud model use and sending note/workspace context require explicit consent.

ACP permission requests carry agent-provided options and tool-call updates per
session. Renderer presents the information; native host enforces the user's
answer and does not reconstruct an agent plan.

## State Management

Decision: Zustand for MVP app/UI state.

Lightweight and appropriate for editor tabs, active workspace/document state,
sidebar state, indexing status, and settings.

## Frontmatter Mutation Policy

Decision: Opening, indexing, or searching a note must not rewrite it.

- `created_at` set on new note creation if field is missing.
- `updated_at` updated on explicit user save through the app.
- Indexing and opening must not update timestamps.
- Unknown frontmatter fields must be preserved.
