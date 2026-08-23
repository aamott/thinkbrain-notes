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

## What it should be

A **popout menu with visible labels**, opened from a single control, replacing
the rail below the phone breakpoint. Icons stay — beside the words, not instead
of them.

The surface already exists and should be reused rather than rebuilt:
`panels/Popout.tsx` already becomes a full-screen overlay under `760px`, and
`LeftPopout`/`RightPopout` are mounted in the shell. `useCoarsePointer.ts` is
also there for the case width alone cannot decide — a narrow desktop window is
not a phone, and the two want different answers.

## Open questions for whoever plans this

- **What opens it.** A hamburger in the title bar, a bottom-edge control, or a
  swipe from the edge. The epic's scope mentions bottom tabs and swipe
  gestures; a menu and a bottom tab bar are different answers to the same
  question and only one should be built first.
- **Whether the same menu carries the settings entry**, which today is a
  separate icon pinned to the bottom of the rail.
- **What happens to the badge.** The conflicts count currently rides on the
  rail icon (`conflictBadges` in `useSyncSurfaces`). Inside a closed menu
  nobody would see it, so the opening control has to carry it instead.
- **Whether the desktop rail stays.** Nothing here argues for changing desktop;
  the cheapest correct outcome is one component with two presentations, not two
  components.

## Acceptance (to be settled)

- [ ] Below the phone breakpoint the icon rail is replaced by a menu whose
      entries show their names
- [ ] Touch targets meet the 44px minimum the epic already asks for
- [ ] Anything the rail communicated — the active panel, the conflicts badge —
      is still visible with the menu closed
- [ ] The desktop presentation is unchanged, and the two share one source of
      truth for what the entries are
- [ ] Screen-reader behaviour is no worse than the rail's, which is currently
      the only place these names exist

## Related, not this story

The rest of the "unoptimised for mobile" surface — panel widths, the tab strip,
the editor chrome — belongs to `pending-responsive_layout-med-med.md`. This
story is only the navigation control, because it is the one a phone user meets
first and the one that cannot be fixed by a breakpoint alone.
