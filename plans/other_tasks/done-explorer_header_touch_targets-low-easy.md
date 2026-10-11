# Explorer Header Touch Targets

**Status:** ✔ done · **Urgency:** low · **Difficulty:** easy

Explorer header buttons — new note, new folder, sort, ⋯ — were too small
to hit reliably on mobile.

## Cause

`HEADER_ACTION_CLASSES` used `pointer-coarse:size-9` (36px), below the 44px
platform touch-target minimum.

## Fix

`pointer-coarse:size-11` (44px). Covers every consumer of the shared class:
explorer header create buttons, sort menu trigger, and ⋯ trigger. The
header row already reserves `pointer-coarse:min-h-12`, so no layout change
was needed. Regression: `phone-shell.spec.ts` "explorer header actions
meet the 44px touch target".
