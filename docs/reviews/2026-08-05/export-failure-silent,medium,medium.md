- name: Theme export swallows write failures silently
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsContent.tsx
- lines: 181-189 (handleExport), /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts:147-152 (writeThemeExportFile)
- description: |
    `writeThemeExportFile` returns `false` for both user-cancel AND write
    failure (the native `writeTextFileNative` bridge returns `false` on error
    after logging). The caller `handleExport` in `SettingsContent.tsx` treats
    both identically — it shows "Theme exported." only on `true` and shows
    nothing on `false`:

      void writeThemeExportFile(json).then((written) => {
        if (written) { showStatus("Theme exported."); }
        // On cancel/failure, no message
      });

    The comment "On cancel/failure, no message — the user already saw the
    dialog dismiss" conflates two distinct outcomes. A write failure (disk
    full, permission denied, path invalid) is an error the user must be told
    about; a dialog cancel is a non-event. This violates the project's
    "Fail Loudly" rule (AGENTS.md: "If a command fails, it should fail loudly
    and provide a clear error message. Don't suppress errors or hide them,
    especially in order to make a test succeed.").

    The fix: `writeThemeExportFile` should distinguish cancel (`null`) from
    failure (throw or a typed result), and `handleExport` should surface a
    failure status message. The simplest change is to have
    `writeTextFileNative` re-throw on error (or have `writeThemeExportFile`
    return a discriminated union: `{ ok: true } | { ok: false, reason:
    "cancelled" | "error", message?: string }`).

    `themeImportExport.test.ts` lines 221-228 tests that `writeThemeExportFile`
    returns `false` on write failure but does not assert any user-facing
    surfacing — the UI gap is untested.
- verification: |
    Read `apps/desktop/src/settings/SettingsContent.tsx` lines 181-189.
    Read `apps/desktop/src/settings/themeImportExport.ts` lines 147-152.
    Read `apps/desktop/src/native/fs.ts` — `writeTextFileNative` logs and
    returns `false` on error (does not throw).
    Read `themeImportExport.test.ts` lines 221-228 — confirms `false` is
    returned but no UI surfacing is asserted.
