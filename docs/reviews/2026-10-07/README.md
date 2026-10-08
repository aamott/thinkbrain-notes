# Review: 2026-10-07 — extension subsystem deep pass

Scope: the whole extension surface on `chore/extensions-review-compaction` —
`packages/core/src/extensions/`, `apps/desktop/src/extensions/` (host,
bootstrap, local loaders, workspace bridge, panel UI, builtins),
`src-tauri/src/commands/extensions.rs` + capabilities + `native/` bridge,
panel mounting/registry, and a cross-cutting integration pass over
shell/settings/commands consumers. Seven `routine` reviewers in three
batches, then four `routine` fixers on disjoint file scopes.

**Result:** 49 findings — 0 critical/high, 16 med, 33 low. 37 addressed in
this branch (fixed or resolved as duplicates); 12 remain below.

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

## Remaining findings

| Finding | Urgency | Difficulty | Note |
|---|---|---|---|
| [Settings registry is the one registry without `subscribe`](settings-registry-not-reactive-med-med.md) | med | med | Highest-leverage pair with the next row — one fix covers both |
| [Persisted extension settings invisible until schema registers + reload](lazy-extension-settings-values-unseen-med-med.md) | med | med | Journal can write into the wrong folder for the session |
| [Persisted extension tab kinds silently dropped at restore](extension-tab-kind-dropped-on-restore-med-med.md) | med | med | Needs a `contributes.tabs` stub path or deferred restore |
| [`settings.set` flushes all staged changes](extension-settings-set-flushes-unrelated-staging-med-med.md) | med | med | Needs a scoped write path in settingsStore |
| [Lazy panel placeholder unmounts itself](lazy-panel-placeholder-unreachable-med-med.md) | med | med | Needs atomic stub→real swap in registry/bootstrap |
| [Command-context effects are desktop-only](command-context-effects-desktop-only-med-med.md) | med | med | PhoneShell ignores dock setters; needs per-chrome effects |
| [Stuck startup-failure extension has no removal path](localextensions-stuck-startup-failure-med-med.md) | med | med | Panel + store work |
| [`fs:allow-read/write-text-file` unscoped in capabilities](unscoped-fs-plugin-permissions-med-med.md) | med | med | Real hardening; needs scoped commands or `fs:scope` |
| [Panel `availability` honored inconsistently](panel-availability-inconsistent-med-easy.md) | med | easy | Skipped by fixer — needs DesktopShell/ActivityBar wiring, not fabricable context |
| [Test-host injection omits settings/events/workspace](host-injection-stops-at-five-registries-low-med.md) | low | med | |
| [`onCommand:`/`onView:` activation kinds parsed but unconsumed](activation-events-command-view-unconsumed-low-easy.md) | low | easy | Product decision: implement lazy activation or drop the kinds |
| [Canonicalize/open swap can escape the extension dir](extension-file-canonicalize-open-swap-low-hard.md) | low | hard | Defense-in-depth; `directory` root is already renderer-chosen (tracked in `plans/other_tasks/pending-ipc_hardening-low-med.md`) |

## Notes

- **Already tracked elsewhere:** `read_extension_file`'s renderer-chosen
  `directory` root (`pending-ipc_hardening-low-med.md`) and `listNotes`
  full-vault filtering (`pending-extension_listnotes_prefix-low-med.md`)
  were deliberately not re-filed.
- **Security posture:** extension code is deliberately trusted same-realm
  JS (documented). The remaining real primitives are
  `unscoped-fs-plugin-permissions` plus the already-tracked IPC gap.
- **Known stragglers:** `PhoneShell.testHarness.tsx:71` still has a dead
  mock branch for the removed `list_managed_workspaces` (string-typed,
  compiles fine).
- Two duplicate findings were merged during triage
  (`loader-result-*`, `event-subscriber-unused-duplicate` — both fixed).
