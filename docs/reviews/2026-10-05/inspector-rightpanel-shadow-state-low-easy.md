# Inspector falls back to desktop `rightPanel` state

- **Difficulty:** easy
- **Urgency:** low
- **File:** `apps/desktop/src/shell/phone/PhoneShell.tsx` (InspectorSheet `panel` prop), `apps/desktop/src/shell/phone/usePhoneOpeners.ts`

## Description

On phone, nothing reads `shell.rightPanel` except the InspectorSheet's
fallback (`inspectorPanel ?? shell.rightPanel ?? "outline"`). Two callers
call `setRightPanel(...)` *and* open the overlay, so the desktop dock state
and the phone overlay only coincidentally agree — a shadow writer that makes
the wiring look more coupled than it is.

## Recommendation

Track the last-opened inspector panel in a shell-local ref (or accept it via
the overlay entry) and drop the `setRightPanel` pre-writes on phone, so the
sheet's closed-state placeholder is phone-owned, not desktop-state spillover.

## Verification

Architecture review: `ActionItemsMenu.onSelect` calls `setRightPanel` +
`navigation.openOverlay`; `usePhoneOpeners.ts` calls `setRightPanel("history")`
before `showOverlay` — both only to seed the fallback.
