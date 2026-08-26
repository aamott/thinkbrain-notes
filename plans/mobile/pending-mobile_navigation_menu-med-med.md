# Story: A Navigation Menu on Mobile, Not an Icon Rail

**Status:** ⬜ pending · **Urgency:** medium · **Difficulty:** medium

> Observed on a device, 2026-08-23: the UI is broadly unoptimised for a phone,
> and the activity bar is the clearest example.

## The problem

`shell/ActivityBar.tsx` is a 53-line vertical rail of icon-only buttons. Their
names exist only as `aria-label`, so a screen reader hears them and a person
looking at the screen does not. On a desktop that is a reasonable trade: the
rail is always visible, hover reveals a tooltip, and the icons become familiar
because the user sees them constantly.

None of that survives a phone. There is no hover, screen width the rail eats is
width the note does not get, and a first-time user on a small screen has no way
to learn what an unlabelled glyph opens.

## Approved direction (2026-08-25)

`assets/mobile-ui-mockup.html` is the visual source of truth:

- The phone shell has a universal top header with a Menu/Back left slot, title
  center slot, and tabs count plus action menu on the right.
- A bottom navigation hub exposes Home, Search, New Note, Tabs and Menu.
- Menu opens an 86%-width navigation drawer (maximum 300px) with visible icon
  labels, workspace switcher, conflict badges and App Settings.
- Header and bottom Menu affordances open the same drawer; there is one source
  of truth for entries, active state and badges.
- Desktop keeps its current icon rail unchanged.

Reuse the existing panel/overlay state and shared navigation registration rather
than creating a second menu model, but match the approved drawer presentation;
`Popout.tsx` becoming full-screen below `760px` is useful infrastructure, not a
reason to replace the approved 86%-width drawer with a different surface.
`useCoarsePointer.ts` remains relevant because a narrow desktop window is not
automatically a phone.

## Acceptance

- [ ] On phones the icon rail is replaced by the approved universal header,
      bottom navigation hub and labeled 86%-width navigation drawer
- [ ] Header and bottom Menu controls open the same drawer; Home, Search, New
      Note, Tabs and Menu remain globally reachable
- [ ] Touch targets meet the 44px minimum the epic already asks for
- [ ] Active navigation and conflict badges remain visible when the drawer is
      closed, and App Settings remains available inside it
- [ ] The desktop presentation is unchanged, and mobile/desktop share one source
      of truth for navigation entries, active state and badges
- [ ] Focus management, dismissal and screen-reader behavior are tested for the
      drawer and bottom navigation

## Related, not this story

The rest of the "unoptimised for mobile" surface — panel widths, the tab strip,
the editor chrome — belongs to `pending-responsive_layout-med-med.md`. This
story is only the navigation control, because it is the one a phone user meets
first and the one that cannot be fixed by a breakpoint alone.

## References

- `plans/pending-mobile-med-hard.md` — epic context
- `plans/mobile/assets/mobile-ui-mockup.html` — approved visual source of truth
- `apps/desktop/src/panels/Popout.tsx` — existing responsive overlay/state infrastructure to evaluate for reuse
- `apps/desktop/src/lib/useCoarsePointer.ts` — distinguishes a phone from a narrow desktop panel where width alone cannot
