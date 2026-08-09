- name: pickFilePath dialog filter name hardcoded to "Theme files" regardless of extensions
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/native/dialogs.ts
- lines: 28-49
- description: |
    `pickFilePath` accepts a generic `extensions` parameter and builds a Tauri dialog
    filter (lines 42-44), but the filter `name` is hardcoded to `"Theme files"`:
    `filters: extensions ? [{ name: "Theme files", extensions: [...extensions] }]
    : undefined`. Any caller that passes non-theme extensions (e.g. image
    extensions) gets a dialog whose filter dropdown reads "Theme files", which is
    misleading to the user. The `extensions` parameter and `title` parameter are
    both generic, so the filter name should derive from the title or accept an
    explicit filter-name argument.
- verification: |
    Read dialogs.ts pickFilePath (lines 28-49) and confirmed the filter name is the
    string literal "Theme files" while `title` and `extensions` are both
    caller-supplied and generic.
