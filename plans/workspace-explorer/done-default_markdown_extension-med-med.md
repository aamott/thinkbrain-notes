# Default Markdown extension for new notes

## Goal

Make the canonical New note command start with a protected `.md` ending so users can type a note name without knowing about file extensions, while still allowing an intentional non-Markdown file after a clear confirmation.

## Architecture

Keep one Explorer creation pipeline. Extend its discriminated create state so file creation records whether it came from **New note** or generic **New file**. New note supplies initial `.md` text with the caret before the dot; generic file and folder creation remain unchanged. Explorer validation owns a pending extension-confirmation state and calls the existing create/refresh path only after confirmation, so React inputs and dialogs never duplicate native file creation.

## Acceptance criteria

- New note at the workspace root opens the existing inline name field with `.md` present and the caret immediately before it; typing `Shopping` yields `Shopping.md`.
- Generic New file remains empty and accepts any valid filename without an extension warning; New folder and rename behavior remain unchanged.
- `.md` and `.markdown`, case-insensitively, are accepted as Markdown note endings.
- Submitting only `.md` or `.markdown` keeps the input open and asks for a note name instead of creating a hidden file.
- Submitting a New note without a Markdown ending opens a modal titled **Create a different file type?** explaining in plain language that `.md` tells ThinkBrain to open it as a Markdown note.
- **Keep editing** is the initially focused safe action, closes the prompt, preserves the exact draft, and restores focus to the inline field.
- **Create anyway** runs the existing generic file creation path exactly once; non-Markdown files are not falsely opened as notes.
- Escape, Android Back, and scrim dismissal take the safe Keep editing path. Dialog controls meet touch sizing and background content is modal/inert through the shared dismissal pattern.
- Desktop command-palette New note and the mobile New note popup share the behavior because both invoke the canonical `new-note` command.
- Focus/selection, Markdown extension edge cases, confirmation/cancellation, one-shot creation, generic-file regression, desktop shell, and phone New note tests pass with full `pnpm qa`.

## Non-goals

- No extension warning for generic New file.
- No rename-extension warning in this story.
- No automatic conversion of confirmed non-Markdown files into notes.
- No separate mobile creation UI or native command.

## File references

- `apps/desktop/src/workspace/workspaceExplorerTypes.ts`
- `apps/desktop/src/workspace/WorkspaceExplorer.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorerView.tsx`
- `apps/desktop/src/workspace/WorkspaceTree.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorerMenus.tsx`
- `apps/desktop/src/workspace/WorkspaceExplorer.test.tsx`
- `apps/desktop/src/shell/phone/PhoneShell.navigation.test.tsx`
