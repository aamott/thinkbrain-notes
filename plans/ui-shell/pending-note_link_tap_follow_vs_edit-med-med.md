# Tap-to-Follow vs Edit Note Links

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** med

Tapping a link inside a note should follow it — unless the tap is meant to
edit. Rule of thumb: if the link's Markdown syntax is visible (cursor on
the line, source mode, selection dragged into it), the tap edits; if the
link renders as text (live preview hiding syntax), the tap follows.

## Shape

- Live preview already knows which lines render without syntax — reuse that
  state rather than re-deriving visibility.
- Applies to wiki links and Markdown links; check the existing
  `onOpenNote` path for the follow side.
- Touch needs a hover-free equivalent of the desktop's modifier-click, and
  desktop behaviour should stay consistent with the same rule.
- Edge cases: taps that start a text selection, cursor already inside the
  link, and links inside code blocks (never followable).
