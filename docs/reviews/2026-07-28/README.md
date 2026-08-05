# Code Review Summary: 2026-07-28

This code review analyzed all source files in the `apps` and `packages` directories, focusing heavily on user-facing issues (UI/UX, accessibility, bugs) and major developer issues (memory leaks, race conditions, architecture breaks).

**Total Findings:** 13

## High Urgency

| Finding | File | Difficulty |
| :--- | :--- | :--- |
| [Missing Absolute Positions for Tasks and Wiki Links](./relative-offsets-in-markdown-indexes,easy,high.md) | `packages/core/src/markdown.ts` | easy |
| [Native Commands Args Type Safety](./native-commands-args-type-safety,medium,high.md) | `apps/desktop/src/native/commands.ts` | medium |

## Medium Urgency

| Finding | File | Difficulty |
| :--- | :--- | :--- |
| [Command Palette CSS Modules Legacy](./command-palette-css-modules-legacy,easy,medium.md) | `apps/desktop/src/commands/CommandPalette.tsx` | easy |
| [Command Palette Duplicate Keyboard Logic](./command-palette-duplicate-keyboard-logic,medium,medium.md) | `apps/desktop/src/commands/CommandPalette.tsx` | medium |
| [Missing pointercancel listener in DesktopShell resize handler](./missing-pointercancel,easy,medium.md) | `apps/desktop/src/shell/DesktopShell.tsx` | easy |
| [WorkspaceTree Keyboard Navigation](./workspace-tree-keyboard-navigation,hard,medium.md) | `apps/desktop/src/workspace/WorkspaceExplorer.tsx` | hard |
| [Race condition in fallback saveDesktopState logic](./desktop-state-race-condition,easy,medium.md) | `apps/desktop/src/settings/desktopState.ts` | easy |
| [Button component uses legacy BEM classes instead of Tailwind](./button-tailwind-violation,easy,medium.md) | `packages/ui/src/components/Button.tsx` | easy |
| [Shared RegExp State in collectMatches](./shared-regexp-state,easy,medium.md) | `packages/core/src/markdown.ts` | easy |
| [Unwanted Frontmatter Injection on Serialization](./unwanted-frontmatter-injection,easy,medium.md) | `packages/core/src/frontmatter.ts` | easy |

## Low Urgency

| Finding | File | Difficulty |
| :--- | :--- | :--- |
| [SourceControlPanel relies on legacy CSS Modules](./source-control-panel-css-modules,medium,low.md) | `apps/desktop/src/git/SourceControlPanel.tsx` | medium |
| [Unbounded cache growth in GitService](./gitservice-cache-memory-leak,easy,low.md) | `apps/desktop/src/git/gitService.ts` | easy |
| [Regex Parsing Matches Inside Code Blocks](./regex-markdown-parsing-tasks,medium,low.md) | `packages/core/src/markdown.ts` | medium |
