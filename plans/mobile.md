# Mobile

> React Native (Expo) mobile app — a future epic, not yet started. Read
> `plans/app-vision.md` and `plans/technical-decisions.md` (Platform section)
> before starting any story here.

## Goal

Ship a privacy-first mobile companion app (Android/iOS) that reuses the
platform-agnostic business logic in `packages/core` and provides mobile-native
screens for browsing, editing, and searching Markdown workspaces. The mobile app
is a peer to `apps/desktop`, not a port of it: it has its own React Native UI and
its own platform adapters, sharing only `packages/core`.

## Scope

In scope:

- `apps/mobile` scaffold (React Native via Expo)
- Platform adapter implementations for mobile against the core adapter
  interfaces: FileSystem, Search, AppPaths, Git, Settings
- Mobile-specific screens and navigation (stack/tab — do not force desktop
  panels onto phone layouts)
- Shared core logic wiring via `packages/core`
- Mobile-native editor surface for Markdown notes

Non-goals (deferred or out of scope for this epic):

- feature parity with every desktop panel
- cloud sync / built-in sync service (Bring Your Own Sync applies)
- tablet-specific layouts (phone-first; tablet later)
- publishing to app stores (build/ship pipeline is a later concern)

## Architecture Decisions

### Hub and spoke, same as desktop

`packages/core` holds all platform-agnostic logic and must never depend on React
Native, DOM, or Node-only APIs. `apps/mobile` implements platform adapters
against the interfaces defined in `packages/core`, exactly as `apps/desktop`
does. This is the same hub-and-spoke contract described in `app-vision.md` and
`technical-decisions.md`.

### Separate UI layer

`packages/ui` is React DOM and is consumed only by `apps/desktop`. The mobile
app has its own React Native UI in `apps/mobile/src/`. Shared design tokens
(colors, spacing, typography) live in `packages/core` so both platforms can
reference them; mobile maps them to `StyleSheet` values rather than CSS
variables (per the Styling rule in `AGENTS.md`).

### Platform adapter contract

`packages/core` defines TypeScript interfaces that abstract native capabilities:
`FileSystemAdapter`, `SearchAdapter`, `AppPathsAdapter`, `GitAdapter`,
`SettingsAdapter`. Each platform provides its own implementation. Mobile maps
these to Expo/React Native equivalents:

- FileSystem → `expo-file-system`
- Search → `expo-sqlite` (FTS5 cache, same ephemeral-cache discipline as desktop)
- AppPaths → Expo app-data directories
- Git → `isomorphic-git` or deferred further (see story)
- Settings → `AsyncStorage` / Expo SecureStore

### Prerequisite: core adapter interfaces must exist first

This epic depends on the core adapter interfaces being defined in
`packages/core`. **Note:** as of this writing those interfaces are described in
`technical-decisions.md` but are not yet present in `packages/core/src/` — the desktop app currently calls Tauri
directly via `invokeNativeCommand` (`apps/desktop/src/native/commands.ts`).
Before any mobile story starts, the adapter interfaces must be introduced in
`packages/core` and the desktop app refactored onto them. This cross-cutting
refactor is tracked as a maintenance story:
`plans/maintenance/pending-core_adapter_interfaces-low-hard.md`.

### Bring Your Own Sync

No cloud sync. Mobile users rely on the same external sync tools
(OneDrive/Syncthing/Git) as desktop. App caches/settings never go in the vault.

## Dependencies

- Core adapter interfaces defined in `packages/core` (see prerequisite note
  above — not yet satisfied).
- `packages/core` business logic (note model, frontmatter, markdown parsing,
  settings shapes) — already present and platform-agnostic.

No other epic blocks this one, but it should not start until the adapter
interface prerequisite is resolved.

## Status

- ⬜ Core adapter interfaces in `packages/core` (prerequisite — tracked in `plans/maintenance/`)
- ⬜ `apps/mobile` scaffold (Expo + React Native) — `apps/mobile/`
- ⬜ Mobile FileSystem adapter (`expo-file-system`)
- ⬜ Mobile Search adapter (`expo-sqlite` FTS5 cache)
- ⬜ Mobile AppPaths adapter (Expo app-data directories)
- ⬜ Mobile Git adapter (`isomorphic-git` or deferred)
- ⬜ Mobile Settings adapter (`AsyncStorage` / Expo SecureStore)
- ⬜ Mobile screens and navigation (stack/tab, phone-first)
- ⬜ Mobile Markdown editor surface
- ⬜ Shared `packages/core` wiring and design-token mapping
