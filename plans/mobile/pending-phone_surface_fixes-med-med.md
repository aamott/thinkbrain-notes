# Story: Phone Surface Fixes

**Status:** ⬜ pending · **Urgency:** medium · **Difficulty:** medium

> Re-cut 2026-08-25 from `pending-responsive_layout`. The old story's acceptance
> criteria duplicated the bottom bar (owned by
> `pending-phone_shell_chrome-med-hard.md`) and named no surface it actually
> owned. This story is the surfaces *inside* the chrome.

**Design:** `docs/superpowers/specs/2026-08-25-mobile-shell-design.md`
**Plan:** `docs/superpowers/plans/2026-08-25-mobile-shell.md` — Task 13, Task 15

## The problem

Four concrete defects the phone chrome exposes, none of which a breakpoint alone
fixes.

1. **`panels/Popout.tsx:16`** insets the phone popout by
   `var(--tn-size-activitybar-width)`. With no rail that is a 3rem strip of
   nothing, and it contradicts "content takes over".
2. **Three bottom chromes compete for the same edge.** The shell root grid
   (`grid-rows-[2.25rem_auto_minmax(0,1fr)_1.5rem]`) ends in `StatusBar`,
   `BottomPanel` is `flex-[0_0_12rem]` inside the editor column, and the hub
   wants 60px plus safe-area inset.
3. **The hub is bottom-anchored**, so it floats over the soft keyboard unless it
   tracks `window.visualViewport` — the handling `MetadataBottomSheet.tsx`
   already does for the same reason.
4. **Touch sizing is expressed as a width breakpoint** in the old stories,
   where the codebase already chose `pointer-coarse:`.

## Approach

- Remove the activity-bar inset from `Popout`'s phone variant.
- The hub owns the bottom edge. `StatusBar` does not render on phone; its sync
  summary moves to the header by reusing `SyncPill` (there is no `label` field
  on `SyncStatus` — do not derive a second one), and its conflict counts are
  already visible as drawer and hub badges. `BottomPanel` becomes a sheet.
- `useKeyboardInset` reads `visualViewport`; the hub hides while the keyboard is
  open rather than sitting between the keyboard and the text being typed.
- Sweep touch minimums onto `pointer-coarse:`.

## Acceptance

- [ ] A revealed panel touches both screen edges on a phone
- [ ] `StatusBar` does not render on phone; sync state is legible in the header
      via the existing `SyncPill`
- [ ] `BottomPanel` renders as a sheet, not a dock
- [ ] The hub is not visible while the soft keyboard is open, and returns when
      it closes — verified on a device, not only an emulator
- [ ] Touch minimums use `pointer-coarse:`; no touch size is expressed as a
      width breakpoint
- [ ] Desktop layout unchanged at wide viewports
- [ ] Playwright covers the phone shell with `hasTouch: true` **and** a narrow
      viewport — viewport alone leaves desktop chrome mounted and tests nothing
- [ ] `pnpm qa` passes

## Not this story

Header, drawer, hub, sheets and the hub model —
`pending-phone_shell_chrome-med-hard.md`.
