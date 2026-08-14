- name: TitleBar "+" new tab button has no onClick handler
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/TitleBar.tsx
- lines: 160
- description: The "+" button in the tab strip has an `aria-label="Open a new tab"` but no `onClick` handler. Clicking it does nothing. There is no `onNewTab` prop on `TitleBarProps` and no new-tab callback wired in `DesktopShell.tsx`. The button is a dead UI element that misleads users into thinking they can open a new tab.

  Either wire it to an action (e.g., open the command palette, or create a blank editor tab) or remove it until the functionality exists. A button with `cursor-pointer` that does nothing on click is a UX bug.

- verification: Read TitleBar.tsx line 160 — confirmed no `onClick` attribute. Grepped for `new tab|newTab|New Tab` across `apps/desktop/src` — found no handler or callback wiring anywhere.
