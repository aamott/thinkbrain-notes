# Journal & Calendar

> Dedicated feature epic for an optional, local-first journal and journaling calendar built on ordinary Markdown notes. Read `plans/app-vision.md`, `plans/technical-decisions.md`, `user-noted-todo.md`, the mobile epic, the UI-shell plans, and `plans/extensions/pending-beta_builtin_extensions-med-med.md` before starting any story.

## Collaboration gate — SATISFIED 2026-08-07

The questions below were answered by the product owner and are recorded as decisions
D1-D40 in `journal-calendar/pending-journal_discovery_and_wireframes-low-med.md`, together
with the approved moodboard, IA and mobile artifacts. **Downstream stories may now proceed
within those decisions.** The gate remains closed for every item the discovery log lists as
open, and each child story carries its own STOP gate for its own undecided items.

A superseding decision is recorded as a new D-number, never by editing an earlier one.

Original questions, retained for the record:

1. What is the primary daily workflow: open today's note, browse history, capture a quick entry, or something else?
2. Which parts of the experience are journal-specific versus normal Markdown editor behavior?
3. What are the required date/time semantics (local timezone, workspace timezone, or another choice), and can a user backfill or edit a past date?
4. Which folder and filename defaults feel safe, and which parts must be configurable? Should an existing note be opened rather than overwritten?
5. Which template fields are essential, optional, or user-defined? Should templates be plain Markdown files, settings values, or both?
6. Which mood and activity vocabularies should be supported, and may users add, rename, order, or remove values? Are values single-select, multi-select, scales, or free text?
7. What should the calendar show by default, and what does “show days with journal entries, mood by day, activity by day” mean in the first release?
8. Should journal and calendar be separate activity-bar buttons, one panel with views, or another arrangement? What should happen on narrow screens?
9. Which actions require keyboard access, screen-reader announcements, reduced-motion behavior, and high-contrast clarity?
10. What is the approval cadence for discovery boards, wireframes, desktop mockups, mobile mockups, and implementation increments?

**STOP gate — status:** discovery is complete and approved (D1-D40, artifacts approved
D35/D37/D39/D40). Information architecture is settled as **IA-3**; the workflow, storage
layout, metadata model, calendar composition, accessibility bar and mobile split are
decided. Frontmatter keys are **not** yet defined — that remains story 2's work, bounded by
D3, D20, D22, D30, D33 and D38. Every UI-heavy child story still repeats a STOP gate for
its own open items.

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
- Mobile is the same `apps/desktop` React/Tauri webview; coordinate with `plans/mobile/pending-responsive_layout-low-med.md`, `pending-mobile_tauri_config-low-easy.md`, and `pending-codemirror_mobile_testing-low-med.md`.
- Coordinate registration only with `plans/extensions/pending-beta_builtin_extensions-med-med.md`; journal/calendar behavior and storage stay here.
- **Indexing/search dependency (new, from D16).** Full-text search, auto-populated filter
  values, and first-line previews at thousands of entries cannot be served by reading files
  on demand. The journal reuses the existing search infrastructure and therefore depends on
  the indexing/search epic's SQLite FTS5 cache — which per `plans/technical-decisions.md`
  is disposable, rebuildable, and never the source of truth. Browsing must degrade
  gracefully when the index is unavailable.

## Story sequence

| # | Story | Depends on |
|---|---|---|
| 1 | `journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` ✅ complete | — |
| 2 | `journal-calendar/pending-journal_data_model_frontmatter-med-hard.md` | 1 approved contract |
| 3 | `journal-calendar/pending-journal_service_daily_notes-high-med.md` | 1, 2 |
| 4 | `journal-calendar/pending-calendar_data_model-med-med.md` | 1, 2 |
| 5 | `journal-calendar/pending-journal_settings_and_accessibility-med-med.md` | 1, 2; settings registry |
| 6 | `journal-calendar/pending-journal_panel_ui-high-hard.md` | 1–3, 5; approved desktop wireframe |
| 7 | `journal-calendar/pending-calendar_tab_ui-high-hard.md` | 1, 3, 4, 5; approved desktop wireframe |
| 8 | `journal-calendar/pending-journal_mobile_refinement-med-med.md` | 6, 7; approved mobile wireframe |
| 9 | `journal-calendar/pending-journal_extension_host_integration-med-med.md` | 3, 5–7; beta host APIs |

Story 7 was renamed from `calendar_panel_ui` to `calendar_tab_ui` because D27 makes the
calendar a canvas tab rather than a panel; it registers no activity-bar entry and targets
the tab-kind registry rather than the panel registry.

Every UI-facing story requires iterative approval of desktop and mobile mockups: discovery
alternative → desktop wireframe → desktop mockup → mobile mockup → implementation
increment, with **per-artifact** product-owner sign-off (D34) and the approved version
recorded in the story. Stories may be split further if a subagent would exceed one focused change set. Do not mark a story complete when an approval gate or unresolved product decision remains open.

## Validation

- Unit tests for date/time boundaries, path/name expansion, frontmatter round trips, templates, metadata normalization, calendar aggregation, empty/error states, and settings validation.
- React tests for panel registration/rendering, keyboard behavior, focus, and accessible names; add mobile viewport tests where practical.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) for implementation stories.
- Manual desktop checks against a temporary workspace and real Markdown files; manual Android/iOS checks when mobile stories run.
- At each checkpoint, record the approved questions, mockup version, rejected alternatives, and remaining non-goals in the owning story. No final UX decision may be inferred from a placeholder.

## Status

- ✅ Product questions answered and discovery/wireframes explicitly approved (D1-D40)
- ⬜ Journal data/frontmatter contract approved and tested
- ⬜ Journal service and daily-note creation implemented
- ⬜ Calendar model and metadata aggregation implemented
- ⬜ Settings/accessibility contract implemented
- ⬜ Journal popout and calendar tab implemented from approved mockups
- ⬜ Mobile refinement approved and verified
- ⬜ Built-in registration wired through `desktopExtensionHost`
