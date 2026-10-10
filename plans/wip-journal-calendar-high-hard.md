# Journal & Calendar

> Optional, local-first journal + calendar built on ordinary Markdown notes.
> Read `plans/app-vision.md` and `extensions/beta_builtin_extensions` before
> starting a story. Decisions D1-D88 live in
> `journal-calendar/assets/journal_discovery_and_wireframes`; superseding
> decisions get new D-numbers, never edits to earlier ones.

## Gate — CLOSED

Every product question is answered (D1-D88) and all three mockups approved
(panel, mobile, calendar tab). All platform prerequisites shipped:
`tabs.open` (D69), the D44 editor-header slot, D45 workspace-scoped settings,
`listNotes`, and D41 metadata facets. What remains is the story work below.

## Goal

A user-approved journal workflow and calendar view as a built-in feature that
preserves Markdown-first, local-first, Git-friendly storage. Entries stay
normal `.md` files in a configurable folder. The feature surfaces its
assumptions, preserves unknown frontmatter, never rewrites notes on
index/open, and enters through existing registries and the built-in
extension boundary.

## Scope

- Journal Markdown/frontmatter contract, folder/naming rules, invalid-data
  behavior; metadata + calendar query models in `packages/core`.
- Journal service: date resolution, naming expansion, create-always-new
  (D18), backfill, listing with undated split (D36/D38), openToday, lazy
  previews. No templates (D21).
- One journal popout via `desktopExtensionHost` panel registration; the
  calendar is a canvas tab with no activity-bar entry (D27).
- Namespaced settings (D64): location, field definitions (D23/D45), calendar
  defaults — outside the vault.
- Mobile is the same `apps/desktop` webview; keyboard/screen-reader support
  required.

Non-goals: journal database/cloud/telemetry, editor replacement, AI entries,
sentiment/health claims, reminders, streaks, group-by (withdrawn D37),
built-in mood/activity taxonomies (D4), mobile navigation (shell-owned, D26).

## Boundaries

- `packages/core` frontmatter/markdown/note-model own parsing; workspace I/O
  via `workspaceDocumentAdapter`/`workspaceAdapter`; services take typed
  interfaces, never call Tauri directly.
- Rendering via `panelRegistry`/`LeftPopout`/`ActivityBar`/`DesktopShell`;
  registration via `desktopExtensionHost` disposable lifecycle. Ids fixed by
  D47: `journal-calendar` with locals `journal`, `calendar`, `new-entry`,
  `today`, `open-calendar`, `metadata-widget`.
- Metadata facets reuse the disposable platform index (D16/D41) — never a
  journal cache or full-file scan; degrade to browsing + date filters when
  the index is away.
- UI-facing stories follow per-artifact D34 sign-off; never settle an
  unanswered product question silently.

## Validation

Unit tests for model/service/aggregation; React tests for registration,
keyboard, focus, accessible names; `pnpm lint`, `pnpm typecheck`,
`pnpm test`; manual desktop + mobile checks per story.

## Status

Shipped: `plans/journal-calendar/done-summary.md`.

- ✅ Discovery/wireframes, data model + frontmatter contract, journal service,
  calendar model (`packages/core/src/journal/calendar.ts`), field editor +
  open vocabulary (D82-D84), extension-host integration
  (`extensions/builtins/journal.tsx` — panel, calendar tab, three commands,
  settings, metadata-widget).
- 🟨 `journal_settings_and_accessibility` — D64's four settings implemented;
  D23 per-id overlay unimplemented; settings UI waits on
  `extension_settings`; accessibility pass open.
- 🟨 `journal_panel_ui` — navigator, virtualization, previews, filters,
  metadata widget shipped; `Open folder…`/`Open settings` route and final
  state/focus checks remain.
- 🟨 `calendar_tab_ui` — grid, dots, keyboard, day filter, view persistence,
  phone layout shipped; grid metadata predicates remain (D41 unblocked).
- 🟨 `journal_mobile_refinement` — M-2 sheet, M-1 density, a11y checklist
  shipped; manual VoiceOver/TalkBack hardware pass remains.
- ⬜ `cleanup_mockup_assets` — delete the HTML mockups once the stories are done.
