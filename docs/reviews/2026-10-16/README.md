# 2026-10-16 — Whole-repo pruning audit

Nine parallel audits across `apps/desktop/src/**`, `packages/core`,
`packages/ui`, and `src-tauri`, each verifying candidates by repo-wide
zero-hit search (identifier + literal contract strings: Tauri commands,
event channels, settings keys, panel/command ids). ~35 findings were filed;
all but the two below were implemented on `chore/codebase-pruning` and their
files deleted per convention. `pnpm qa` green after fixes; net ≈ −344 lines.

## Skipped — contract-blocked (product/pending-epic calls)

Two findings were left unimplemented on this branch and later deleted by
owner decision; the reasons they were not pruned remain on record:

| Finding | Why it was not implemented here |
|---|---|
| `core-tasks-extraction-writeonly` | `.tasks`/`MarkdownTask`/`extractMarkdownTasks` documented as shipped in `wip-note-model` — removal is a product decision |
| `core-calendar-writeonly-aggregate` | `wip-calendar_tab_ui` plans wiring the predicate/status surface |

## Report-only observations (not filed — need a decision)

- **`useExternalDocumentSync` filters to `tab.kind === "editor"` only** —
  `code-editor` tabs never get external-change reload/conflict handling.
  Possibly deliberate, possibly a gap.
- **Persisted `merge`/`version-diff` tabs restore gutted** —
  `tabToPersisted`/`restoreTab` don't serialize `comparedNotePath`/
  `versionChangeId`/`resource`; a restored comparison tab renders with
  null props.
- **`apps/desktop/src/AGENTS.md` module-map line is stale** — claims
  `agent/AssistantPanel.tsx` "consumes Tauri events directly"; it's a static
  mock. (File is protected; needs an explicit edit decision.)
- **`tags` panel + `graph`/`browser` tab kinds** carry stale "until indexing"
  /unavailable copy — features genuinely unimplemented; the `open-graph`
  palette copy was corrected, panel/tab-kind copy left as-is since it names
  the real blocker loosely enough.
- **Extension-API surface kept despite zero in-repo callers** — documented
  contract (`editorHooks`, `onCommand:`/`onView:` activation events,
  `panelIcons` string keys, `context.events` e.g. `note.opened` consumed by
  e2e). Kept by policy.

## Kept-and-why highlights (looked dead, verified live)

- Serde/wire payload fields (`ConflictBase.*`, `ConflictRate.decisions`,
  `Synced` on the Rust side) — parse tolerance is policy.
- Test-only seams the codebase deliberately keeps (`mountPreview`,
  `wikiLinkCompletionSourceForTest`, `settingsStore` injection points) —
  documented in-file; retained per prior audit guidance.
- `stepHistory`'s `undefined` guard and `openLinkAt`'s `onOpenLink` recheck —
  required by `noUncheckedIndexedAccess`/optional-prop typing, not deletable.
- Watcher `default:` arm, `isWorkspaceRenameResult` check, `isTauri()` guards
  — reachable through native version skew, SSR/test envs, or forced-cast
  tests; live.
