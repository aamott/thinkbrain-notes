- name: Closed tabs leak document contents in DesktopShell documents state
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/shell/DesktopShell.tsx
- lines: 64, 116-178, 425-475, 684-716
- description: |
    `DesktopShell` stores open documents in a `documents: Record<string,
    DocumentViewState>` state (line 64). Entries are added when a tab is opened
    (line 341, line 149) and updated on edit/save (lines 426-475), but they are
    **never removed** when a tab is closed.

    Tab closure flows through `dispatchTabs` with `discardClose` or
    `completeSaveAndClose` (lines 695, 706, 712). The tab reducer's `removeTab`
    (tabModel.ts lines 116-126) drops the tab from `tabs`, but `DesktopShell`
    has no corresponding `setDocuments` call to delete the orphaned
    `documents[tabId]` entry.

    Over a session of opening and closing many notes, the `documents` map
    accumulates stale entries holding full document contents (potentially large
    for long notes). This is a memory leak that grows with usage patterns.

    The fix is to delete the document entry when a tab is closed — either in a
    `useEffect` that watches `tabState.tabs` and removes `documents` keys not
    present in the tab list, or by calling `setDocuments` to delete the entry
    in the `discardClose` / `completeSaveAndClose` handlers.
- verification: |
    Searched `DesktopShell.tsx` for all `setDocuments` calls (9 matches) —
    none delete entries. Searched for `delete `, `removeTab`, `discardClose`,
    `completeSaveAndClose` — the close handlers only dispatch tab actions, no
    document cleanup. Read `tabModel.ts` `removeTab` (lines 116-126) to confirm
    it only filters `tabs`, not external document state.
