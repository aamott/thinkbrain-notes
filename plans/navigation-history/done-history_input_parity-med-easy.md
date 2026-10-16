# History Input Parity

**Status:** ✅ done · **Urgency:** med · **Difficulty:** easy

Back/Forward were click-only. Now at parity: Alt+←/→ and Ctrl/Cmd+[/] on
the keyboard, mouse X1/X2 thumb buttons, and command-palette entries gated
on `canGoBack`/`canGoForward`. Destination tooltips ("Back to X") and the
always-rendered phone Forward were picked up as optional polish; the
history-dropdown remains open.

## In scope

- Keyboard shortcut in `useShellShortcuts` — decided: **Alt+←/→** (the
  browser/file-manager chord) plus **Ctrl/Cmd+[/]** (the macOS browser
  chord, kept everywhere since nothing else binds it). Alt+←/→ defers to
  text inputs where it means word-jump; Ctrl+Alt+←/→ (Obsidian) was skipped
  because desktop environments commonly claim it for workspace switching.
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
