# Badge advertises an unreachable notification

- **Difficulty:** medium
- **Urgency:** medium
- **File:** `apps/desktop/src/shell/phone/PhoneShell.tsx` (~224-231), `apps/desktop/src/shell/phone/ActionItemsMenu.tsx`
- **Owner story:** `contextual_action_items`

## Description

`actionsBadge` sums undismissed notifications for *all* registered right
panels, while the ⋮ bubble's visibility and the menu's row-disabling gate on
`availability(context)`. If the only notified panel is unavailable for the
current context, the badge advertises a notification whose menu row is
disabled — the user cannot reach it.

## Recommendation

Resolve alongside the contextual-filtering story: either keep
notified-but-unavailable rows selectable (requires factories to tolerate a
null document context — verify), or restrict the badge to available panels
(and accept that the notification is invisible until the panel applies).
Desktop has the same quirk: a notified pinned icon stays lit while the dock
suppresses the panel.

## Verification

`PhoneShell.tsx:225` builds `rightIds` from all contributions without
consulting `availability`; `ActionItemsMenu` disables the row via
`disabled={!available}` with no notification override.
