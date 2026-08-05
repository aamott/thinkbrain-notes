# Missing Pointercancel Listener

**Urgency:** Medium
**Difficulty:** Easy

In `apps/desktop/src/shell/DesktopShell.tsx`, the `beginResize` handler captures pointer events (`event.currentTarget.setPointerCapture`) and listens for `pointermove` and `pointerup`. It's critical to also handle `pointercancel` (or `lostpointercapture`) when resizing to ensure the resize operation finishes cleanly if the OS interrupts the pointer event sequence.

## Action Item
- Verify that `pointercancel` is correctly bound alongside `pointerup` and `pointermove` during the resize drag phase.
- Ensure that the `finish` callback properly unbinds all these event listeners, including `pointercancel` or `lostpointercapture`, to avoid orphaned listeners when the drag ends unexpectedly.
