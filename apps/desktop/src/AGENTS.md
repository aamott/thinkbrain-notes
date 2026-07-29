# Desktop React UI (`apps/desktop/src/`)

Frontend application logic built with React, Vite, and Zustand.

## Module Map
- `agent/`: Assistant chat UI (`AssistantPanel.tsx`). Connects to ACP host / Tauri events.
- `commands/`: Command palette modal & registry (`CommandPalette.tsx`, `commandRegistry.ts`, `commandPaletteModel.ts`).
- `git/`: Git UI panels and status (`SourceControlPanel.tsx`, `gitService.ts`, `sourceControlRequestGate.ts`).
- `native/`: Bridges to Tauri Rust commands (`commands.ts`). **Isolate all Rust calls here.**
- `settings/`: Desktop settings state & theme (`desktopState.ts`, `ThemeProvider.tsx`).
- `shell/`: Layout frame, panels, and sidebars (`DesktopShell.tsx`).
- `tabs/`: Canvas editor tabs & state (`MarkdownEditor.tsx`, `tabRegistry.ts`, `tabModel.ts`).
- `workspace/`: File explorer & tree components (`WorkspaceExplorer.tsx`, `workspaceAdapter.ts`, `workspaceDocumentModel.ts`).
- `lib/`: App-wide utilities (`utils.ts`).

## Rules & Patterns
- **No direct Tauri invocation in UI components**: Route native IPC through `native/`.
- **State Management**: Use Zustand stores where state spans multiple components.
- **Styling**: Tailwind v4 via tokens defined in `@thinkbrain/ui`.
