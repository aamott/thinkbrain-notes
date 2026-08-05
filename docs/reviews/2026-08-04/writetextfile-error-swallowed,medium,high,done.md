- name: writeTextFileNative swallows write errors; export silently reports success
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/fs.ts
- lines: 25-34 (also settingsImportExport.ts:104-109)
- description: |
    `writeTextFileNative` (fs.ts:25-34) does NOT wrap `writeTextFile(path, contents)` in a try/catch. On success it returns `true`; on failure the promise rejects and the error propagates to the caller. That part is fine ("fail loudly").

    HOWEVER, the caller `writeExportFile` (settingsImportExport.ts:104-109) does:
    ```
    export async function writeExportFile(json: string): Promise<boolean> {
      const path = await saveFilePath("Export settings", "thinkbrain-settings.json");
      if (path === null) return false;
      return writeTextFileNative(path, json);
    }
    ```
    It returns the `Promise<boolean>` directly. If `writeTextFile` rejects (disk full, permission denied, path invalid), the rejection propagates out of `writeExportFile` as an *unhandled* rejection unless every caller wraps it. The function's documented contract (lines 100-103) says it "Returns `true` if the file was written, `false` if the user cancelled the dialog or the runtime is not Tauri" — it says nothing about throwing, so callers (the export UI button handler) likely treat the awaited result as `boolean` and will not catch.

    This is an asymmetric error-handling gap: read errors are swallowed and returned as `null` (fs.ts:50-55, readTextFileNative), but write errors throw. The import path correctly handles `readTextFileNative` returning `null` (settingsImportExport.ts:213-214), but the export path has no equivalent guard for write failures.

    Recommended fix: either (a) wrap `writeTextFile` in try/catch and return `false` on failure (matching the read helper's pattern and the documented boolean contract), logging the error loudly via `console.error`; or (b) update the `writeExportFile` doc/return type to `Promise<boolean | never>` and ensure the export UI button handler catches and surfaces the error in a toast/banner. Option (a) is more consistent with the existing read-side pattern and the "fail loudly" rule (log + typed result).

- verification: |
    Read fs.ts:25-34 — writeTextFileNative has no try/catch around writeTextFile; rejects on failure.
    Read fs.ts:46-56 — readTextFileNative DOES try/catch and returns null on failure (asymmetric).
    Read settingsImportExport.ts:104-109 — writeExportFile awaits saveFilePath then returns writeTextFileNative's promise directly with no catch; doc says boolean return only.
    Read settingsImportExport.ts:209-214 — importSettings correctly handles readTextFileNative's null return; no equivalent exists for write.
