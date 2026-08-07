# Story: Journal Panel UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D9** — Popout is a NAVIGATOR. Entries open in the main editor as normal tabs; rows show date, time, first line.
- **D13** — List virtualization required (scale target: thousands of entries).
- **D15** — Popout body is a grouped list, never a calendar widget.
- **D16/D41** — Full-text search and auto-populated metadata facets reuse the platform index. No journal cache or full-file-scan fallback. When filters are active, emphasize them with count badge + chip row + "showing N of M"; a muted indicator is a defect.
- **D18** — "New entry" always creates a new file; never reopens or appends.
- **D22** — A new entry contains frontmatter with the date only; fields are NOT pre-seeded.
- **D24** / **D11** — Metadata widget sits above the editor body and starts COLLAPSED.
- **D25** — Clicking a day in the calendar filters the popout list; calendar and popout share filter state.
- **D28** — Metadata widget appears for any note in the journal folder OR any note anywhere that already carries the configured fields.
- **D31** — Keyboard operation and screen-reader compatibility are must-haves. Focus order for the popout is specified in the discovery story. High contrast is OUT OF SCOPE (themes own it); use `--tn-*` tokens only.
- **D33** — The only requirement to be an entry is a parseable date in the filename. Malformed frontmatter does NOT disqualify an entry; opening must not rewrite it. Show a non-blocking notice; never trigger a repair on open.
- **D35** — Collapsed metadata renders as a DATELINE (`Wednesday, August 5 · good · 7 · running`). Warmth from space and typography only. No new color tokens, no mood-color mapping, no emoji vocabulary, no paper texture, no handwriting faces, no wellness/therapeutic framing.
- **D36** — Pinned, collapsed "Undated" group at the TOP of the list with a count (absent when empty). Undated files ordered by mtime. Non-Markdown files are HIDDEN from the popout. Announce as a category, never an error.
- **D37** — **IA-3**: flat stream, collapsible NON-INDENTED headers, group-by control REMOVED. Remaining list controls are full-text search and metadata filter ONLY.
- **D39** — Collapsible headers: year + month, both collapsible, no indentation. Distinguish levels by weight/size/case/background, never by padding.
- **D43** — Multiple metadata predicates must match within one entry; filtered list/counts use matching entries only.
- **D44** — Metadata widget uses a React editor-header contribution with an observable disposable registry; no CodeMirror portal or startup-order dependency.
- **D45** — Removed/narrowed configured values remain visible and filterable as unconfigured; the widget never rewrites or hides them.

The discovery gate is CLOSED for the decisions above. See the discovery story for the full rationale; do not re-litigate them here.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement JSX/CSS for affected surfaces until each is resolved and recorded.

1. **Collapsed-header + search interaction:** When a full-text search matches entries inside a collapsed year or month header, must the header auto-expand, or is showing a match count inside the collapsed header acceptable? Silently hiding matched entries is a defect per D16; the exact UX is not yet decided.
2. **Collapse-state persistence:** Should collapse state survive a panel close/reopen? Is it scoped per workspace or globally? Not decided.
3. **Collapsed dateline — no metadata:** D22 makes the no-metadata case the common case for new entries. What does the collapsed dateline render when an entry has only a date and no user-defined fields (just `Wednesday, August 5` with no suffix)?
4. **Measured-column behavior at narrow widths (OWNED HERE):** At what popout width does the date/time/first-line row switch to a compact layout, and which columns are dropped or wrapped? `pending-journal_mobile_refinement-med-med.md` consumes this answer; decide it once, here.
**STOP gate:** Do not implement the four affected surfaces above until each has a product-owner decision recorded in the discovery story.

## Metadata widget route — DECIDED D44

The widget uses a new first-class React contribution slot above the Markdown editor body,
backed by an observable disposable registry. Already-open editors subscribe and render or
remove contributions as registrations change. Do not portal React into CodeMirror DOM and do
not depend on startup activation order. This story consumes the platform prerequisite
`plans/extensions/pending-editor_header_contribution-high-med.md`; it does not implement the
registry itself. CodeMirror `editorHooks` remain for CodeMirror extensions/keybindings only.

## Panel side and context gap

`DesktopPanelContribution` requires `side: "left" | "right"`. The journal popout is `"left"`. The journal extension registers the panel via `context.panels.register(...)` inside `activate()`.

`DesktopPanelContext` currently supplies: `rootPath`, `documentContents`, `explorerProps`, `onOpenSearchResult`. The journal popout needs workspace listing and index access to enumerate and filter journal entries. This context does not yet provide those capabilities. Either:
- the context must be extended to expose workspace listing / index access, or
- the panel factory must reach shared state another way (e.g. a shared Zustand store or service singleton).

This is an open integration question. Do not solve it in this story — flag it as a dependency and require a decision before implementing the panel factory.

## Goal

Implement the approved journal list/create/open experience as a focused React surface: a flat virtualized navigator, full-text search and metadata filters, plus the D44 collapsed-dateline widget contributed above the editor body.

## Scope

- Popout navigator only. Not a calendar; not an editor fork.
- Popout header (per P1, group-by removed): **New entry** / **Today** / **Open calendar** / overflow menu; then search bar; then filter strip.
  - "Today" opens today's most recent entry or creates one if none exists.
  - "Open calendar" opens the canvas tab (D14/D27); this is the only calendar entry point from the popout.
- Entry list: flat virtualized stream, collapsible year + month headers (non-indented), Undated pinned at top.
- Metadata widget: contribute through D44's React editor-header registry; starts collapsed as a dateline and appears for journal-folder notes OR notes with configured fields (D28).
- Active-filter emphasis: count badge + chip row + "showing N of M" text (D16).
- Metadata facet options come from the D41 platform-index query. If unavailable, disable
  only metadata facets with an explicit status; browsing, date filtering and lazy previews remain usable.
- Twelve UI states enumerated in the discovery story's state-coverage section must all be handled. Reference that list; do not re-enumerate them here.
- Malformed frontmatter: non-blocking notice only; never a rewrite on open (D33).
- `DesktopPanelContext` gap: resolve the workspace listing / index access question before implementing the panel factory body.

## Likely files

- `apps/desktop/src/journal/JournalPanel.tsx` (new).
- `apps/desktop/src/journal/JournalPanel.module.css` (new; CSS Modules, `--tn-*` tokens only).
- `apps/desktop/src/journal/JournalPanel.test.tsx` (new).
- `apps/desktop/src/journal/journalViewModel.ts` and test (new, if state mapping merits separation).
- `apps/desktop/src/journal/JournalEntryList.tsx` and `JournalEntryList.module.css` (new; virtualized list component).
- `apps/desktop/src/journal/MetadataWidget.tsx` and `MetadataWidget.module.css` (new; collapsed dateline + expanded form through D44).
- `apps/desktop/src/journal/MetadataWidget.test.tsx` (new).
- `apps/desktop/src/panels/panelRegistry.tsx` (register journal contribution via the extension host; do not bypass registry).
- `apps/desktop/src/panels/LeftPopout.tsx`, `apps/desktop/src/shell/ActivityBar.tsx`, `apps/desktop/src/shell/DesktopShell.tsx` (minimal context/callback wiring only).
- Opening tabs uses the existing `openTab(kind, title)` entry point in `apps/desktop/src/shell/DesktopShell.tsx`; `TabContent.tsx` should NOT need editing. Do not fork editor state.
- `apps/desktop/src/tabs/MarkdownEditor.tsx` and the React slot registry belong to the D44 platform prerequisite; consume them here, do not duplicate them.

Runtime panel dimension is the only case where a scoped CSSOM custom property on the panel root element is acceptable. All other styling via CSS Modules + `--tn-*` tokens.

## Dependencies

- Approved discovery desktop wireframe and state/copy matrix (closed for the constraints above; open items above must be resolved).
- `plans/extensions/pending-editor_header_contribution-high-med.md` implements D44 before widget integration.
- `DesktopPanelContext` gap resolution: workspace listing and index access must be provided before the panel factory body can be implemented.
- Journal data model, journal service, and settings/accessibility contract.
- Existing `DesktopPanelContribution`, `DesktopPanelContext`, `LeftPopout`, `ActivityBar`, and editor-tab reducer.
- `plans/indexing-search/pending-frontmatter_metadata_facets-high-hard.md` for D41 facet queries; the cache stays disposable, rebuildable and never source of truth.

## Acceptance criteria

- [ ] Journal popout registers local panel id `journal` (`journal-calendar.journal`) through `context.panels.register(...)` with `side: "left"`; no direct registry mutation (D47).
- [ ] Popout is a navigator: every entry row opens in the main editor as a normal tab; no inline editing in the popout.
- [ ] Popout header contains exactly: New entry / Today / Open calendar / overflow, then search, then filter strip. No group-by control.
- [ ] "Today" opens the most recent entry for today's date or creates a new one; never appends to an existing file (D18).
- [ ] List renders as a flat virtualized stream with collapsible year + month headers, non-indented (D37, D39); list handles thousands of entries without layout thrash (D13).
- [ ] Rows render from filename-derived dates alone; first-line previews load lazily for
      visible rows only and never block first paint (see the listing strategy in
      `pending-journal_service_daily_notes-high-med.md`).
- [ ] Undated group is pinned collapsed at the top with a count; absent when empty; non-Markdown files are hidden; both are announced as a category (D36).
- [ ] Active filters show count badge + chip row + "showing N of M" string; a muted-only indicator is a defect (D16).
- [ ] Metadata facet values and paths come from D41 queries; all active predicates match within one entry per D43, and D16 search runs inside that entry set. Index unavailable disables only facets with explicit status and never scans files.
- [ ] Metadata widget registers as `metadata-widget` through D44's observable React editor-header registry, appears in already-open editors, disposes cleanly, follows D28 triggers, starts as D35's dateline, and expands to the form.
- [ ] Malformed frontmatter shows a non-blocking notice; D45 unconfigured values remain visible/filterable; neither case rewrites the file.
- [ ] All twelve UI states from the discovery story's state-coverage section are handled with distinct copy and recovery actions; no fake/placeholder data ships.
- [ ] Keyboard focus order matches the focus spec in the discovery story; screen-reader roles/names/live regions are correct; no hard-coded colors — `--tn-*` tokens only (D31).
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles except runtime panel-dimension CSSOM custom properties on the panel root.
- [ ] Desktop tests cover rendering, service failures, creating/opening notes, dirty-state behavior, panel toggling, filter emphasis, facet values, index-unavailable degradation, and malformed-frontmatter notice.
- [ ] `DesktopPanelContext` gap (workspace listing / index access) is resolved and documented before the panel factory body is merged.

## Tests / manual checks

- `JournalPanel.test.tsx`, `JournalEntryList.test.tsx`, `MetadataWidget.test.tsx`, relevant panel-registry tests, lint/typecheck/full QA.
- Manual desktop: open/close via activity-bar, create today/past note ("New entry" always new file), open an existing note with unsaved edits, collapse/expand year+month headers, trigger full-text search and verify chip+badge emphasis, apply metadata filter, open calendar tab from popout, resize popout, switch theme, keyboard-only navigation through popout header controls and entry list, screen-reader labels, malformed-frontmatter notice, error recovery.
- Verify real Markdown files are created at `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` and remain readable outside the app.
- Activate/deactivate the journal with an editor already open; verify D44 adds/removes the widget without remounting the editor.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All panel/view-model/registry/widget tests must pass.

## Manual desktop/mobile checks

Desktop: validate all twelve UI states, real create/open/dirty/error flows, keyboard/screen reader, themes, and filter emphasis. Mobile: narrowed scope is owned by `pending-journal_mobile_refinement-med-med.md`; this story must not add mobile-only markup.

## Platform prerequisite — D44

`MarkdownEditor.tsx` currently reads CodeMirror hooks once and has no React header slot. D44
resolves both concerns with a separate observable React contribution registry; do not modify
the CodeMirror hook contract to carry this widget. The prerequisite story must prove
post-mount registration and disposal before this story integrates `MetadataWidget`.

## Non-goals

- No calendar view, group-by control, mood-color mapping, emoji vocabulary, paper texture, or handwriting typefaces.
- No mobile-specific redesign, background indexing, reminders, AI assistance, or extension-host lifecycle code.
- High contrast is out of scope (themes own it).
- Do not invent the final mood/activity taxonomy, navigation labels, collapsed-header+search behavior, or narrow-width column layout — all are open items pending product-owner decision.
- Do not reimplement D44's registry or portal the widget into CodeMirror DOM.

## Handoff artifacts

The following story needs from this one:

- `JournalPanel` registered contribution id and stable panel props/context contract.
- `MetadataWidget` component API and D44 registration contract using local id `metadata-widget` (needed by extension-host integration).
- `JournalEntryList` virtualized list API including filter/search state shape (needed by `calendar_tab_ui` for shared filter state per D25).
- `DesktopPanelContext` gap resolution: decision and implementation on workspace listing / index access.
- State-coverage matrix (all twelve states) with copy strings, so mobile refinement can reuse without re-specifying.
- Confirmed focus order (from discovery story) validated in automated tests.
