# Story: Note-scoped pinch font zoom

Recommendation from the scroll/zoom investigation: pinch over an editable note reflows its text size while shell chrome stays fixed. This is future work, not implemented or a globally disabled browser gesture.

Depends on: editor_display_settings_wiring.

## Approach

- Keep interface size an explicit preference, not the note pinch target.
- Preview font-size changes locally during the gesture; commit `editor.fontSize` once at gesture end, rather than autosaving every move. Cancellation restores the previous size. App-scoped persistence matches the existing setting; reconsider per-note overrides only with a separate product decision.
- Anchor the document position at the two-finger midpoint and preserve its visual offset through reflow. Never change note contents, selection, or undo history.
- Limit handling to two fingers beginning inside the note body; preserve one-finger scrolling, text selection, and keyboard behavior. Prototype gesture arbitration on Android WebView and iOS WKWebView before settling the event implementation.
- Keep browser/system accessibility magnification available outside the owned gesture; do not add global `user-scalable=no` or disable pinch across the app.
- Image/PDF/canvas viewers need geometric zoom, not font reflow, and remain separate implementations.

## Acceptance

- [ ] Pinching notes adjusts readable text size within supported bounds without resizing app chrome.
- [ ] Reading anchor stays under the gesture midpoint, including live-preview wrapping and code blocks.
- [ ] One committed preference update per completed gesture; cancellation/unmount cleans up preview and listeners.
- [ ] Single-finger scrolling, selection, soft keyboard, Back, and accessibility controls remain usable.
- [ ] Verify on real Android and iOS; decide separately whether desktop trackpad pinch uses the same note behavior.

Rejected defaults: whole-page zoom moves chrome; pinch-driven interface scaling reflows every surface; CSS-transform text zoom requires panning and complicates caret/hit-testing instead of wrapping text.
