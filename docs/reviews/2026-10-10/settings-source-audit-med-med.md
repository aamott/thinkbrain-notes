# Audit: `apps/desktop/src/settings/` — bloat, over-testing, consolidation

Task: `plans/other_tasks/pending-audit_settings_source-med-med.md`. Read-only audit; no source changes.

## Summary

- **Source**: 5,262 lines across 38 files (excl. tests + 262 lines of test helpers).
- **Tests**: 6,749 lines across 24 files → **1.28×** test-to-source ratio (highest in app).
- Largest gaps: `settingsStore.test.ts` 1,243 vs 693 src; `useEffectiveValue.test.ts` 102 vs 24 (4.3×); `appSettingsFile.test.ts` 137 vs 39 (3.5×); `SettingsTab.test.tsx` 413 vs 133 (3.1×); `useTransientStatus.test.tsx` 198 vs 74 (2.7×); `ThemeProvider.test.tsx` 601 vs 240 (2.5×, mostly justified — real async races).
- `settingsStore.ts` (693) exceeds the 500-line preferred limit despite prior splits.

**Top 3 recommendations**
1. Deduplicate effective-value precedence tests and document-chain wrapper tests → **~250 test lines** removed, zero coverage loss.
2. Delete `importExportFiles.ts` and the one-line `write*File` wrappers → **~70 lines**, removes a 3-deep pass-through chain.
3. Unexport test-only symbols/constants (`promoteRecentWorkspace`, `fuzzyScore`, `buildThemeExportPayload`, `parseDesktopState`, `DESKTOP_STATE_*` constants, etc.) and split the registry/live-hooks block out of `settingsStore.ts` → **~90 source lines** moved, file back under 500.

## Findings

| # | Finding | Files | Est. savings | Risk |
|---|---------|-------|--------------|------|
| 1 | Effective-value precedence tested 3× | settingsStore.test.ts, useEffectiveValue.test.ts | ~130 test lines | Low |
| 2 | documentChain tested twice via thin wrappers | appSettingsFile.test.ts, workspace/workspaceSettingsFile.test.ts | ~120 test lines | Low |
| 3 | 3-layer pass-through on import/export file I/O | importExportFiles.ts, settingsImportExport.ts, themeImportExport.ts | ~70 lines | Low |
| 4 | Dead / test-only exports | desktopState.ts, fuzzyMatch.ts, themeImportExport.ts, +6 files | ~15 symbols | Low |
| 5 | settingsStore.ts >500 lines; registry+hooks block separable | settingsStore.ts | ~90 lines moved | Low |
| 6 | SettingsTab.test re-covers SettingsContent/Nav internals | SettingsTab.test.tsx | ~150 test lines | Med |
| 7 | settingHighlight.ts over-built for a 1.2s row flash | settingHighlight.ts (+145-line test) | ~90 lines | Med |
| 8 | Triplicated "parse JSON → isRecord" helpers | desktopState.ts, settingsStore.ts, settingsImportExport.ts | ~15 lines | Low |
| 9 | Merge tiny theme modules | themeAdapter.ts, themeResolution.ts, themeInjection.ts | ~25 lines + plumbing | Low |
| 10 | Minor: `describeError` duplicates `getErrorMessage` | desktopStatePersistence.ts:102-105 | ~4 lines | Trivial |

### 1. Effective-value precedence tested three times (over-testing)

`resolveEffectiveValue` is an 18-line pure function (`settingsHelpers.ts:38-55`). It is pinned by a 14-case table at `settingsStore.test.ts:546-742` plus a store-delegation wiring test at `:744-798`. On top of that:

- `settingsStore.test.ts:472-545` (`describe("getEffectiveValue")`, ~73 lines) re-tests staged>loaded>default and falsy handling through the store — all cases already in the table, and the wiring test already proves delegation.
- `useEffectiveValue.test.ts:51-87` re-runs 4 of the same precedence cases through React. Only `"updates when the staged value changes"` (:89-101) tests something the others can't (reactivity).

**Action**: delete the `getEffectiveValue` describe except 1 smoke test; keep only the reactivity test in `useEffectiveValue.test.ts`. **~130 lines**, low risk.

### 2. documentChain behavior tested twice through two thin wrappers

`appSettingsFile.test.ts` (137) and `workspace/workspaceSettingsFile.test.ts` (150) run near-identical scenarios against `createDocumentChain` (`native/documentChain.ts`, itself untested): "reads what was written", "previous writer's result", "carries on after failure", "recomputes revision on conflict", "precondition", "gives up", "returns written doc". 7 of 8 `appSettingsFile` tests are mirrored in the workspace file; only "one workspace's writes don't wait on another's" is unique.

**Action**: move chain semantics to a single `native/documentChain.test.ts` (~170 lines) and reduce each wrapper test to a thin wiring smoke test (~25 lines). **~120 lines net**, low risk — also fixes the real gap that `documentChain` has no direct tests.

### 3. Three-layer pass-through on import/export file I/O

`writeExportFile` (`settingsImportExport.ts:106-108`) → `writeJsonViaSaveDialog` (`importExportFiles.ts:25-31`) → `saveAndWriteTextFile` (`native/fs.ts:34`), and the same for `writeThemeExportFile`/`readPickedFile`. `importExportFiles.ts` adds zero behavior — `native/fs.ts` already documents the identical "false/null = cancel, failures throw" contract.

**Action**: call `native/fs` directly from `settingsImportExport.ts`/`themeImportExport.ts`; delete `importExportFiles.ts` (54) and the two `write*File` wrappers (~14), folding the default filenames into callers. **~70 lines + a whole file**, low risk. Keep `PickedFile` only if a signature needs a named type (it doesn't — `NativePickedTextFile` exists).

### 4. Dead / test-only exports (grep-verified)

Used only inside their own file, or only by their own test (dead-ish):

| Symbol | Location | Used by |
|---|---|---|
| `promoteRecentWorkspace` | desktopState.ts:369 | own file only — **no external or test use** |
| `DESKTOP_STATE_VERSION`, `MAX_RECENT_WORKSPACES`, `MIN_PANEL_WIDTH`, `MAX_PANEL_WIDTH` | desktopState.ts:4-8 | own file only |
| `WorkspaceViews`, `WorkspaceTabState`, `CollapsedGroupsUpdate` | desktopState.ts:29,44,57 | own file only |
| `parseDesktopState` | desktopState.ts:170 | own test only (self-declared test seam) |
| `fuzzyScore` | fuzzyMatch.ts:40 | own test only |
| `buildThemeExportPayload`, `readCurrentTokenValues`, `readCurrentThemeBase` | themeImportExport.ts:66,99,126 | own test only |
| `ThemeProviderContext` | ThemeProvider.tsx:23 | own file only |
| `DESKTOP_STATE_SOURCE`, `SETTINGS_QUARANTINE_SOURCE` | persistence/quarantine adapters | own tests only |
| `SaveSettingsResult`, `ExportPayload`, `PickedFile`, `TransientStatus`, `FuzzySearchResult` | various | own files only (types; cheapest to keep) |

Also: `createSettingsStore` (`settingsStore.ts:204`) is called in production only for the singleton at :632 — all other callers are tests. Legitimate DI seam, but the factory exists purely for testability; note it, don't remove.

**Action**: unexport the function/constant cases (keep types — they cost nothing and document shapes); where a test needs the seam, test through the public path instead (`buildThemeExport` covers `buildThemeExportPayload`). **~15 symbols**, low risk.

### 5. settingsStore.ts over the 500-line guideline

`settingsStore.ts` is 693 lines. The clean split: the registry singleton + three `useSyncExternalStore` hooks (`appSettingsRegistry`, `useSettingsModules`, `useAllSettingsModules`, `useSettingDefinitions`, lines 50-68 and 634-685, ~90 lines) move to a `settingsRegistry.ts`. `useEffectiveValue.ts` (24) could fold in there too — it is one 12-line function. **~115 lines moved**, settingsStore back near 500. Low risk; imports change in ~10 files.

### 6. SettingsTab.test re-covers SettingsContent/SettingsNav internals

`SettingsTab.test.tsx` (413 on a 133-line component) mounts the whole tab to test things owned by children: "renders all sections and their controls" (:215-237) duplicates `SettingsContent.test.tsx:114-136`; "highlights the active section with aria-current after scroll-spy" (:197-214) duplicates `SettingsContent.test.tsx:189-196` plus nav rendering; "calls stageChange when a control is interacted with" (:249-261) is a `SettingsContent` row concern. **~150 lines** could move to the dedicated files or be cut. Medium risk — keep the genuinely tab-level tests (drawer/scrim, load orchestration, remount-preservation).

### 7. settingHighlight.ts over-built for a 1.2s row flash

`settingHighlight.ts` (135) implements a bespoke pub/sub with subscriber-error isolation, replay-on-subscribe, and an `import.meta.hot` dispose block — for "flash a row for 1.2s". A small zustand slice (the app already uses zustand everywhere) or ~40-line emitter gives equivalent semantics for free; the store-slice variant also survives HMR by construction. The robustness was added deliberately (see `plans/maintenance/done-settings_highlight_bus-low-med.md`), so verify those cases — a zustand rewrite covers them natively. **~90 lines source + test simplification**, medium risk.

### 8. Triplicated "parse JSON → isRecord" helper

`parseAppSettingsRecord` (`desktopState.ts:174-185`), the inline parse in `mergeScope` (`settingsStore.ts:586-594`), and `extractSettingsMap` (`settingsImportExport.ts:154-170`) all do try/catch `JSON.parse` + `isRecord`. Extract one `parseJsonRecord(contents): Record<string,unknown> | null` (lives naturally next to `isRecord` consumers, e.g. `settingsHelpers.ts`). **~15 lines**, trivial risk.

### 9. Merge the three tiny theme-DOM modules

`themeAdapter.ts` (76), `themeResolution.ts` (21), `themeInjection.ts` (100) — three files under 100 lines, all "theme runtime" (native bridge + DOM), all consumed only by `ThemeProvider`/`themeImportExport`/`ThemeSectionControls`. Merging into `themeRuntime.ts` (~200) removes three module headers' worth of doc boilerplate and import plumbing. **~25 lines**, low risk.

### 10. `describeError` duplicates `getErrorMessage`

`desktopStatePersistence.ts:102-105` re-implements core's `getErrorMessage` (`packages/core/src/settings/internal.ts:27`) with a `|| error.name` tweak. Use `getErrorMessage` (or fold the `name` fallback into it). **~4 lines**, trivial.

### Not flagged (verified OK)

- `desktopStatePersistence.test.ts` (176) deliberately tests only the notification contract — clean layering, keep.
- `ThemeProvider.test.tsx` (601): 16 tests each covering a distinct race/base-precedence case; the provider's async surface genuinely warrants it.
- `GitLinkControl.tsx` (326) + `signInCopy.ts`: sync sign-in UI inside `settings/controls/` looks like scope creep but is forced by `controlRegistry` registration; a move is cosmetic, not counted.
- `scrollSpyTestUtils.ts`/`settingsTestHelpers.ts` (262): shared harnesses that already fixed prior duplication — keep.
- Two `readAppSettings` paths (`SettingsStoreGateway` via document chain vs `DesktopStateGateway` via raw `invokeNativeCommand`): divergent but deliberate — `update_desktop_state` is atomic in Rust; the read path could share `readAppSettingsDocument` for consistency, worth ~0 lines, noted only.
