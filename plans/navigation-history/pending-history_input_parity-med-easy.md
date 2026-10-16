# History Input Parity

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** easy

Back/Forward are click-only today. Every comparable surface (browsers,
Obsidian, VS Code, file managers) exposes them on more inputs. Bring the app
to parity.

## In scope

- Keyboard shortcut in `useShellShortcuts` — pick a platform-idiomatic chord
  (Alt+←/→ matches browsers/file managers; Ctrl+Alt+←/→ matches Obsidian;
  decide and document).
- Mouse back/forward thumb buttons (X1/X2, `auxclick`/pointer button 3–4) on
  desktop.
- Command-palette entries so the actions are discoverable and remappable
  later if a shortcut system lands.

## Optional polish

- Tooltip names the destination ("Back to X"), like browsers.
- Right-click/long-press history dropdown for multi-step jumps.
- Phone `PhoneHeader` hides Forward when disabled (`{canGoForward && …}`),
  causing layout shift — match desktop's always-rendered pattern.

## Acceptance criteria

- Chosen shortcut and mouse buttons navigate history wherever the buttons do.
- Back/Forward appear in the command palette and respect `canGoBack`/
  `canGoForward`.

Files: `apps/desktop/src/shell/useShellShortcuts.ts`,
`apps/desktop/src/shell/TitleBar.tsx`,
`apps/desktop/src/shell/phone/PhoneHeader.tsx`,
`apps/desktop/src/commands/commandRegistry.ts`
