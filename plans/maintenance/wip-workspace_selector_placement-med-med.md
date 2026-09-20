# Workspace selector as shared chrome

## Goal

Move workspace switching out of the bottom of Files and present the same selector in intentional mobile and desktop chrome locations without duplicating its workspace-access logic.

## Acceptance criteria

- Mobile shows a styled workspace selector below the navigation drawer title and above its panel actions.
- Desktop offers a live Interface setting for title-bar or eligible left-panel placement.
- Files, Search, and Journal opt into panel-header placement; unrelated and extension-management panels remain unchanged unless they explicitly opt in.
- Only one selector/controller instance is mounted per shell, preserving managed-workspace, Git import, keyboard, focus, and capability behavior.
- The selector no longer renders at the bottom of Files.
- Collapsing or switching the desktop left panel does not break title-bar workspace switching or discard Explorer state.
- Focused component tests and `pnpm qa` pass.

## File references

- `apps/desktop/src/workspace/WorkspaceExplorerView.tsx`
- `apps/desktop/src/shell/phone/PhoneDrawer.tsx`
- `apps/desktop/src/shell/TitleBar.tsx`
- `apps/desktop/src/panels/Popout.tsx`
- `packages/core/src/settings/modules/ui.ts`
