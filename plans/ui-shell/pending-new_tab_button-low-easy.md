# New-Tab Button (Mobile + Desktop)

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** easy

Both form factors need an always-visible way to open a new tab.

- **Mobile:** a trailing "+" in the tab switcher, shaped like the tab slot
  it would create (mobile-browser convention). `TabSwitcherSheet` already
  receives `onNewTab`; this is the persistent affordance rather than a menu
  row.
- **Desktop:** a "+" at the end of the tab bar (browser convention). Check
  whether one already exists in the desktop tab strip; if the only entry
  points today are commands/menus, add the strip button.
- Both should run through `openNewTabDocument` / the same tab dispatch —
  never a bespoke path.

Pairs naturally with `soft_open_tabs`: preview reuse makes a deliberate
new-tab action meaningful.
