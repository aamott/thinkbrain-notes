# Review: 2026-10-07 — extension subsystem deep pass

Scope: the whole extension surface on a clean branch off `main`
(`chore/extensions-review-compaction`) — `packages/core/src/extensions/`,
`apps/desktop/src/extensions/` (host, bootstrap, local loaders, workspace
bridge, panel UI, builtins), `src-tauri/src/commands/extensions.rs` +
capabilities + `native/` bridge, panel mounting/registry, and a
cross-cutting integration pass over shell/settings/commands consumers.
Seven `routine` reviewers in three batches (core model; desktop host +
local loading; Rust + UI + builtins; then one integration sweep).

**Result:** no critical/high findings. 49 findings — 16 med, 33 low —
mostly easy/trivial. The registry layer (ContributionRegistry +
`useSyncExternalStore`) is the strongest part; defects cluster at seams
where a second mechanism bypasses the registry contract.

## Fixed in the same change set (not listed as findings)

- `desktopExtensionHost.ts` — deactivate hook now receives the same scoped
  context as activate (cached per core context) and `active` is raised for
  it, so a cleanup hook after a *failed* activation doesn't hit a dead
  context. Two new tests pin this.
- `desktopExtensionHost.ts` — `DesktopExtensionEvents` is now an alias of
  core's `EventSubscriber<AppEvents>`; dropped the duplicate
  `RELATIVE_ID_PATTERN` in favor of `EXTENSION_ID_PATTERN`; removed the
  redundant `status`/`statuses` wrappers.
- `bootstrap.ts` — removed dead re-exports already covered by
  `bootstrapRef`; `dispose()` clears `failedManifests` and rebuilds the
  snapshot so `entries()` doesn't report disposed extensions.
- `localExtensions.ts` — `remove()` no-ops on non-directory ids; previously
  it could silently dispose a built-in's registrations. Regression test
  added.
- `localDirectoryLoader.ts` — deleted a byte-identical duplicate of core's
  `getErrorMessage`.
- `extensions.rs` — the 8 MB cap is now enforced by bounded
  `take(MAX+1).read_to_end` instead of a pre-read `metadata.len()` check,
  closing the grow-between-check-and-read hole.
- `ExtensionsPanel.tsx` — `runLocal` helper replaces `getLocalExtensions()!`
  non-null assertions (clear error instead of a raw TypeError);
  `role="alert"` on the error list; duplicate-key fix for identical
  diagnostics.
- `PanelTitle.tsx` — `runPanelAction` wraps results in
  `Promise.resolve(...).catch` so non-Promise thenables from plain-JS
  extensions can't produce unhandled rejections; menu keys survive
  duplicate labels.
- `journal.tsx` — merged duplicate `journalSettings` imports; extracted
  shared `useParsedDefinitions()` hook.
- `journal.test.tsx` — renamed DOM-container locals shadowing the `host`
  module variable.
- `manifest.ts` — removed a redundant truthiness guard.

## Deferred findings

### Medium urgency

| Finding | Difficulty |
|---|---|
| [Persisted extension settings invisible until schema registers + reload](lazy-extension-settings-values-unseen-med-med.md) | med |
| [Settings registry is the one registry without `subscribe`](settings-registry-not-reactive-med-med.md) | med |
| [`settings.set` flushes all staged changes, not just the extension's key](extension-settings-set-flushes-unrelated-staging-med-med.md) | med |
| [Persisted extension tab kinds silently dropped at restore](extension-tab-kind-dropped-on-restore-med-med.md) | med |
| [Command-context effects are desktop-only; no-op on PhoneShell](command-context-effects-desktop-only-med-med.md) | med |
| [Lazy panel placeholder unmounts itself — "not registered" flashes](lazy-panel-placeholder-unreachable-med-med.md) | med |
| [`fs:allow-read/write-text-file` granted unscoped to every window](unscoped-fs-plugin-permissions-med-med.md) | med |
| [Stuck startup-failure extension has no removal path](localextensions-stuck-startup-failure-med-med.md) | med |
| [Panel `availability` honored inconsistently across surfaces](panel-availability-inconsistent-med-easy.md) | easy |
| [`open-calendar` calls `revealPanel` on a left panel — dead call](journal-open-calendar-reveal-noop-med-easy.md) | easy |
| [Invalid journal `root` crashes the editor via `applies` in render](journal-invalid-root-crashes-editor-med-easy.md) | easy |
| [noteStats panel reads settings once; never re-renders](notestats-panel-settings-stale-med-easy.md) | easy |
| [Manifest accepts ids `parseActivationEvent` then silently rejects](activation-event-id-pattern-divergence-med-easy.md) | easy |
| [No dup check within `contributes`; half-registered on throw](manifest-duplicate-contribution-ids-med-easy.md) | easy |
| [Malformed `engines`/`contributes` silently default](manifest-silent-malformed-containers-med-easy.md) | easy |
| [`registerStubs` outside transactional catch → stuck entry](addlocal-extension-throw-leaves-stuck-entry-med-easy.md) | easy |

### Low urgency

| Finding | Difficulty |
|---|---|
| [Canonicalize/open race lets a swap escape the extension dir](extension-file-canonicalize-open-swap-low-hard.md) | hard |
| [Test-host injection omits settings/events/workspace singletons](host-injection-stops-at-five-registries-low-med.md) | med |
| [PanelTitle checkbox reads stale state](paneltitle-checkbox-stale-state-low-med.md) | med |
| [`onCommand:`/`onView:` activation kinds parsed but never consumed](activation-events-command-view-unconsumed-low-easy.md) | easy |
| [`addLocalExtension` trusts the loader; compatibility gate skippable](addlocal-extension-skips-compatibility-gate-low-easy.md) | easy |
| [appUpdater is the only IPC site bypassing `native/`](appupdater-bypasses-native-bridge-low-easy.md) | easy |
| [First `disposeEntry` rejection aborts shutdown cleanup](bootstrap-dispose-first-error-aborts-cleanup-low-easy.md) | easy |
| [Global publication inferred from passed options, not a flag](bootstrap-publish-heuristic-low-easy.md) | easy |
| [Builtin left-panel list can drift from registry](builtin-left-panel-list-drift-low-easy.md) | easy |
| [`^0.x.y` doesn't pin minor unlike npm semver](caret-range-zero-major-semver-low-easy.md) | easy |
| [`extid.relid` convention rebuilt inline at four sites](contribution-id-prefix-built-inline-low-easy.md) | easy |
| [Activated extension missing declared contribution no-ops silently](declared-contribution-missing-after-activation-low-easy.md) | easy |
| [desktopExtensionHost tests leak mutated globals](desktop-host-tests-leak-globals-low-easy.md) | easy |
| [Extension custom controls documented but unreachable](extension-custom-controls-unreachable-low-easy.md) | easy |
| [Late source subscription in ExtensionsPanel](extensions-panel-late-source-subscription-low-easy.md) | easy |
| [`openNote` silently no-ops with no workspace; siblings throw](extensionworkspace-opennote-silent-noop-low-easy.md) | easy |
| [Renderer path check weaker than the Rust normalizer](extensionworkspace-path-check-weaker-than-native-low-easy.md) | easy |
| [hello-notes teaches silent-failure habits](hello-notes-unhandled-errors-low-easy.md) | easy |
| [Capability list can drift from `DesktopExtensionContext` keys](host-capability-list-can-drift-from-context-low-easy.md) | easy |
| [Journal palette commands drop `JournalError` rejections](journal-commands-drop-journalerror-low-easy.md) | easy |
| [`list_managed_workspaces` never invoked; superseded](list-managed-workspaces-unused-command-low-easy.md) | easy |
| [Loader result types force non-null assertions](loader-result-non-null-assertion-low-easy.md) | easy |
| [`sourceURL` comment interpolates unencoded paths](localdirectoryloader-sourceurl-unencoded-low-easy.md) | easy |
| [Persist failure rejects `add` after successful load](localextensions-add-persist-failure-low-easy.md) | easy |
| [Directory identity is raw string equality](localextensions-directory-identity-string-compare-low-easy.md) | easy |
| [media.rs stat+read TOCTOU; 256 MiB cap advisory](media-file-stat-read-toctou-low-easy.md) | easy |
| [Mounted-panel disposable cleanup gap](mounted-panel-disposable-cleanup-low-easy.md) | easy |
| [`noteStats.ts`/`.tsx` shared basename forces `.tsx` import specifier](notestats-shared-basename-low-easy.md) | easy |
| ["Rebuild workspace index" opens an always-unavailable terminal](rebuild-index-opens-unavailable-terminal-low-easy.md) | easy |
| [Shell hook hardcodes `extension-journal-calendar.root` + default](usenotetitle-hardcodes-journal-setting-low-easy.md) | easy |
| [Event-bus error reporter itself unguarded](event-bus-reporter-throw-low-trivial.md) | trivial |
| [`settings-section-${id}` anchor rebuilt inline](opensyncsettings-anchor-id-handbuilt-low-trivial.md) | trivial |
| [`openFile` in workspaceBridge is wired but never consumed](workspace-bridge-openfile-never-consumed-low-trivial.md) | trivial |

## Notes

- **Highest-leverage fix:** make `SettingsRegistry` subscribable and
  re-extract persisted values on `registerSchema` — resolves
  `lazy-extension-settings-values-unseen` and `settings-registry-not-reactive`
  together and removes the activate-before-render sequencing.
- **Already tracked elsewhere:** `read_extension_file`'s
  renderer-chosen `directory` root (`plans/other_tasks/pending-ipc_hardening-low-med.md`)
  and `listNotes` full-vault filtering (`pending-extension_listnotes_prefix-low-med.md`)
  were deliberately not re-filed.
- **Security posture:** extension code is deliberately trusted same-realm JS
  (documented in loader/panel). The remaining real primitives are the two
  findings above plus `unscoped-fs-plugin-permissions`.
- Two duplicate findings were merged/deleted during triage
  (`loader-result-*`, `event-subscriber-unused-duplicate` — the latter was
  fixed in this change set).
