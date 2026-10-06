# Contextual Action Items

**Status:** ⬜ pending · **Urgency:** med · **Difficulty:** hard

Filter action items (right-panel contributions) by the current context.
Desktop greys unavailable items; phone hides them. Starts after
`floating_bubbles` is validated.

## Sketch (needs design pass)

- One resolver: `resolveActionItems(panels, context) → { entry, available }[]`;
  each surface applies its own presentation policy (disable vs omit).
  Currently computed in three places — `PhoneShell` (⋮ bubble count),
  `ActionItemsMenu` (per-row), `DesktopShell` (dock suppression) — so the
  resolver belongs in `panels/`, shared by all three.
- Desktop title bar does not consult `availability` today — it must.
- Extension manifest panels cannot ship functions, so they need a
  declarative `when` (e.g. `["document", "markdown"]`), VS Code when-clause
  style, evaluated by the same resolver.
- Define the context keys ("app" = active tab kind: note, code, media,
  settings, none).
- Badge policy: the ⋮ bubble counts notifications for *all* registered right
  panels, including unavailable ones whose menu row is disabled — so a badge
  can advertise a notification the user cannot open. Decide whether notified-
  but-unavailable rows stay selectable (factories may not tolerate a null
  document) or the badge only counts available panels. Desktop has the same
  quirk: a notified pinned icon stays lit but the dock suppresses it.
