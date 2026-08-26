# Story: CodeMirror Mobile Testing

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

## Goal

Verify and fix CodeMirror 6 text editing on Android. The app runs on an
emulator with a managed vault open — this is the next thing a user hits.

## Issues to verify, in priority order

1. **`windowSoftInputMode`** — our `AndroidManifest.xml` has no
   `android:windowSoftInputMode`, defaulting to `adjustPan`. Add
   `adjustResize` to the activity; this is the confirmed workaround for
   tauri#10631 / #7868 and should be tried before any CodeMirror changes.

2. **EditContext scrolling** — CM 6.43.1 has the `d652cd8` fix for
   scroll-to-top on focus, but remaining EditContext scroll bugs exist on
   long-hold paste and empty-line taps (codemirror/dev#1676). If they
   reproduce, `EditorView.EDIT_CONTEXT = false` is a last resort — it
   breaks other Android input patterns.

3. **Samsung keyboard predictive text** (codemirror/dev#1504) — accepting
   autocomplete suggestions corrupts editor state. No clean upstream fix;
   document as a known limitation if it reproduces.

4. **Gboard IME** — composition-end workaround (`5559e00`) is in our
   version. Verify backspace-during-composition and enter work.

5. **iOS** — deferred per epic. Split into a separate story when scheduled.

## Acceptance Criteria

- [ ] `android:windowSoftInputMode="adjustResize"` in AndroidManifest;
      keyboard opens, editor resizes, cursor stays visible.
- [ ] Typing, backspace, and enter work on Android emulator.
- [ ] Cursor positioning is correct with the soft keyboard open.
- [ ] Scrolling is stable — no unexpected jumps on focus or paste.
- [ ] Gboard composition works (backspace, enter, accept suggestion).
- [ ] If `EDIT_CONTEXT = false` is needed, the trade-off is documented.
- [ ] Samsung keyboard predictive text tested; if broken, documented as
      a known limitation.
- [ ] Desktop editing is unchanged.
- [ ] `pnpm qa` passes.

## References

- `plans/pending-mobile-med-hard.md` — epic, known limitations
- tauri-apps/tauri#10631, #7868 — Android keyboard / visualViewport
- codemirror/dev#1676 — EditContext scroll bugs
- codemirror/dev#1504 — Samsung keyboard predictive text
