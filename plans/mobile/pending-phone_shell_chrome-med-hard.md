# Story: Phone Shell Chrome — Header, Drawer, Hub, Sheets

**Status:** ⬜ pending · **Urgency:** medium · **Difficulty:** hard

> Re-cut 2026-08-25 from `pending-mobile_navigation_menu`. That story and
> `pending-responsive_layout` overlapped on the bottom bar and left the tab
> strip and right panels unowned. The seam is now **navigation chrome** (this
> story) versus **surfaces inside panels**
> (`pending-phone_surface_fixes-med-med.md`).

**Design:** `docs/superpowers/specs/2026-08-25-mobile-shell-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-mobile-shell.md` — Tasks 1–12, 14

## The problem

`shell/ActivityBar.tsx` is a rail of icon-only buttons whose names exist only as
`aria-label`. On a desktop that trades fine: the rail is always visible, hover
reveals a tooltip, and the icons become familiar. None of it survives a phone —
no hover, and the width the rail eats is width the note does not get.

The rail is only the visible half. `TitleBar.tsx:170` hides every right-panel
button below 760px, so outline, properties, backlinks and the assistant are
**unreachable on a phone**. The tab strip does not fit either.

## Approach

Two chrome components over one headless state layer, not breakpoints inside one
component. `useShellState` owns tabs, documents, panel selection, palette,
conflicts and workspace lifecycle; `DesktopShell` and `PhoneShell` are layout
only; `ShellRoot` picks between them on `coarse pointer && width < 760`. Panels
are shared untouched.

The bottom hub is a **shortcut bar, not a third panel side**. `side` says where
a panel lives and renders; the hub holds pointers to panels that live left or
right. A `HubItem` is `panel | command | menu`, resolved against the existing
registries, so panel labels, icons, badges and active state have one definition
and extensions become hub-reachable with no extension-API change.

There is no "Home". The first slot is a shortcut whose label comes from its
target's registration — so it reads "Files", or "Journal" if the user pins that.

## Decisions

- Tabs live in the **header** (browser-like), not the hub. The count button
  opens a tab-switcher **grid** of preview cards. The preview is a text excerpt,
  not a screenshot: there is no per-element webview capture, only the active tab
  has a mounted editor, and at thumbnail scale every Markdown note looks the
  same — the opening lines are what identify a note.
- The header's `⋯` opens the **inspector sheet** — a different surface from the
  drawer. Only the header's left slot and the hub's Menu slot open the drawer.
- Drawer is 86% / max 300px over a scrim (**navigation peeks**); a revealed
  panel is full width between header and hub (**content takes over**).
- Default hub: Files, Search, New Note, Assistant, Menu. Menu is last and not
  removable.
- Customization is long-press pin/remove, persisted at `ui.mobileHub`. No
  drag-reorder screen — the editor is the expensive half.
- The `explorer` panel's **label** becomes "Files" on desktop too. Its **id**
  does not change; it is in persisted state and settings keys.
- `CommandContribution` gains `icon?: string` so a command can be pinned.
- Touch sizing uses `pointer-coarse:`, not a width breakpoint — matching
  `useCoarsePointer.ts` and `journalChrome.tsx`.

## Acceptance

- [ ] `useShellState` runs headlessly; `DesktopShell` and `PhoneShell` are
      layout only and each independently testable
- [ ] Phone chrome renders only when the pointer is coarse **and** the viewport
      is narrow; a narrow mouse-driven window keeps desktop chrome
- [ ] No icon rail on phone; the drawer lists every registered left panel with a
      **visible** label, active state and conflict badges
- [ ] Header menu button and hub Menu slot open the same drawer
- [ ] Tab switcher is a two-column **grid of preview cards** (Chrome-on-Android
      style), each with title, close affordance, dirty marker and a text excerpt
      of the note with frontmatter stripped; the active card is marked. Tabs
      with no prose (settings, merge) name their kind instead
- [ ] Inspector sheet reaches every registered right panel — the gap that exists
      today
- [ ] Hub renders resolved shortcuts with visible labels and badges; an
      unregistered pin is skipped, not repaired
- [ ] Long-press pins from the drawer and removes from the hub; Menu survives
- [ ] Desktop presentation unchanged — no desktop test assertion edited
- [ ] Focus management, dismissal and screen-reader behaviour tested for drawer
      and both sheets
- [ ] `pnpm qa` and `pnpm test:e2e` pass

## References

- `plans/mobile/assets/phone-shell-mockup.html` — look-and-feel reference
  (proportion and hierarchy only; the spec's prose is what binds)
- `apps/desktop/src/panels/panelRegistryModel.tsx` — the registry both chromes read
- `apps/desktop/src/journal/useCoarsePointer.ts` — why width alone cannot decide

## Not this story

Popout width, keyboard inset, status-bar folding and the bottom panel —
`pending-phone_surface_fixes-med-med.md`.
