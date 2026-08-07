# Journal & Calendar

> Dedicated feature epic for an optional, local-first journal and journaling calendar built on ordinary Markdown notes. Read `plans/app-vision.md`, `plans/technical-decisions.md`, `user-noted-todo.md`, the mobile epic, the UI-shell plans, and `plans/extensions/pending-beta_builtin_extensions-med-med.md` before starting any story.

## Collaboration gate — SATISFIED 2026-08-07

The product-owner answers are recorded as decisions D1-D47 in
`journal-calendar/pending-journal_discovery_and_wireframes-low-med.md`, together with the
approved moodboard, IA and mobile artifacts. **Downstream stories may now proceed within
those decisions.** The gate remains closed for items the discovery log lists as open, and
each child story carries its own STOP gate for its undecided items. Superseding decisions
are recorded as new D-numbers, never by editing earlier ones.

**STOP gate — status:** discovery is complete and approved (D1-D47, artifacts approved
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
- **Indexing/search dependency (D16/D41).** Full-text search and metadata facets reuse the
  platform-owned disposable index; metadata facets wait on
  `indexing-search/pending-frontmatter_metadata_facets-high-hard.md`. Browsing, dates,
  grouping and lazy previews do not depend on that work. If the index is unavailable,
  browsing and date filters remain usable and metadata facets report unavailable — never
  fall back to a full-file scan or a journal-owned cache.


## Platform reality check — 2026-08-07

An extension platform core, contributed tab kinds, and a Markdown live-preview editor
shipped during discovery. D44/D45 now choose the two remaining platform paths; both are
tracked prerequisites rather than open product decisions.

**Shipped and usable by the journal:**

| Surface | Where |
|---|---|
| `desktopExtensionHost` singleton, `register` / `registerAndActivate` | `apps/desktop/src/extensions/desktopExtensionHost.ts` |
| `DesktopExtensionContext` — `commands`, `panels`, `editorHooks`, `settings`, `tabs`, `workspace` | same |
| Contributed tab kinds: `desktopTabRegistry` singleton, `DesktopTabView.factory`, `subscribe()`, disposable registration | `apps/desktop/src/tabs/tabRegistry.ts` |
| Internal `openTab(kind, title)` | `apps/desktop/src/shell/DesktopShell.tsx`; not exposed by `DesktopExtensionContext.workspace` |
| Notes read/write/create/open for extensions (`DesktopExtensionWorkspace`) | `apps/desktop/src/extensions/desktopExtensionHost.ts` |
| `ExtensionManifest`; `contributes` supports **only** `commands` and `panels` | `packages/core/src/extensions/manifest.ts` |
| Activation events `onStartup` / `onCommand:<id>` / `onView:<id>`, lazy activation with stubs | `packages/core/src/extensions/activation.ts`, `apps/desktop/src/extensions/bootstrap.ts` |
| Disposable scope (`DisposableStore`, `context.subscriptions`) | `packages/core/src/lifecycle.ts` |
| Panel contributions (`side: "left" \| "right"`) | `apps/desktop/src/panels/panelRegistry.tsx` |
| Editor hooks — CodeMirror `Extension[]` / `KeyBinding[]` only | `apps/desktop/src/tabs/editorHookRegistry.ts` |
| Reference built-in to copy | `apps/desktop/src/extensions/builtins/noteStats.tsx` |

**Gap 1 — REGISTRATION CLOSED; OPENING BRIDGE PENDING.** A contributed calendar kind with a
`factory` renders through `DesktopExtensionContext.tabs` without shell/core edits. However,
internal `openTab(kind, title)` is not exposed on `DesktopExtensionContext.workspace`; story 9
must choose an extension-facing open route before the popout action ships. `DesktopTabContext`
remains `{ rootPath, tabId }`. Details: `pending-calendar_tab_ui-high-hard.md`.

Newly available: `DesktopExtensionContext.workspace` reads, writes, creates and opens notes.
Stories 3 and 9 must decide whether the journal service uses it or the existing workspace
adapters — a real question, not a settled one.

**Gap 2 — PATH CHOSEN D44; platform prerequisite pending.** The metadata widget uses a
new observable disposable React editor-header registry, not CodeMirror `editorHooks`.
`plans/extensions/pending-editor_header_contribution-high-med.md` owns the slot and
post-mount registration/disposal behavior; story 6 consumes it.

**Gap 3 — PATH CHOSEN D45; platform prerequisite pending.** Extend shared extension
settings with workspace scope and UI rendering; no journal-owned fallback. Workspace
field definitions overlay globals by id, and removed values remain unconfigured but visible.
`plans/extensions/pending-extension_settings-low-med.md` owns the platform work.

**Gap 4 — CLOSED D47.** Built-in extension ids are `journal-calendar`, `git`, and
`agent-chat`; journal contribution ids are fixed in the discovery log and beta built-ins story.

**Repo hygiene note, for a human to resolve — not changed here.** Three stories in
`plans/extensions/` are named `done-` (`extension_manifest_format`,
`extension_capability_compatibility`, `extension_lifecycle_bootstrap`) but their bodies
still read "Not implemented" or "Partially implemented", while the corresponding code has
in fact shipped. `pending-internal_contribution_points-low-med.md` has every acceptance
criterion checked and looks like it should be `done-`. Those files belong to the
extensions epic, so this epic only reports the inconsistency.

## Story sequence

| # | Story | Depends on |
|---|---|---|
| 1 | `journal-calendar/pending-journal_discovery_and_wireframes-low-med.md` ✅ complete | — |
| 2 | `journal-calendar/pending-journal_data_model_frontmatter-med-hard.md` | 1 approved contract |
| 3 | `journal-calendar/pending-journal_service_daily_notes-high-med.md` | 1, 2 |
| 4 | `journal-calendar/pending-calendar_data_model-med-med.md` | 1, 2 |
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

- ✅ Product questions answered and discovery/wireframes explicitly approved (D1-D47)
- ⬜ Journal data/frontmatter contract approved and tested
- ⬜ Journal service and daily-note creation implemented
- ⬜ D41 platform index supports frontmatter facet queries
- ⬜ Calendar model and metadata aggregation implemented
- ⬜ Settings/accessibility contract implemented
- ⬜ Journal popout and calendar tab implemented from approved mockups
- ⬜ Mobile refinement approved and verified
- ⬜ Built-in registration wired through `desktopExtensionHost`
- 🟨 Gap 1 partial: tab registration/factory shipped; extension-facing tab-open bridge still pending
- ✅ Gap 2 path chosen (D44): React editor-header slot + observable registry; implementation pending
- ✅ Gap 3 path chosen (D45): shared workspace-scoped extension settings; implementation pending
- ✅ Gap 4 closed (D47): canonical built-in and journal contribution ids approved
