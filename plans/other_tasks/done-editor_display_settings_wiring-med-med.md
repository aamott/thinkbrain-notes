# Story: Wire editor display preferences

`editor.fontSize` and `editor.lineWrapping` now drive MarkdownEditor/CodeMirror and CodeEditor reactively: `editorDisplaySettings.ts` resolves the stored value (numeric only; non-numbers fall back to **16**, numbers round and clamp to 10–32px), and a `Compartment` owned by `useCodeMirrorView`/`editorDisplayController` reconfigures the mounted view with a `scrollSnapshot` in the same transaction — no editor rebuild, selection/undo/staged precedence preserved.

Policy: stored font size is absolute CSS px (default **16**), independent of `ui.scale`. No schema migration and no rewriting of stored prefs; the deliberate visual change from the old implicit rem-based 14/15.4px to 16px is accepted. `editor.lineWrapping` defaults to `true` unless explicitly `false`.

## Acceptance

- [x] Markdown and code editors react to effective font-size and line-wrapping settings without rebuilding editor state.
- [x] Font size is independent of interface scale; validate the existing 10-32px setting bounds and choose a migration/default policy explicitly before changing the current visual size.
- [x] Preserve logical reading position, selection, undo, and staged preference precedence during reconfiguration.
- [x] Test desktop/mobile, long notes, live preview, horizontal code scrolling, and tab remounts.

Relevant files: `apps/desktop/src/tabs/MarkdownEditor.tsx`, `CodeEditor.tsx`, `markdownEditorHooks.ts`, `useCodeMirrorView.ts`, `editorDisplayController.ts`, `editorDisplaySettings.ts`, and `packages/core/src/settings/modules/editor.ts`.
