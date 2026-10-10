# Review: 2026-10-07 — extension subsystem deep pass

Scope: the whole extension surface on `chore/extensions-review-compaction` —
`packages/core/src/extensions/`, `apps/desktop/src/extensions/` (host,
bootstrap, local loaders, workspace bridge, panel UI, builtins),
`src-tauri/src/commands/extensions.rs` + capabilities + `native/` bridge,
panel mounting/registry, and a cross-cutting integration pass over
shell/settings/commands consumers. Seven `routine` reviewers in three
batches, then four `routine` fixers on disjoint file scopes.

**Result:** 49 findings — 0 critical/high, 16 med, 33 low. All addressed
(fixed, resolved as duplicates, or documented as decisions).

## Fixed in this change set (finding files deleted)

### Reviewer pass 1 fixes (pre-commit)

- `desktopExtensionHost.ts` — deactivate hook gets the same scoped context
  as activate (cached per core context) and `active` is raised for it;
  `DesktopExtensionEvents` aliased to core's `EventSubscriber<AppEvents>`;
  dropped duplicate `RELATIVE_ID_PATTERN`; removed redundant
  `status`/`statuses` wrappers.
- `bootstrap.ts` — removed dead re-exports covered by `bootstrapRef`;
  `dispose()` clears `failedManifests` and rebuilds the snapshot.
- `localExtensions.ts` — `remove()` no-ops on non-directory ids (it could
  dispose built-in registrations); regression test added.
- `localDirectoryLoader.ts` — deleted a duplicate of `getErrorMessage`.
- `extensions.rs` — 8 MB cap enforced by bounded `take(MAX+1)` read
  instead of pre-read metadata check.
- `ExtensionsPanel.tsx` — `runLocal` helper replaces `!` assertions;
  `role="alert"`; duplicate-key fix.
- `PanelTitle.tsx` — `Promise.resolve().catch` for non-Promise thenables;
  index-stable menu keys.
- `journal.tsx` — merged duplicate imports; extracted
  `useParsedDefinitions()`.
- `manifest.ts` — removed a redundant truthiness guard.

### Fixer pass (findings addressed)

- **Core/manifest:** duplicate contribution ids rejected at parse;
  malformed `engines`/`contributes` emit `manifest_invalid_field`;
  manifest activation events validated against `parseActivationEvent`
  (single source of truth); `^0.x.y` caret ranges pin minor/patch per npm
  semver; event-bus error reporter guarded; loader results are
  discriminated unions (no more `!` assertions); `resolveEntryPath`
  rejects control chars and `sourceURL` percent-encodes path segments.
- **Host/bootstrap:** `registerStubs` runs inside the transactional
  try/catch with full rollback; `addLocalExtension` evaluates
  compatibility itself; `dispose` aggregates errors instead of aborting;
  explicit `publish` option replaces the options-inference heuristic;
  missing declared contributions log a diagnostic; shared
  `qualifyContributionId`/`splitContributionId` replace inline
  `extid.relid` construction; capabilities derive from context keys at
  compile time; host tests restore mutated globals.
- **Workspace/local:** `openNote` throws "No workspace is open" like its
  siblings; `assertRelativePath` mirrors the Rust normalizer (backslashes,
  drive-relative, whitespace/collapsed segments); `add` survives persist
  failure with a warning diagnostic; directory identity normalizes
  separators/trailing slashes; dead `openFile` bridge wiring removed.
- **Builtins/UI:** journal degrades gracefully on invalid `root` instead
  of crashing the editor; journal palette commands report `JournalError`;
  noteStats panel watches settings live; `noteStatsModel.ts` rename;
  hello-notes handles rejections properly; mount-point teardown supports
  Disposable/array returns with per-item error reporting; PanelTitle menu
  keeps optimistic checked state; ExtensionsPanel re-follows a
  late-published local-extensions ref.
- **Shell/Rust:** extension commands can reveal left panels via the live
  registry (`revealPanel` is side-aware); `isBuiltInLeftPanel` parity is
  pinned by test; dead `rebuild-index` command removed; appUpdater routes
  through `native/`; `read_media_file_bytes` enforces its cap at read
  time; `list_managed_workspaces` command removed (helper kept for
  `list_known_workspaces`); `useNoteTitle` reads the journal root key and
  default from the journal schema instead of hardcoding;
  control-registry docs corrected; sync-settings anchor uses
  `sectionAnchorId()` with a loud miss.

### Fixer pass 2 (medium-difficulty findings)

- **Settings lifecycle:** `SettingsRegistry` is subscribable with frozen
  snapshots; settings UI reads it reactively; registering a schema merges
  persisted values for newly-known `extension-*` keys without clobbering
  in-session edits; `settings.set` writes only its own key via
  `setSingleSettingImmediately`; host injection covers
  settings/events/workspace singletons.
- **Activation seam:** panel stubs survive the activation window and are
  swapped atomically when the real contribution registers — the
  "Starting extension…"/failure placeholder is reachable and "not
  registered" no longer flashes; persisted `ext.kind` tabs restore via
  placeholder tab views that wake the owning extension instead of being
  silently dropped.
- **Shell parity:** `PhoneShell` registers a command-surface override so
  extension commands' panel effects route to phone UI (routes, inspector
  overlay) instead of dead desktop dock writes; unavailable right panels
  are disabled in the ⋯ menu/pinned icons, while left icons are dimmed
  but still clickable (left contributions render their own `Unavailable`
  explanation); failed startup directories render as entries with
  Retry/Remove (`forget`).
- **Filesystem boundary:** `pick_and_read_text_file` /
  `save_and_write_text_file` fuse the dialog into the Rust command — the
  renderer never supplies a path — and the unscoped
  `fs:allow-read/write-text-file` grants are dropped from capabilities.
- **E2E follow-ups:** restored the `list` role on the load-errors list
  (alert moved to a wrapper); the startup-failure spec asserts the new
  actionable failure entries.

## Remaining findings

None — the last two were closed as documentation decisions:

- `onCommand:`/`onView:` parsed but unconsumed — documented in
  `activation.ts`: only `onStartup` changes behaviour; contribution stubs own
  lazy activation.
- Canonicalize/open swap — documented in `extensions.rs`; the open-time fix
  is now an action item in `plans/other_tasks/pending-ipc_hardening-low-med.md`.

## Notes

- **Already tracked elsewhere:** `read_extension_file`'s renderer-chosen
  `directory` root (`pending-ipc_hardening-low-med.md`) was deliberately
  not re-filed. `listNotes` full-vault filtering was fixed in the journal
  latency pass (`extension_listnotes_prefix` — `plans/other_tasks/done-summary.md`).
- **Security posture:** extension code is deliberately trusted same-realm
  JS (documented). `unscoped-fs-plugin-permissions` was closed in pass 2
  (dialog fused into the Rust commands); the remaining real primitive is
  the already-tracked IPC gap above.
- Two duplicate findings were merged during triage
  (`loader-result-*`, `event-subscriber-unused-duplicate` — both fixed).
