# Story: Journal Panel UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

The discovery gate is CLOSED; full rationale and D1-D47 live in
`../pending-journal_discovery_and_wireframes-low-med.md`.

- **D9/D13/D15:** navigator rows show date/time/first line and open normal editor tabs; use a virtualized grouped list, never a calendar widget.
- **D16/D41:** reuse platform search/facets, never a journal cache/full scan; active filters require count badge, chip row, and `showing N of M` emphasis.
- **D18/D22:** New entry always creates a file; new frontmatter is date-only.
- **D11/D24/D28/D35/D44:** collapsed dateline widget is above the editor body, applies to journal-folder or configured-field notes, and uses the observable React header registry—not CodeMirror or startup timing.
- **D25/D43:** day click shares popout filter state; predicates match within one entry and list/counts use matches only.
- **D31/D33:** keyboard/screen-reader support and token-only styling are required; malformed frontmatter remains eligible, gets a non-blocking notice, and is never rewritten.
- **D36/D37/D39/D45:** pinned collapsed Undated group (mtime order, non-Markdown hidden); flat non-indented stream with collapsible year/month headers; removed values remain visible/filterable as `unconfigured`.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement JSX/CSS for affected surfaces until each is resolved and recorded.

1. **Collapsed-header + search interaction:** When a full-text search matches entries inside a collapsed year or month header, must the header auto-expand, or is showing a match count inside the collapsed header acceptable? Silently hiding matched entries is a defect per D16; the exact UX is not yet decided.
2. **Collapse-state persistence:** Should collapse state survive a panel close/reopen? Is it scoped per workspace or globally? Not decided.
3. **Collapsed dateline — no metadata:** D22 makes the no-metadata case the common case for new entries. What does the collapsed dateline render when an entry has only a date and no user-defined fields (just `Wednesday, August 5` with no suffix)?
4. **Measured-column behavior at narrow widths (OWNED HERE):** At what popout width does the date/time/first-line row switch to a compact layout, and which columns are dropped or wrapped? `pending-journal_mobile_refinement-med-med.md` consumes this answer; decide it once, here.
**STOP gate:** Do not implement the four affected surfaces above until each has a product-owner decision recorded in the discovery story.

## Metadata widget route — DECIDED D44

`MarkdownEditor.tsx` currently reads CodeMirror hooks once and has no React header slot. The
widget instead uses the platform prerequisite's first-class React slot and observable, disposable
registry above the Markdown body. Already-open editors must react to registration/disposal; do not
portal into CodeMirror DOM, alter `editorHooks`, or depend on startup order. This story consumes
`plans/extensions/pending-editor_header_contribution-high-med.md`; it does not implement the
registry. The prerequisite must prove post-mount registration/disposal; CodeMirror hooks remain
for CodeMirror extensions/keybindings only.

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
- [ ] Undated is a pinned collapsed category with a count and is absent when empty; non-Markdown files are silently excluded from the popout (D32/D36).
- [ ] Active filters show count badge + chip row + "showing N of M" string; a muted-only indicator is a defect (D16).
- [ ] Metadata facet values and paths come from D41 queries; all active predicates match within one entry per D43, and D16 search runs inside that entry set. Index unavailable disables only facets with explicit status and never scans files.
- [ ] Metadata widget registers as `metadata-widget` through D44's observable React editor-header registry, appears in already-open editors, disposes cleanly, follows D28 triggers, starts as D35's dateline, and expands to the form.
- [ ] Malformed frontmatter shows a non-blocking notice; D45 unconfigured values remain visible/filterable; neither case rewrites the file.
- [ ] All twelve UI states from the discovery story's state-coverage section are handled with distinct copy and recovery actions; no fake/placeholder data ships.
- [ ] Keyboard focus order matches the focus spec in the discovery story; screen-reader roles/names/live regions are correct; no hard-coded colors — `--tn-*` tokens only (D31).
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles except runtime panel-dimension CSSOM custom properties on the panel root.
- [ ] Desktop tests cover rendering, service failures, creating/opening notes, dirty-state behavior, panel toggling, filter emphasis, facet values, index-unavailable degradation, and malformed-frontmatter notice.
- [ ] `DesktopPanelContext` gap (workspace listing / index access) is resolved and documented before the panel factory body is merged.

## Validation

- Automated: `JournalPanel.test.tsx`, `JournalEntryList.test.tsx`, `MetadataWidget.test.tsx`, relevant panel-registry tests, and `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`); all panel/view-model/registry/widget tests must pass.
- Desktop: validate all twelve UI states; open/close via activity bar; create today/past note ("New entry" always new file); open an existing note with unsaved edits; collapse/expand year+month headers; test full-text search, chip/badge emphasis, metadata filters, calendar-tab launch, resizing, themes, keyboard-only navigation, screen-reader labels, malformed-frontmatter notice, error recovery, and filter emphasis. Verify real Markdown files use `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` and remain readable outside the app.
- With an editor already open, activate/deactivate and verify D44 adds/removes the widget without remounting. Mobile is owned by `pending-journal_mobile_refinement-med-med.md`; add no mobile-only markup.

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
