- name: DirtyCloseDialog has no focus trap, Escape-to-cancel, or focus restore
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DirtyCloseDialog.tsx
- lines: 21-56
- description: The dialog renders a `role="dialog" aria-modal="true"` section (lines 23-27) but implements none of the behaviors required for an accessible modal:
  1. No focus management on open: when `tab` becomes non-null, focus is not moved into the dialog. The user's focus remains wherever it was (typically the tab close button), so screen-reader and keyboard users are not informed that a modal has appeared.
  2. No focus trap: Tab/Shift+Tab can leave the dialog and reach background content (the settings tab, the editor, the activity bar), violating `aria-modal="true"` which promises that background content is inert.
  3. No Escape handler: pressing Escape does nothing. The CommandPalette in the same shell dismisses on Escape; this dialog should do the same (call `onCancel`).
  4. No focus restore on close: when Cancel/Discard/Save is clicked, focus is not returned to the element that opened the dialog (the tab close X). Compare with `DesktopShell.closePalette` (line 252-255) which restores focus via `paletteRestoreFocusRef`.
  5. The overlay `<div className="fixed inset-0 ...">` (line 22) has `role="presentation"` but no `onClick`/`onKeyDown` handler, so clicking outside or pressing Escape does not dismiss — acceptable as a design choice, but it should at least be deliberate and keyboard-accessible.
  The buttons themselves are reachable via Tab only because they are native `<button>`s; without a trap, the order is unbounded.
- verification: Read DirtyCloseDialog.tsx in full. Confirmed there are no `useEffect`/`useRef`/`onKeyDown`/`onClick` handlers in the component and no focus-management primitives. Compared with DesktopShell.tsx closePalette (lines 252-255) which does restore focus for the palette, establishing the project's own pattern.
