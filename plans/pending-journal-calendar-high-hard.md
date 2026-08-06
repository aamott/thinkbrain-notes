# Journal & Calendar

> Dedicated feature epic for an optional, local-first journal and journaling calendar built on ordinary Markdown notes. Read `plans/app-vision.md`, `plans/technical-decisions.md`, `user-noted-todo.md`, the mobile epic, the UI-shell plans, and `plans/extensions/pending-beta_builtin_extensions-med-med.md` before starting any story.

## Collaboration gate — questions before design

Please answer these questions with the product owner before any mockup, wireframe, schema commitment, or implementation:

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

**STOP gate:** Do not create mockups, choose a final information architecture, define irreversible frontmatter keys, or implement code until the product owner answers the questions above and explicitly approves the proposed workflow and first wireframe. Every UI-heavy child story repeats this gate.

## Goal

Deliver a user-approved journal workflow and calendar view as a built-in feature while preserving Markdown-first, local-first, Git-friendly storage. Journal entries remain normal `.md` files in a configurable workspace folder. The feature must make its assumptions visible, preserve unknown frontmatter, avoid rewriting notes during indexing/opening, and use existing workspace/document adapters, settings, shell panel registries, and the trusted built-in extension boundary.

## Scope

In scope:

- Product workflow discovery, moodboards/wireframes, and iterative approval checkpoints.
- A documented journal Markdown/frontmatter contract, folder and filename template rules, and migration/invalid-data behavior.
- Platform-agnostic journal metadata and calendar query models in `packages/core`.
- A journal service for date resolution, folder/naming expansion, template application, daily-note creation, reading, and listing.
- Calendar aggregation from journal notes, including explicit handling of mood/activity metadata and missing/invalid values.
- Desktop journal and calendar panels registered through `desktopExtensionHost`, with activity-bar/popout behavior using the existing panel registry.
- Namespaced workspace settings for journal location, naming, templates, date/time policy, metadata options, and calendar defaults (only after questions are answered).
- Responsive mobile behavior using the shared desktop webview, touch targets, keyboard/screen-reader accessibility, and manual emulator/simulator checks.
- Small, reviewable mockup-to-implementation increments; no implementation story may silently settle an unanswered product question.

Non-goals:

- A proprietary journal database, cloud sync, telemetry, or a journal-only storage format.
- Replacing the Markdown editor or changing the global frontmatter mutation policy.
- AI-generated entries, sentiment inference, medical/mental-health claims, reminders, notifications, habit streak gamification, or social sharing.
- Git sync, conflict resolution, indexing architecture, or marketplace/third-party install work owned by other epics.
- Inventing final UX, mood scales, activity taxonomy, folder layout, filename syntax, or mobile navigation before approval.

## Dependencies and boundaries

- Existing `packages/core/src/frontmatter.ts`, `markdown.ts`, and `note-model.ts` are the parsing/serialization boundary; unknown fields must survive explicit saves.
- Existing `apps/desktop/src/workspace/workspaceDocumentAdapter.ts` and `workspaceAdapter.ts` own Markdown and workspace I/O. New services should depend on typed interfaces, not call Tauri directly.
- Existing `apps/desktop/src/panels/panelRegistry.tsx`, `LeftPopout.tsx`, `ActivityBar.tsx`, and `DesktopShell.tsx` own rendering and shell composition. Journal/calendar contributions must enter through the registry rather than a parallel action array.
- Existing `apps/desktop/src/extensions/desktopExtensionHost.ts` owns scoped command, panel, editor-hook, and settings registration. Built-in registration must use its disposable lifecycle.
- Existing modular settings work (`apps/desktop/src/settings/settingsStore.ts`, `packages/core/src/settings/`) owns namespaced settings persistence outside the workspace.
- Mobile is the same `apps/desktop` React/Tauri webview; coordinate with `plans/mobile/pending-responsive_layout-low-med.md`, `pending-mobile_tauri_config-low-easy.md`, and `pending-codemirror_mobile_testing-low-med.md`.
- Coordinate registration only with `plans/extensions/pending-beta_builtin_extensions-med-med.md`; journal/calendar behavior and storage stay here.

## Story sequence

| # | Story | Depends on |
|---|---|---|
| 1 | `journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` | — |
| 2 | `journal-calendar/pending-journal_data_model_frontmatter-med-hard.md` | 1 approved contract |
| 3 | `journal-calendar/pending-journal_service_daily_notes-high-med.md` | 1, 2 |
| 4 | `journal-calendar/pending-calendar_data_model-med-med.md` | 1, 2 |
| 5 | `journal-calendar/pending-journal_settings_and_accessibility-med-med.md` | 1, 2; settings registry |
| 6 | `journal-calendar/pending-journal_panel_ui-high-hard.md` | 1–3, 5; approved desktop wireframe |
| 7 | `journal-calendar/pending-calendar_panel_ui-high-hard.md` | 1, 3, 4, 5; approved desktop wireframe |
| 8 | `journal-calendar/pending-journal_mobile_refinement-med-med.md` | 6, 7; approved mobile wireframe |
| 9 | `journal-calendar/pending-journal_extension_host_integration-med-med.md` | 3, 5–7; beta host APIs |

Every UI-facing story requires iterative approval of desktop and mobile mockups: discovery alternative → desktop wireframe → desktop mockup → mobile mockup → implementation increment, with product-owner sign-off at each checkpoint and the approved version recorded in the story. Stories may be split further if a subagent would exceed one focused change set. Do not mark a story complete when an approval gate or unresolved product decision remains open.

## Validation

- Unit tests for date/time boundaries, path/name expansion, frontmatter round trips, templates, metadata normalization, calendar aggregation, empty/error states, and settings validation.
- React tests for panel registration/rendering, keyboard behavior, focus, and accessible names; add mobile viewport tests where practical.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (or `./scripts/qa.sh`) for implementation stories.
- Manual desktop checks against a temporary workspace and real Markdown files; manual Android/iOS checks when mobile stories run.
- At each checkpoint, record the approved questions, mockup version, rejected alternatives, and remaining non-goals in the owning story. No final UX decision may be inferred from a placeholder.

## Status

- ⬜ Product questions answered and discovery/wireframes explicitly approved
- ⬜ Journal data/frontmatter contract approved and tested
- ⬜ Journal service and daily-note creation implemented
- ⬜ Calendar model and metadata aggregation implemented
- ⬜ Settings/accessibility contract implemented
- ⬜ Journal and calendar desktop panels implemented from approved mockups
- ⬜ Mobile refinement approved and verified
- ⬜ Built-in registration wired through `desktopExtensionHost`
