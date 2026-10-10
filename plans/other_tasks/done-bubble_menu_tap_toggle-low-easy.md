# Bubble Menu Tap-Toggle

**Status:** ✔ done · **Urgency:** low · **Difficulty:** easy

Tapping the ⋮ action-items bubble while its menu was open did not close it.
Same for the New-note + bubble — identical mechanics.

## Cause

`BubbleMenuShell`'s `z-40 inset-0` dismiss layer covered the `z-20` bubble
group. A tap on the trigger bubble hit the layer on `pointerdown`, which
dismissed the menu; the layer hid, and the trailing `click` retargeted to
the bubble underneath — whose `onSelect` then reopened the menu. Net: the
menu stayed open.

## Fix

`FloatingBubbles` rises to `z-50` while an actions/new-note menu is open
(`PhoneShell` className override). The trigger bubble takes the tap
directly and its existing toggle `onSelect` closes the menu; the menu
itself is also `z-50` but later in DOM order, so it still paints on top.
Regression: `phone-shell.spec.ts` "tapping a trigger bubble again closes
its menu".
