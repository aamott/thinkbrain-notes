# `openOverlay`/`showOverlay` API split is subtle

- **Difficulty:** easy
- **Urgency:** low
- **File:** `apps/desktop/src/shell/phone/usePhoneNavigation.ts`, callers in `PhoneShell.tsx`

## Description

The navigation API exposes `showOverlay` (replace the peer overlay in place)
and `openOverlay` (always push). They differ only for the inspector, and the
only `openOverlay` caller is the actions→inspector drill-in. The comments
strain to describe the difference; callers have to know which is correct.

## Recommendation

Collapse to one `showOverlay` plus an explicit `push` flag, or a named
`openInspector(panel, parent)` that encodes the two real flows.

## Verification

Architecture review: `PhoneShell.tsx` uses `openOverlay` once (actions →
inspector); `usePhoneNavigation` documents the split as push-vs-replace for
one overlay kind.
