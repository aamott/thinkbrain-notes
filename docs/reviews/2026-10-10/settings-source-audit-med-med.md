# Audit: `apps/desktop/src/settings/` — bloat, over-testing, consolidation

Task: `audit_settings_source` (done — see `plans/other_tasks/done-summary.md`). Remaining findings after the `settings_source_cleanup` follow-up.

## Summary

Findings 1, 2, 3, and 5 are addressed: precedence/chain tests are consolidated,
export-write wrappers are removed (`importExportFiles.ts` was already absent),
and registry/hooks plus public types are separated from the store. The store is
515 lines; it was not further fragmented just to meet the preferred 500-line
limit. Original line-saving estimates were approximate, not acceptance targets.

The remaining suggestions below were not part of that behavior-preserving cleanup.

## Findings

| # | Finding | Files | Est. savings | Risk |
|---|---------|-------|--------------|------|
| 4 | Dead / test-only exports | desktopState.ts, fuzzyMatch.ts, themeImportExport.ts, +6 files | ~15 symbols | Low |
| 6 | SettingsTab.test re-covers SettingsContent/Nav internals | SettingsTab.test.tsx | ~150 test lines | Med |
| 7 | settingHighlight.ts over-built for a 1.2s row flash | settingHighlight.ts (+145-line test) | ~90 lines | Med |
| 8 | Triplicated "parse JSON → isRecord" helpers | desktopState.ts, settingsStore.ts, settingsImportExport.ts | ~15 lines | Low |
| 9 | Merge tiny theme modules | themeAdapter.ts, themeResolution.ts, themeInjection.ts | ~25 lines + plumbing | Low |
| 10 | Minor: `describeError` duplicates `getErrorMessage` | desktopStatePersistence.ts:102-105 | ~4 lines | Trivial |

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
