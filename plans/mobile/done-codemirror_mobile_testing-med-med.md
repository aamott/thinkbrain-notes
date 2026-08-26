# Story: CodeMirror Mobile Testing

**Status:** ✅ done · **Urgency:** med · **Difficulty:** med

## Goal

Verify and fix CodeMirror 6 text editing on Android.

## What shipped

- `android:windowSoftInputMode="adjustResize"` added to AndroidManifest.
- Tap-below-last-line fix: `pointerdown` handler on the editor host places
  the cursor at end-of-document and keeps focus on touch.
- CodeMirror editing verified working on Android emulator with a managed
  vault open.

## Acceptance Criteria

- [x] `android:windowSoftInputMode="adjustResize"` in AndroidManifest;
      keyboard opens, editor resizes, cursor stays visible.
- [x] Typing, backspace, and enter work on Android emulator.
- [x] Cursor positioning is correct with the soft keyboard open.
- [x] Scrolling is stable — no unexpected jumps on focus or paste.
- [x] Gboard composition works (backspace, enter, accept suggestion).
- [ ] If `EDIT_CONTEXT = false` is needed, the trade-off is documented —
      not needed.
- [ ] Samsung keyboard predictive text tested; if broken, documented as
      a known limitation — not yet tested, tracked as known limitation.
- [x] Desktop editing is unchanged.
- [x] `pnpm qa` passes.

## References

- `plans/pending-mobile-med-hard.md` — epic, known limitations
- tauri-apps/tauri#10631, #7868 — Android keyboard / visualViewport
- codemirror/dev#1676 — EditContext scroll bugs
- codemirror/dev#1504 — Samsung keyboard predictive text
