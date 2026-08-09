# Story: Journal Panel UI

**Status:** 🟨 in progress · **Urgency:** high · **Difficulty:** hard

Shipped: `journalViewModel.ts` (all fourteen states, pure), `JournalPanel.tsx` (presentational),
`JournalPanelContainer.tsx` (state + service), `MetadataWidget.tsx`, and registration through
`extensions/builtins/journal.tsx`.

Remaining: list virtualization (D13), lazy first-line previews, the widget's write path and its
editor-header registration, search/facets (waiting on D41), collapse persistence (D53), and the
two shell affordances noted below.

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

## Questions first — STOP gate (CLOSED)

Closed by D48-D70; full text in `../pending-journal_discovery_and_wireframes-low-med.md`.

- **Collapsed-header + search interaction — D52.** Matching headers auto-expand with a match count while a search/filter is active; never persisted.
- **Collapse-state persistence — D53.** Persists per workspace in desktop state, restored on popout reopen.
- **Collapsed dateline, no metadata — D54.** Renders the bare date only, plus an `Add metadata` control; refines wireframe state 4.
- **Measured-column behavior at narrow widths — D55, amended by D72.** At ≥320px the row is one line (date · time · first line); below that the time joins the date line and the preview wraps. The preview is **never** dropped, at any width. The mobile story consumes, not redefines.

**Desktop mockup APPROVED 2026-08-08** — `assets/journal-panel-mockup.html`, which closed
D71/D75 (header order and emphasis), D72 (preview always kept), D73 (filter right-aligned)
and D74 (dateline keeps the year, mismatch surfaced). The mobile mockup is still outstanding
under D34.

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

**Resolved 2026-08-08.** No `DesktopPanelContext` change is needed. The journal extension
builds its service during `activate()` from `context.workspace` (which has `listNotes`,
`readNote`, `createNote`, `openNote` after D68) and the panel factory closes over it. The
panel itself is presentational: every action is a prop. That keeps workspace access on the
extension API every third-party extension uses, rather than widening a shell context.

## Goal

Implement the approved journal list/create/open experience as a focused React surface: a flat virtualized navigator, full-text search and metadata filters, plus the D44 collapsed-dateline widget contributed above the editor body.

## Scope

- Popout navigator only. Not a calendar; not an editor fork.
- Popout header (D71/D75): an action row of **New entry** (primary, the only filled control) with **Today** and **Open calendar** beside it as outlined buttons; then the search field; then the filter row with the filter control right-aligned (D73). Overflow stays in the panel chrome and is the only thing there.
  - "Today" opens today's most recent entry or creates one if none exists.
  - "Open calendar" opens the canvas tab (D14/D27); this is the only calendar entry point from the popout.
- Entry list: flat virtualized stream, collapsible year + month headers (non-indented), Undated pinned at top.
- Metadata widget: contribute through D44's React editor-header registry; starts collapsed as a dateline and appears for journal-folder notes OR notes with configured fields (D28).
- Active-filter emphasis: count badge + chip row + "showing N of M" text (D16).
- Metadata facet options come from the D41 platform-index query. If unavailable, disable
  only metadata facets with an explicit status; browsing, date filtering and lazy previews remain usable.
- Fourteen UI states: the twelve in the discovery story's state-coverage section, plus the invalid-root-setting failure (D63) and the filename/frontmatter date mismatch (D74). The approved mockup's copy table is the reference; do not re-enumerate them here.
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

**Styling convention — deviation, flagged.** `plans/technical-decisions.md` calls for CSS
Modules, but the app contains **zero** `.module.css` files: every shell component styles with
Tailwind utilities, and `apps/desktop/src/index.css` maps those utilities onto the `--tn-*`
tokens (`--color-sidebar: var(--tn-color-sidebar)`). The journal follows its neighbours, so
`bg-sidebar` and `text-muted-foreground` resolve to the same tokens a CSS Module would use;
no colour is hard-coded. Introducing the repo's only CSS Module inside Tailwind-styled panel
chrome would be the inconsistent choice. **Product owner: say the word and I will convert.**

## Dependencies

- Approved discovery desktop wireframe and state/copy matrix, plus the approved desktop mockup `assets/journal-panel-mockup.html` (D71-D75). D34 still gates the mobile artifact.
- `plans/extensions/pending-editor_header_contribution-high-med.md` implements D44 before widget integration.
- `DesktopPanelContext` gap resolution: workspace listing and index access must be provided before the panel factory body can be implemented.
- Journal data model, journal service, and settings/accessibility contract.
- Existing `DesktopPanelContribution`, `DesktopPanelContext`, `LeftPopout`, `ActivityBar`, and editor-tab reducer.
- `plans/indexing-search/pending-frontmatter_metadata_facets-high-hard.md` for D41 facet queries; the cache stays disposable, rebuildable and never source of truth.

## Acceptance criteria

- [ ] Journal popout registers local panel id `journal` (`journal-calendar.journal`) through `context.panels.register(...)` with `side: "left"`; no direct registry mutation (D47).
- [ ] Popout is a navigator: every entry row opens in the main editor as a normal tab; no inline editing in the popout.
- [ ] Popout header follows D71/D75: New entry (the only filled control) with Today and Open calendar beside it, then search, then the filter row with the control right-aligned (D73). No group-by control. Focus order: overflow, New entry, Today, Open calendar, search, filter, chips, list.
- [ ] "Today" opens the most recent entry for today's date or creates a new one; never appends to an existing file (D18).
- [ ] List renders as a flat virtualized stream with collapsible year + month headers, non-indented (D37, D39); list handles thousands of entries without layout thrash (D13). **Grouping and collapse are done; virtualization is not — every row renders today.**
- [ ] Rows render from filename-derived dates alone; first-line previews load lazily for
      visible rows only and never block first paint (see the listing strategy in
      `pending-journal_service_daily_notes-high-med.md`).
- [ ] Undated is a pinned collapsed category with a count and is absent when empty; non-Markdown files are silently excluded from the popout (D32/D36).
- [ ] Active filters show count badge + chip row + "showing N of M" string; a muted-only indicator is a defect (D16).
- [ ] Metadata facet values and paths come from D41 queries; all active predicates match within one entry per D43, and D16 search runs inside that entry set. Index unavailable disables only facets with explicit status and never scans files.
- [ ] Metadata widget registers as `metadata-widget` through D44's observable React editor-header registry, appears in already-open editors, disposes cleanly, follows D28 triggers, starts as D35's dateline in D74's long form with the year, and expands to the form.
- [ ] Malformed frontmatter shows a non-blocking notice; D45 unconfigured values remain visible/filterable; neither case rewrites the file.
- [ ] All fourteen UI states are handled with the approved mockup's copy and recovery actions; no fake/placeholder data ships.
- [ ] Keyboard focus order matches the focus spec in the discovery story; screen-reader roles/names/live regions are correct; no hard-coded colors — `--tn-*` tokens only (D31).
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles except runtime panel-dimension CSSOM custom properties on the panel root.
- [ ] Desktop tests cover rendering, service failures, creating/opening notes, dirty-state behavior, panel toggling, filter emphasis, facet values, index-unavailable degradation, and malformed-frontmatter notice.
- [ ] `DesktopPanelContext` gap (workspace listing / index access) is resolved and documented before the panel factory body is merged.

## Validation

- Automated: `JournalPanel.test.tsx`, `JournalEntryList.test.tsx`, `MetadataWidget.test.tsx`, relevant panel-registry tests, and `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`); all panel/view-model/registry/widget tests must pass.
- Desktop: validate all fourteen UI states; open/close via activity bar; create today/past note ("New entry" always new file); open an existing note with unsaved edits; collapse/expand year+month headers; test full-text search, chip/badge emphasis, metadata filters, calendar-tab launch, resizing, themes, keyboard-only navigation, screen-reader labels, malformed-frontmatter notice, error recovery, and filter emphasis. Verify real Markdown files use `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` and remain readable outside the app.
- With an editor already open, activate/deactivate and verify D44 adds/removes the widget without remounting. Mobile is owned by `pending-journal_mobile_refinement-med-med.md`; add no mobile-only markup.

## Non-goals

- No calendar view, group-by control, mood-color mapping, emoji vocabulary, paper texture, or handwriting typefaces.
- No mobile-specific redesign, background indexing, reminders, AI assistance, or extension-host lifecycle code.
- High contrast is out of scope (themes own it).
- Do not invent the final mood/activity taxonomy (D4 keeps it user-defined) or navigation labels. Collapsed-header search behavior (D52) and narrow-width column layout (D55) are decided; implement them as written rather than reinterpreting them.
- Do not reimplement D44's registry or portal the widget into CodeMirror DOM.

## Handoff artifacts

The following story needs from this one:

- `JournalPanel` registered contribution id and stable panel props/context contract.
- `MetadataWidget` component API and D44 registration contract using local id `metadata-widget` (needed by extension-host integration).
- `JournalEntryList` virtualized list API including filter/search state shape (needed by `calendar_tab_ui` for shared filter state per D25).
- `DesktopPanelContext` gap resolution: decision and implementation on workspace listing / index access.
- State-coverage matrix (all fourteen states) with copy strings — the approved mockup's table — so mobile refinement can reuse without re-specifying.
- Confirmed focus order (from discovery story) validated in automated tests.

## Platform gaps found while building (2026-08-08)

- **`Open folder…` and `Open settings`.** D63's copy gives these states an action, but the
  extension API exposes no route to a shell command — an extension can register commands, not
  run another's. The panel takes both handlers as optional and renders the button only when one
  is supplied; the built-in supplies neither, so the copy appears without a dead control.
  Wiring them needs a decision about whether extensions may invoke host commands.
- **The calendar tab** is registered `isAvailable: false` with a message rather than omitted,
  so the popout's calendar button leads somewhere that explains itself until story 7 lands.
