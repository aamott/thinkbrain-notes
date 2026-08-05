# Desktop React UI (`apps/desktop/src/`)

Frontend user interface application built with React, Vite, and Zustand.

## Module Map
- **`agent/`**: AI assistant UI panel (`AssistantPanel.tsx`). Consumes Tauri events directly.
- **`commands/`**: Command palette UI modal & registry (`CommandPalette.tsx`, `commandRegistry.ts`, `commandPaletteModel.ts`).
- **`git/`**: Git UI panels and status (`SourceControlPanel.tsx`, `gitService.ts`, `sourceControlRequestGate.ts`).
- **`native/`**: Tauri bridge adapters (`commands.ts`). **Isolate all Rust calls here.**
- **`settings/`**: Desktop settings state & theme (`desktopState.ts`, `ThemeProvider.tsx`).
- **`shell/`**: Layout frame, sidebars, popouts, and panels (`DesktopShell.tsx`).
- **`tabs/`**: Editor tabs, workspace tabs, & tab state (`MarkdownEditor.tsx`, `tabRegistry.ts`, `tabModel.ts`).
- **`workspace/`**: File explorer & workspace tree components (`WorkspaceExplorer.tsx`, `workspaceAdapter.ts`, `workspaceDocumentModel.ts`).
- **`lib/`**: App-wide utility functions (`utils.ts`).

## Rules & Patterns
- **Native IPC Bridge**: UI components must never invoke Tauri IPC directly. Route all native operations through `native/`.
- **State Management**: Use Zustand stores for state shared across components.
- **Styling**: Tailwind v4 via `--tn-*` CSS tokens defined in `@thinkbrain/ui`.
- **Settings UI**: Open settings as an editor tab rather than modal dialogs.
