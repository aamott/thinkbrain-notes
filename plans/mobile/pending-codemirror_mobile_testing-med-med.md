# Story: CodeMirror Mobile Testing

## Goal

Test and fix CodeMirror 6 on the mobile webview. Known issues:

- Android scrolling bug (fixed in recent CM versions — verify).
- IME / keyboard text issues on Android (Gboard).
- Touch-based text selection on iOS.

Set `EditorView.EDIT_CONTEXT = false` if needed for Android.

## Acceptance Criteria

- [ ] Text editing works on Android emulator and iOS simulator.
- [ ] Cursor positioning is correct (including with the soft keyboard open).
- [ ] IME works with Gboard on Android.
- [ ] Scrolling is stable — no unexpected scroll jumps.
- [ ] Touch-based text selection works on iOS.

## References

- `plans/pending-mobile-low-hard.md` — known limitations
- tauri-apps/tauri#10631 — Android keyboard / visualViewport issue
