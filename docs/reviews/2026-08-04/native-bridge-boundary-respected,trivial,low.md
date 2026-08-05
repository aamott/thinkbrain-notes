- name: Native bridge boundary respected — no direct Tauri IPC outside native/ (confirmed OK)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/dialogs.ts
- lines: 1-59 (also native/fs.ts:1-56)
- description: |
    NOT a bug — confirmation that the reviewed settings/native files respect the AGENTS.md IPC boundary rule ("UI components must never invoke Tauri IPC directly. Route all native operations through `native/`").

    Findings:
      - `dialogs.ts` and `fs.ts` live in `native/` and are the ONLY importers of `@tauri-apps/plugin-dialog` (`open`, `save`) and `@tauri-apps/plugin-fs` (`writeTextFile`, `readTextFile`) plus `@tauri-apps/api/core` (`isTauri`). They re-export typed wrappers (`pickFilePath`, `saveFilePath`, `writeTextFileNative`, `readTextFileNative`).
      - `settingsImportExport.ts` imports only the wrappers (`from "../native/dialogs"`, `from "../native/fs"`), never the Tauri plugins directly. ✓
      - `settingsStore.ts` routes through `invokeNativeCommand` from `../native/commands` (line 16) — the native bridge. ✓
      - `desktopState.ts` also uses `invokeNativeCommand` from `../native/commands` (line 1). ✓
      - `ThemeProvider.tsx` imports `isTauri` from `@tauri-apps/api/core` directly (line 3). This is a minor boundary flex: `isTauri` is a runtime check, not an IPC call, so it doesn't violate the *IPC* rule — but for consistency it could be re-exported from `native/` so UI files have zero `@tauri-apps/*` imports. `SettingsTab.tsx` also imports `isTauri` directly (line 14). Low priority; flag for consistency.

    The `themeService.ts` dead-code file (separate finding) imports `invokeNativeCommand` from `../native/commands` correctly — its dead-ness is the issue, not its boundary.

- verification: |
    grep `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` → only imported in native/dialogs.ts and native/fs.ts.
    grep `@tauri-apps/api/core` (isTauri) → imported in native/dialogs.ts, native/fs.ts, ThemeProvider.tsx, SettingsTab.tsx (runtime check only, not IPC).
    Read settingsImportExport.ts:32-33 — imports from ../native/dialogs and ../native/fs (wrappers only).
    Read settingsStore.ts:16 and desktopState.ts:1 — import invokeNativeCommand from ../native/commands.
