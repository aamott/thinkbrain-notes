# Technical Decisions

> Cross-cutting implementation decisions. This is a reference document, not an
> epic. Read alongside `plans/app-vision.md` for full context.

## Platform

Decision: Build a cross-platform application, desktop-first.

- Frontend: React, TypeScript, Vite
- Desktop shell/native bridge: Tauri v2
- Backend/native code: Rust
- Mobile (Phase 2): React Native via Expo for Android/iOS

Mobile implementation is deferred, but the shared-core architecture and
platform adapter interfaces are designed from day one so that `packages/core`
never couples to desktop-only APIs.

## Repository Structure

Decision: Use a workspace-style repository with platform-specific apps and
shared packages.

```text
apps/
  desktop/          # Tauri + React (DOM) — MVP
    src/
    src-tauri/
  mobile/           # React Native (Expo) — Phase 2, not scaffolded during MVP
    src/

packages/
  core/             # platform-agnostic logic and adapter interfaces
  ui/               # React (DOM) components — consumed by apps/desktop only
```

`apps/mobile/` must NOT be scaffolded or implemented until the `mobile` epic is
active. `packages/ui` contains React DOM components and is not directly usable
by React Native. Shared design tokens (colors, spacing, typography scales) live
in `packages/core` so both platforms can reference them.

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
3. Extension settings, deferred until the `extensions` epic is active

Workspace settings must live in the OS application-data/config area, keyed by
workspace identity/path. Do not place app settings files inside the user's
workspace.

## Extensions

Decision: MVP supports internal contribution points only.

Do not build third-party extension execution, install-from-URL, sandboxing,
signing, or marketplace features until the `extensions` epic is active.

V1 extension permissions: strict capability-based sandbox. No unrestricted
filesystem access.

## UI Components and Themes

Decision: Build `packages/ui` early using reusable React components, CSS
variables, and accessibility-focused primitives.

- Use custom app components backed by Radix UI-style primitives where useful.
- Avoid a heavy, opinionated component framework that fights a desktop/editor UI.
- Theme tokens should be CSS variables.
- No inline styles (`style={{}}` or `<style>` in JSX). Use CSS Modules
  (`*.module.css`) co-located with components. Shared tokens/themes as CSS
  variables in `packages/ui`. React Native (Phase 2): use `StyleSheet`.

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

- Desktop model chat uses `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`,
  `ai@^7`, and `@ai-sdk/react@^4` as one compatible UI/transport stack.
- Tauri has no built-in HTTP chat route. Use a typed custom AI SDK
  `ChatTransport` over Tauri IPC and native events; do not spawn an unauthenticated
  local HTTP server merely to satisfy a `/api/chat` default.
- The Rust/native gateway owns provider calls, cancellation, credentials, and
  outbound network policy. Renderer code never stores or receives provider
  secrets. Chat history is stored locally in OS app-data through an
  assistant-ui history adapter; Assistant Cloud is off by default.
- ACP is a distinct host-to-agent protocol, not an AI SDK replacement. Use the
  official Rust ACP runtime crate at the native capability boundary and map
  explicit agent sessions to UI threads. The host is deterministic and does not
  duplicate agent reasoning or merge conflicts.
- Cloud model use and sending note/workspace context require explicit consent.
  ACP filesystem/terminal permission is separately requested and enforced by
  the native host (allow once / always / deny).

The current SDK contracts reinforce this separation: AI SDK custom transports
implement `sendMessages` and return UI-message chunk streams, whereas ACP
permission requests carry the agent-provided options and tool-call update for a
specific session. The renderer presents the information; the native ACP host
enforces the user's answer and does not reconstruct an agent plan.

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
