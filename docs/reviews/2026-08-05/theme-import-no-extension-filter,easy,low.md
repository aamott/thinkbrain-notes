- name: Theme import/export dialogs accept any file extension
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/themeImportExport.ts
- lines: 147-152, 184-186, /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/dialogs.ts:30-44, 56-66
- description: |
    `pickFilePath` and `saveFilePath` (native/dialogs.ts) call Tauri's
    `open`/`save` with no `filters` argument. The theme import flow
    (`importTheme`, themeImportExport.ts:184-186) and export flow
    (`writeThemeExportFile`, lines 147-152) both use these unfiltered dialogs,
    so:

      - Import: the native open dialog shows all files. A user can select a
        non-`.tbtheme.json` file; `parseThemeFile` will reject it as invalid
        JSON, but the error is surfaced only after the file is read and
        parsed. A `.tbtheme.json` extension filter would prevent the mistake
        at the dialog layer.
      - Export: the save dialog suggests `theme.tbtheme.json` as the default
        name but does not enforce the extension — the user can type any name
        and save without `.tbtheme.json`, producing a file that the import
        dialog (once filtered) would not show.

    The `appearance.themeFile` path setting (appearance.ts) and its
    `PathControl` (PathControl.tsx) also accept any string path with no
    extension check, and the setting definition has no custom `validation`
    function (unlike `appearance.theme` which has one). A user can paste a
    path to a `.png` or `.md` file and the ThemeProvider will try to read and
    parse it, failing loudly but only after an attempted load on next render.

    Fix: add a `filters: [{ name: "ThinkBrain Theme", extensions:
    ["tbtheme.json"] }]` option to the `open`/`save` calls in `dialogs.ts`
    (or pass filter params through from the theme-specific callers), and add a
    `validation` function to the `themeFile` setting definition that warns
    when the path does not end in `.tbtheme.json`.

    Low urgency because the parse layer fails loudly on wrong files; this is
    a UX/defense-in-depth improvement.
- verification: |
    Read `apps/desktop/src/native/dialogs.ts` lines 30-44 and 56-66 —
    `open({ title, directory: false, multiple: false })` and
    `save({ title, defaultPath: defaultName })` pass no `filters`.
    Read `apps/desktop/src/settings/themeImportExport.ts` lines 147-152,
    184-186 — callers pass no filter args.
    Read `packages/core/src/settings/modules/appearance.ts` lines 50-64 —
    `themeFile` definition has no `validation` function.
    Read `apps/desktop/src/settings/controls/PathControl.tsx` — accepts any
    string via the text input and any file via `pickFilePath()`.
