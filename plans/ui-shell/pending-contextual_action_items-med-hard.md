# Contextual Action Items

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** hard

Filter action items (right-panel contributions) by the current context.
Desktop greys unavailable items; phone hides them. Starts after
`floating_bubbles` is validated.

## Sketch (needs design pass)

- One resolver: `resolveActionItems(panels, context) → { entry, available }[]`;
  each surface applies its own presentation policy (disable vs omit).
- Desktop title bar does not consult `availability` today — it must.
- Extension manifest panels cannot ship functions, so they need a
  declarative `when` (e.g. `["document", "markdown"]`), VS Code when-clause
  style, evaluated by the same resolver.
- Define the context keys ("app" = active tab kind: note, code, media,
  settings, none).
