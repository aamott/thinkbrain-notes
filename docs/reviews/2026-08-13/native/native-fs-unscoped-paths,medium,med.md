- name: `native/fs.ts` reads/writes any absolute path — relies on dialog-picked paths, no defense-in-depth
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/fs.ts
- lines: 28-44, 56-65
- description: |
    `writeTextFileNative(path, contents)` and `readTextFileNative(path)` pass `path` straight to the Tauri FS plugin's `writeTextFile`/`readTextFile` with no path validation. The Tauri FS plugin scope is empty (`tauri.conf.json:25` `"scope": []`) and the capabilities grant `fs:allow-write-text-file` + `fs:allow-read-text-file` (`capabilities/default.json:10-11`), so the plugin will read/write *any* path the OS user can.

    Today the only production caller is `settings/importExportFiles.ts`, which feeds paths that come from `pickFilePath`/`saveFilePath` (native dialogs) — so the user effectively chose the path and traversal is not exploitable from there. The risk is defense-in-depth and forward-looking: any future caller that passes a constructed path (e.g. joining user input) would have unrestricted FS access with no workspace containment check, unlike `read_markdown_file`/`write_markdown_file` (which are workspace-root-scoped on the Rust side) and `read_extension_file` (which canonicalizes and rejects escapes — see `commands.ts:222-228` comment).

    This is not an immediate vulnerability given current callers, but it is a meaningful gap relative to the rest of the native bridge, where workspace containment is enforced server-side. Two cheap mitigations:
      1. Add a doc comment / type branding making clear these helpers are *only* for dialog-picked paths, and reject paths that did not originate from a dialog (e.g. accept a branded `DialogPath` type returned by `pickFilePath`/`saveFilePath`).
      2. Tighten the Tauri FS plugin scope in `capabilities/default.json` rather than granting blanket `allow-write-text-file`/`allow-read-text-file`, since the dialog plugin already returns paths the user authorized.

    Flagging as low urgency because current callers are safe; the medium difficulty reflects that the right fix (scope tightening + branded type) touches capabilities and the dialog return types.
- verification: |
    `tauri.conf.json:25` → `"scope": []` (empty asset scope).
    `capabilities/default.json:10-11` → `fs:allow-write-text-file`, `fs:allow-read-text-file` (no path restriction).
    grep `writeTextFileNative\(|readTextFileNative\(` → only `settings/importExportFiles.ts:32,62`, which uses paths from `saveFilePath`/`pickFilePath` (dialogs).
    `commands.ts:222-228` documents that `read_extension_file` canonicalizes and rejects escapes — the contrast with `fs.ts` is explicit.
- resolution: Deferred — high cost, low reward. The branded `DialogPath` type fix ripples into `dialogs.ts` return types, `fs.ts` signatures, `PickedFile.path`, and ~4 test files (importExportFiles/SettingsSaveBar/themeImportExport/SettingsImportExport) whose `vi.mocked(...).mockResolvedValue("/tmp/...")` calls and `vi.fn<(title: string, defaultName: string) => Promise<string | null>>()` annotations would all need `as DialogPath` casts / re-typing (~15+ edits). The finding itself flags this as medium difficulty and notes current callers are safe (only `settings/importExportFiles.ts`, fed by dialog-picked paths). Defer until a non-dialog caller appears.
