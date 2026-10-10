# Story: Wire editor display preferences

`editor.fontSize` and `editor.lineWrapping` are registered settings, but MarkdownEditor/CodeEditor currently use rem-based text size and unconditional CodeMirror line wrapping. Verified during scroll/pinch investigation; not changed by the scroll fix.

## Acceptance

- [ ] Markdown and code editors react to effective font-size and line-wrapping settings without rebuilding editor state.
- [ ] Font size is independent of interface scale; validate the existing 10-32px setting bounds and choose a migration/default policy explicitly before changing the current visual size.
- [ ] Preserve logical reading position, selection, undo, and staged preference precedence during reconfiguration.
- [ ] Test desktop/mobile, long notes, live preview, horizontal code scrolling, and tab remounts.

Relevant files: `apps/desktop/src/tabs/MarkdownEditor.tsx`, `CodeEditor.tsx`, `markdownEditorHooks.ts`, `useCodeMirrorView.ts`, and `packages/core/src/settings/modules/editor.ts`.
