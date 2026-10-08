# `open-calendar` command calls `revealPanel` on a left panel — a silent no-op

- **Urgency:** med
- **Difficulty:** easy
- **File:** `/media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/extensions/builtins/journal.tsx`
- **Lines:** 359–364

## Description

The `open-calendar` command handler calls
`revealPanel("journal-calendar.journal")` before opening the calendar tab. The
journal panel is registered with `side: "left"` (`journal.tsx` ~line 240), but
the desktop `revealPanel` supplied to command handlers
(`apps/desktop/src/shell/useShellCommands.ts:105–107`) narrows through
`isSelectableRightPanel` and calls `setRightPanel` — it only ever selects
right-dock panels. For `"journal-calendar.journal"` the guard returns false and
the call is silently dropped.

The obvious alternative also fails: `revealLeftPanel`
(`useShellCommands.ts:112–114`) gates on `isBuiltInLeftPanel`, a literal list of
six first-party ids that rejects every extension-contributed id — even though
`isSelectableLeftPanel` (a registry lookup used by `PhoneShell`) exists and
would admit it. So an extension command currently has **no** working route to
reveal its own left-side panel, and the journal's call is dead code.

The command still works (`context.tabs.open` opens the calendar), so this is a
dropped intent plus a misleading call, not a broken feature.

## Recommendation

Two parts, mostly out of this file's scope:

1. In `useShellCommands.ts`, make `revealPanel` side-aware — select the left
   panel via `isSelectableLeftPanel` and the right via `isSelectableRightPanel`
   (and/or fix `revealLeftPanel` to use `isSelectableLeftPanel` instead of
   `isBuiltInLeftPanel`). The `DesktopCommandContext.revealPanel` doc already
   promises "opening its side popout", so the left case is a gap, not new API.
2. In `journal.tsx`, keep the `revealPanel` call once the host honors it; until
   then it is harmless but dead — a short comment noting the host limitation
   would prevent the next reader assuming the panel is revealed.

## Verification

`useShellCommands.ts:105–114` — `revealPanel` calls `isSelectableRightPanel`
(`shellTypes.ts:43–45`, `side === "right"`) only; `revealLeftPanel` calls
`isBuiltInLeftPanel` (`panelRegistryModel.tsx:155–161`, literal six-id list).
The journal registers `side: "left"`, so `revealPanel("journal-calendar.journal")`
can never select anything. A test asserting the left panel is selected after
running `journal-calendar.open-calendar` fails today.
