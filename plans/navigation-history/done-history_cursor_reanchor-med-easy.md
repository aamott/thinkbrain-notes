# History Cursor Re-Anchor Bug

**Status:** ✅ done · **Urgency:** med · **Difficulty:** easy

`removeTab` re-anchors the history cursor with
`entries.lastIndexOf(activeTabId)` — the *last* occurrence of the surviving
active tab — instead of the entry the user is actually on. When the active
tab appears more than once in history and the user is mid-history, closing an
unrelated tab jumps the cursor to the latest occurrence: the forward tail
silently becomes the back stack, and Back walks entries that were in the
user's future.

Repro: visits `[A, B, A]`, user Backs to the first `A` (cursor 0), closes
unrelated tab `C` → cursor jumps to 2; Back now lands on `B`.

## Fix

Track the cursor's entry through the filter (index arithmetic on removed
entries, or anchor by entry identity) rather than re-deriving it with
`lastIndexOf`.

## Acceptance criteria

- Closing any tab while sitting mid-history preserves the current position:
  Forward still reaches the same next visits, Back the same previous ones.
- Regression test in `tabModel.test.ts` covering the `[A, B, A]` scenario.

File: `apps/desktop/src/tabs/tabModel.ts` (`removeTab`, ~line 504)
