# UI Shell Epic — Completed Work

## Generic file viewer tabs — `generic_file_viewers`

Non-Markdown tab kinds registered in the tab registry: `code-editor`
(CodeMirror 6, editable) for text/code, and read-only `image-`, `audio-`, and
`video-viewer` kinds. Media renders through the Tauri asset protocol
(`convertFileSrc`) — chosen over base64 blobs (heap cost) and custom IPC
streaming (complexity); native streaming handles large files and Range
requests for seeking.

## Modular settings system — `modular_settings_system` + six sub-stories

Declarative settings: one schema definition populates UI, persistence, and
validation. Registry is scope-aware (`app` | `workspace`, top-level nav
groups). Built-in modules: Appearance, Editor, Sync; extensions contribute
modules through the same registry. `desktopState.ts` (panel widths, recents)
deliberately stays separate from app settings.

Sub-stories that landed: core types + registry; store + persistence;
responsive nav overlay + `SettingsHeaderBar` (the sticky `SettingsSaveBar` was
removed); header save/dirty state + `DirtyCloseDialog` integration; fuzzy
search + virtualized results (150ms debounce); import/export + per-section
reset.

Known follow-ups recorded in the story before deletion: full arrow-key nav and
per-module export were noted as polish/follow-up, not shipped.
