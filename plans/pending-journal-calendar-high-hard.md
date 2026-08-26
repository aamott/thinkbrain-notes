# Journal & Calendar

> Dedicated feature epic for an optional, local-first journal and journaling calendar built on ordinary Markdown notes. Read `plans/app-vision.md`, `user-noted-todo.md`, the mobile epic, the UI-shell plans, and `plans/extensions/pending-beta_builtin_extensions-med-med.md` before starting any story.

## Collaboration gate — SATISFIED 2026-08-07, extended 2026-08-08

The product-owner answers are recorded as decisions D1-D79 in
`journal-calendar/pending-journal_discovery_and_wireframes-low-med.md`, together with the
approved moodboard, IA and mobile artifacts. **Downstream stories may now proceed within
those decisions.** Superseding decisions are recorded as new D-numbers, never by editing
earlier ones.

**STOP gate — CLOSED.** Every product question this epic tracked is answered. D1-D47
settled the workflow, storage layout, metadata model, calendar composition, accessibility
bar, IA (**IA-3**) and mobile split. D48-D70 closed the remainder: the frontmatter contract
(`date` key, field-definition shape, invalid-data policy, compatibility promise), panel and
calendar behavior, backfill mechanics, error copy, the settings list, registration, and the
extension API additions the journal needs. Rationale and rejected alternatives for that
batch are in `docs/superpowers/specs/2026-08-08-journal-open-decisions-proposal.md`.
D71-D75 came out of the approved desktop panel mockup (action emphasis, preview always
kept, filter alignment, dateline format, header order); D76-D78 from the approved mobile
mockup (touch row height, wrapping chips, the sheet's contract).

All three D34 mockups are approved (panel, mobile, calendar tab). The platform prerequisites
below, including the D41 facets prerequisite the panel was built to degrade around, have all
shipped; what remains is the journal/calendar story work itself.

## Goal

Deliver a user-approved journal workflow and calendar view as a built-in feature while preserving Markdown-first, local-first, Git-friendly storage. Journal entries remain normal `.md` files in a configurable workspace folder. The feature must make its assumptions visible, preserve unknown frontmatter, avoid rewriting notes during indexing/opening, and use existing workspace/document adapters, settings, shell panel registries, and the trusted built-in extension boundary.

## Scope

In scope:

- Product workflow discovery, moodboards/wireframes, and iterative approval checkpoints.
- A documented journal Markdown/frontmatter contract, folder and filename template rules, and migration/invalid-data behavior.
- Platform-agnostic journal metadata and calendar query models in `packages/core`.
- A journal service for date resolution, folder/naming expansion, entry creation
  (always a new file, D18), reading, and listing. No template application (D21).
- Calendar aggregation from journal notes, including explicit handling of mood/activity metadata and missing/invalid values.
- A single journal popout registered through `desktopExtensionHost` using the existing
  panel registry. The calendar is a **canvas tab, not a panel**, and registers **no**
  activity-bar entry (D27).
- Namespaced settings for journal location, naming, date/time policy, metadata field
  definitions (global and per-workspace, D23), and calendar defaults. Template settings
  are out of the first slice (D21).
- Responsive mobile behavior using the shared desktop webview, touch targets, keyboard/screen-reader accessibility, and manual emulator/simulator checks.
- Small, reviewable mockup-to-implementation increments; no implementation story may silently settle an unanswered product question.

Non-goals:

- A proprietary journal database, cloud sync, telemetry, or a journal-only storage format.
- Replacing the Markdown editor or changing the global frontmatter mutation policy.
- AI-generated entries, sentiment inference, medical/mental-health claims, reminders, notifications, habit streak gamification, or social sharing.
- Git sync, conflict resolution, indexing architecture, or marketplace/third-party install work owned by other epics.
- Inventing product decisions. Mood scales and activity taxonomies are user-defined (D4)
  and must never ship built in; mobile navigation belongs to the app shell (D26).
- A group-by control. Withdrawn by D37; grouping is a fixed property of the list.
- Templates, guessing ambiguous dates (D38), or any calendar encoding richer than dots in
  the first release (D29).

## Dependencies and boundaries

- Existing `packages/core/src/frontmatter.ts`, `markdown.ts`, and `note-model.ts` are the parsing/serialization boundary; unknown fields must survive explicit saves.
- Existing `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` and `workspaceAdapter.ts` own Markdown and workspace I/O. New services should depend on typed interfaces, not call Tauri directly.
- Existing `apps/desktop/src/panels/panelRegistry.tsx`, `LeftPopout.tsx`, `ActivityBar.tsx`, and `DesktopShell.tsx` own rendering and shell composition. Journal/calendar contributions must enter through the registry rather than a parallel action array.
- Existing `apps/desktop/src/extensions/desktopExtensionHost.ts` owns scoped command, panel, editor-hook, and settings registration. Built-in registration must use its disposable lifecycle.
- Existing modular settings work (`apps/desktop/src/settings/settingsStore.ts`, `packages/core/src/settings/`) owns namespaced settings persistence outside the workspace.
- Mobile is the same `apps/desktop` React/Tauri webview; coordinate with `plans/mobile/pending-responsive_layout-med-med.md`, `pending-mobile_tauri_config-med-easy.md`, and `done-codemirror_mobile_testing-med-med.md`.
- Coordinate registration only with `plans/extensions/pending-beta_builtin_extensions-med-med.md`; journal/calendar behavior and storage stay here.
- **Indexing/search dependency (D16/D41).** Full-text search and metadata facets reuse the
  platform-owned disposable index; metadata facets shipped — see
  `plans/indexing-search/done-summary.md`. Browsing, dates, grouping and lazy previews never
  depended on that work. If the index is unavailable, browsing and date filters remain usable
  and metadata facets report unavailable — never fall back to a full-file scan or a
  journal-owned cache.


## Platform reality check — 2026-08-08

The extension platform, contributed tab kinds, panel header actions, and live preview all
shipped during discovery. Copy `apps/desktop/src/extensions/builtins/noteStats.tsx` as the
reference built-in; `plans/pending-extensions-low-hard.md` lists the platform surface.

Prerequisites still to build, all decided:

| # | Needs | Owner |
|---|---|---|
| ~~1~~ | ✅ `tabs.open(kind, title)` shipped 2026-08-08 | — |
| ~~2~~ | ✅ React editor-header slot shipped 2026-08-08 (D44) | — |
| ~~3~~ | ✅ Workspace-scoped settings shipped 2026-08-08 (D45); the settings **UI/uninstall** work stays behind that story's product gate and blocks nothing here | — |
| ~~4~~ | ✅ `listNotes(prefix)` shipped 2026-08-08 | — |
| ~~5~~ | ✅ Frontmatter metadata facets in the index (D41) shipped — see `plans/indexing-search/done-summary.md` | — |

Already usable: `desktopExtensionHost` register/activate, `DesktopExtensionContext`
(`commands`, `panels`, `editorHooks`, `settings`, `tabs`, `workspace`), contributed tab kinds
with a `factory`, panel contributions on either side with `PanelAction` header buttons, lazy
activation with stubs, and the disposable scope. Built-in ids are fixed by D47.

## Story sequence

| # | Story | Depends on |
|---|---|---|
| 1 | `journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` ✅ complete | — |
| 2 | `journal-calendar/pending-journal_data_model_frontmatter-med-hard.md` | 1 approved contract |
| 3 | `journal-calendar/pending-journal_service_daily_notes-high-med.md` | 1, 2 |
| 4 | `journal-calendar/done-calendar_data_model-med-med.md` ✅ complete | 1, 2 |
| 5 | `journal-calendar/pending-journal_settings_and_accessibility-med-med.md` | 1, 2; D45 extension-settings prerequisite |
| 6 | `journal-calendar/pending-journal_panel_ui-high-hard.md` | 1–3, 5; D41 index and D44 editor-header prerequisites |
| 7 | `journal-calendar/pending-calendar_tab_ui-high-hard.md` | 1, 3, 4, 5; tab registration shipped; extension-facing open route pending in story 9 |
| 8 | `journal-calendar/pending-journal_mobile_refinement-med-med.md` | 6, 7; approved mobile wireframe |
| 9 | `journal-calendar/pending-journal_extension_host_integration-med-med.md` | 3, 5–7; D44/D45 platform APIs; D47 ids |

Story 7 was renamed from `calendar_panel_ui` to `calendar_tab_ui` because D27 makes the
calendar a canvas tab rather than a panel; it registers no activity-bar entry and targets
the tab-kind registry rather than the panel registry.

Every UI-facing story requires iterative approval of desktop and mobile mockups: discovery
alternative → desktop wireframe → desktop mockup → mobile mockup → implementation
increment, with **per-artifact** product-owner sign-off (D34) and the approved version
recorded in the story. Stories may be split further if a subagent would exceed one focused change set. Do not mark a story complete when an approval gate or unresolved product decision remains open.

## Validation

- Unit tests for date/time boundaries, path/name expansion, frontmatter round trips, metadata normalization, D43/D46 calendar aggregation, empty/error states, and settings validation.
- React tests for panel registration/rendering, keyboard behavior, focus, and accessible names; add mobile viewport tests where practical.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) for implementation stories.
- Manual desktop checks against a temporary workspace and real Markdown files; manual Android/iOS checks when mobile stories run.
- At each checkpoint, record the approved artifact version, rejected alternatives, and remaining non-goals in the owning story (D34); never infer a final UX decision from a placeholder.

## Status

- ✅ Every product decision closed (D1-D88)
- 🟨 Story 2 journal data/frontmatter contract — implemented in `packages/core/src/journal/`;
  the unknown-field write round-trip waits on story 3's write path
- 🟨 Story 3 journal service — create (always new, D18), backfill (D61/D62), listing with
  undated split (D36/D38), openToday, and D63 failure copy; previews and search wiring remain
- 🟨 Story 5 settings — D64's four settings implemented; the field-definition control is now
  D82's form rather than a JSON box, with D83/D84 open vocabulary; registration waits on story 9
- ✅ Story 4 calendar model — D43 distinct values, D43 same-entry AND filters, D46 counts,
  undated pinned outside the grid, in `packages/core/src/journal/calendar.ts`
- 🟨 Story 6 panel — view model, popout, container, metadata widget and registration shipped;
  virtualization, previews, the widget write path and search/facets remain
- 🟨 Story 9 registration — the journal activates as a built-in (`extensions/builtins/journal.tsx`)
  with panel, three commands, settings and the calendar tab placeholder
- 🟨 Story 7 calendar tab — grid, dots, keyboard, the shared day filter, D56/D79/D80 view-mode
  persistence and the D57 phone layout shipped; metadata predicates remain, waiting on D41
- 🟨 Story 8 mobile refinement — M-2 sheet (D78), M-1 touch density (D76) and
  `journal/mobile-a11y-checklist.md` shipped; the manual VoiceOver/TalkBack pass remains
- ✅ Platform prerequisites: D68/D69 API additions, D44 editor-header slot, D45
  workspace-scoped settings, and D41 metadata facets have all shipped
