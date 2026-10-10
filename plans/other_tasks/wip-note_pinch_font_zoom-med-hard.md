# Story: Note-scoped pinch font zoom

Implemented: pinch over an editable note reflows its font size while shell chrome stays fixed; browser gestures elsewhere are untouched. Verified in a desktop-browser phone profile via trusted CDP touch events; real Android WebView / iOS WKWebView checks are still open.

Depends on: editor_display_settings_wiring.

## Approach

- Keep interface size an explicit preference, not the note pinch target.
- Preview font-size changes locally during the gesture; commit `editor.fontSize` once at gesture end, rather than autosaving every move. Cancellation restores the previous size. App-scoped persistence matches the existing setting; reconsider per-note overrides only with a separate product decision.
- Anchor the document position at the two-finger midpoint and preserve its visual offset through reflow. Never change note contents, selection, or undo history.
- Limit handling to two fingers beginning inside the note body; preserve one-finger scrolling, text selection, and keyboard behavior. Prototype gesture arbitration on Android WebView and iOS WKWebView before settling the event implementation.
- Keep browser/system accessibility magnification available outside the owned gesture; do not add global `user-scalable=no` or disable pinch across the app.
- Image/PDF/canvas viewers need geometric zoom, not font reflow, and remain separate implementations.

## Acceptance

- [x] Pinching notes adjusts readable text size within supported bounds without resizing app chrome.
- [x] Reading anchor stays under the gesture midpoint, including live-preview wrapping and code blocks.
- [x] One committed preference update per completed gesture; cancellation/unmount cleans up preview and listeners.
- [ ] Single-finger scrolling, selection, soft keyboard, Back, and accessibility controls remain usable. (single-finger scroll verified in browser; keyboard/Back/device checks open)
- [ ] Verify on real Android and iOS; decide separately whether desktop trackpad pinch uses the same note behavior.

Rejected defaults: whole-page zoom moves chrome; pinch-driven interface scaling reflows every surface; CSS-transform text zoom requires panning and complicates caret/hit-testing instead of wrapping text.


## Implementation notes

- Preview is a `transform` on `.cm-editor` (`view.dom`) — NOT `.cm-content`: any
  style mutation inside CodeMirror's observed subtree schedules a measure
  whose distorted rects produce a bogus scroll-anchor correction plus a line
  rebuild that detaches the touches' fixed targets. Verified in-browser.
- Commit reflows via the display compartment and re-lands the anchored char
  under the final midpoint: first measure cycle jumps by the scaled
  pre-reflow doc-top estimate, later cycles correct with `coordsAtPos`.
- Two-finger gestures lock `scrollDOM` overflow (saved/restored); one-finger
  pan untouched. Verified: browser E2E (10 tests incl. mid-doc vertical/
  horizontal, 3-finger drain, cancel/unmount/no-op, unwrapped code overflow,
  native outside-page zoom) + unit controller tests.
- NOT verified: real Android WebView / iOS WKWebView touch arbitration,
  soft keyboard, and Back-during-gesture behavior. Browser E2E (trusted
  CDP `Input.dispatchTouchEvent`) proves the event handling and commit
  semantics in a phone-profile Chromium only; native validation open.
