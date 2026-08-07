# Story: Journal Panel UI

**Status:** pending · **Urgency:** high · **Difficulty:** hard

## Epic

Part of [Journal & Calendar](../pending-journal-calendar-high-hard.md).

## Discovery constraints (approved 2026-08-07)

Decisions from `../pending-journal_discovery_and_wireframes-low-med.md` that bind this story:

- **D9** — Popout is a NAVIGATOR. Entries open in the main editor as normal tabs; rows show date, time, first line.
- **D13** — List virtualization required (scale target: thousands of entries).
- **D15** — Popout body is a grouped list, never a calendar widget.
- **D16** — Full-text search over entries reusing existing search infrastructure (FTS5 cache). Filter values auto-populated from values actually present. When filters are active, active filters must be emphasized: count badge + chip row + "showing N of M". A muted indicator is a defect.
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

The discovery gate is CLOSED for the decisions above. See the discovery story for the full rationale; do not re-litigate them here.

## Questions first — STOP gate (still open for this story)

The items below are **genuinely undecided**. Do not implement JSX/CSS for affected surfaces until each is resolved and recorded.

1. **Collapsed-header + search interaction:** When a full-text search matches entries inside a collapsed year or month header, must the header auto-expand, or is showing a match count inside the collapsed header acceptable? Silently hiding matched entries is a defect per D16; the exact UX is not yet decided.
2. **Collapse-state persistence:** Should collapse state survive a panel close/reopen? Is it scoped per workspace or globally? Not decided.
3. **Collapsed dateline — no metadata:** D22 makes the no-metadata case the common case for new entries. What does the collapsed dateline render when an entry has only a date and no user-defined fields (just `Wednesday, August 5` with no suffix)?
4. **Measured-column behavior at narrow widths:** At what popout width does the date/time/first-line row switch to a compact layout, and which columns are dropped or wrapped?

**STOP gate:** Do not implement the affected surfaces until each open item above has a product-owner decision recorded in the discovery story.

## Goal

Implement the approved journal list/create/open experience as a focused React surface: a navigator popout that lists entries in a flat, virtualized, collapsible year+month stream, opens entries in the main editor, exposes full-text search and metadata filter, and shows the collapsed-dateline metadata widget above the editor body.

## Scope

- Popout navigator only. Not a calendar; not an editor fork.
- Popout header (per P1, group-by removed): **New entry** / **Today** / **Open calendar** / overflow menu; then search bar; then filter strip.
  - "Today" opens today's most recent entry or creates one if none exists.
  - "Open calendar" opens the canvas tab (D14/D27); this is the only calendar entry point from the popout.
- Entry list: flat virtualized stream, collapsible year + month headers (non-indented), Undated pinned at top.
- Metadata widget: above editor body, starts collapsed, renders as dateline; appears for journal-folder notes OR notes with configured fields (D28).
- Active-filter emphasis: count badge + chip row + "showing N of M" text (D16).
- Twelve UI states enumerated in the discovery story's state-coverage section must all be handled. Reference that list; do not re-enumerate them here.
- Malformed frontmatter: non-blocking notice only; never a rewrite on open (D33).

## Likely files

- `apps/desktop/src/journal/JournalPanel.tsx` (new).
- `apps/desktop/src/journal/JournalPanel.module.css` (new; CSS Modules, `--tn-*` tokens only).
- `apps/desktop/src/journal/JournalPanel.test.tsx` (new).
- `apps/desktop/src/journal/journalViewModel.ts` and test (new, if state mapping merits separation).
- `apps/desktop/src/journal/JournalEntryList.tsx` and `JournalEntryList.module.css` (new; virtualized list component).
- `apps/desktop/src/journal/MetadataWidget.tsx` and `MetadataWidget.module.css` (new; collapsed dateline + expanded form).
- `apps/desktop/src/journal/MetadataWidget.test.tsx` (new).
- `apps/desktop/src/panels/panelRegistry.tsx` (register journal contribution; do not bypass registry).
- `apps/desktop/src/panels/LeftPopout.tsx`, `apps/desktop/src/shell/ActivityBar.tsx`, `apps/desktop/src/shell/DesktopShell.tsx` (minimal context/callback wiring only).
- `apps/desktop/src/tabs/tabModel.ts` / `TabContent.tsx` (only to open the existing editor contract; do not fork editor state).

Runtime panel dimension is the only case where a scoped CSSOM custom property on the panel root element is acceptable. All other styling via CSS Modules + `--tn-*` tokens.

## Dependencies

- Approved discovery desktop wireframe and state/copy matrix (closed for D9–D39; open items above must be resolved).
- Journal data model, journal service, and settings/accessibility contract.
- Existing `DesktopPanelContribution`, `DesktopPanelContext`, `LeftPopout`, `ActivityBar`, and editor-tab reducer.
- Indexing/search epic's FTS5 cache (D16); disposable, rebuildable, never source of truth.

## Acceptance criteria

- [ ] Journal popout is registered through the existing desktop panel registry with a stable contribution id and left-side placement.
- [ ] Popout is a navigator: every entry row opens in the main editor as a normal tab; no inline editing in the popout.
- [ ] Popout header contains exactly: New entry / Today / Open calendar / overflow, then search, then filter strip. No group-by control.
- [ ] "Today" opens the most recent entry for today's date or creates a new one; never appends to an existing file (D18).
- [ ] List renders as a flat virtualized stream with collapsible year + month headers, non-indented (D37, D39); list handles thousands of entries without layout thrash (D13).
- [ ] Undated group is pinned collapsed at the top with a count; absent when empty; non-Markdown files are hidden; both are announced as a category (D36).
- [ ] Active filters show count badge + chip row + "showing N of M" string; a muted-only indicator is a defect (D16).
- [ ] Metadata widget appears above the editor body for journal-folder notes and for notes with configured fields (D28); starts collapsed as a dateline (D35); expands to the editable form.
- [ ] Malformed frontmatter: non-blocking notice shown; file is never rewritten on open (D33).
- [ ] All twelve UI states from the discovery story's state-coverage section are handled with distinct copy and recovery actions; no fake/placeholder data ships.
- [ ] Keyboard focus order matches the focus spec in the discovery story; screen-reader roles/names/live regions are correct; no hard-coded colors — `--tn-*` tokens only (D31).
- [ ] CSS uses co-located CSS Modules and `--tn-*` tokens; no inline styles except runtime panel-dimension CSSOM custom properties on the panel root.
- [ ] Desktop tests cover rendering, service failures, creating/opening notes, dirty-state behavior, panel toggling, filter emphasis, and malformed-frontmatter notice.

## Tests / manual checks

- `JournalPanel.test.tsx`, `JournalEntryList.test.tsx`, `MetadataWidget.test.tsx`, relevant panel-registry tests, lint/typecheck/full QA.
- Manual desktop: open/close via activity-bar, create today/past note ("New entry" always new file), open an existing note with unsaved edits, collapse/expand year+month headers, trigger full-text search and verify chip+badge emphasis, apply metadata filter, open calendar tab from popout, resize popout, switch theme, keyboard-only navigation through popout header controls and entry list, screen-reader labels, malformed-frontmatter notice, error recovery.
- Verify real Markdown files are created at `journal/YYYY/MM/YYYY-MM-DD-HHmm.md` and remain readable outside the app.

## Automated validation

`pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`). All panel/view-model/registry/widget tests must pass.

## Manual desktop/mobile checks

Desktop: validate all twelve UI states, real create/open/dirty/error flows, keyboard/screen reader, themes, and filter emphasis. Mobile: narrowed scope is owned by `pending-journal_mobile_refinement-med-med.md`; this story must not add mobile-only markup.

## Non-goals

- No calendar view, group-by control, mood-color mapping, emoji vocabulary, paper texture, or handwriting typefaces.
- No mobile-specific redesign, background indexing, reminders, AI assistance, or extension-host lifecycle code.
- High contrast is out of scope (themes own it).
- Do not invent the final mood/activity taxonomy, navigation labels, collapsed-header+search behavior, or narrow-width column layout — all are open items pending product-owner decision.

## Handoff artifacts

The following story needs from this one:

- `JournalPanel` registered contribution id and stable panel props/context contract.
- `MetadataWidget` exported component API and field-definition injection interface (needed by `journal_extension_host_integration`).
- `JournalEntryList` virtualized list API including filter/search state shape (needed by `calendar_tab_ui` for shared filter state per D25).
- State-coverage matrix (all twelve states) with copy strings, so mobile refinement can reuse without re-specifying.
- Confirmed focus order (from discovery story) validated in automated tests.
