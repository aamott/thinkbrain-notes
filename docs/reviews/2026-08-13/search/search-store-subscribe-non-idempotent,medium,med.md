- name: `searchIndexStore.subscribeToEvents` is not idempotent — React 18 strict-mode double-mount leaks listeners
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/search/searchIndexStore.ts
- lines: 191-193
- description: |
    `searchIndexStore.subscribeToEvents` (lines 191-193) is:
      `subscribeToEvents() { return subscribeIndexToNoteEvents(get); }`

    The sibling `wikiLinkIndexStore.subscribeToEvents` (lines 217-227) carries an explicit idempotency guard:
      - a module-scoped `currentSubscription: (() => void) | null = null`
      - on call, disposes any existing subscription before creating a new one
      - the returned disposal clears `currentSubscription`

    Its doc comment (lines 73-78) states the reason: "Idempotent: calling it again disposes the previous subscription before creating a new one, so React 18 strict-mode double-mount does not leak listeners."

    Both stores are wired identically in `DesktopShell.tsx`:
      line 508: `useEffect(() => useSearchIndexStore.getState().subscribeToEvents(), []);`
      line 511: `useEffect(() => useWikiLinkIndexStore.getState().subscribeToEvents(), []);`

    Under React 18 strict mode (dev), effects mount → unmount → remount. The wiki-link store's guard makes the second mount replace the first subscription. The search store has no guard, so the first mount's listeners are never disposed and the remount adds a second set — every `note.saved`/`note.created`/`note.renamed`/`note.deleted` event then drives `reindexDocument`/`removeDocument`/`reindexRenamedDocument` twice. The store's `rootPath` guard prevents wrong-workspace work, but not duplicate same-workspace work.

    Fix: mirror the `currentSubscription` pattern from `wikiLinkIndexStore.ts` (lines 41, 217-227) in `searchIndexStore.ts`.
- verification: |
    grep `currentSubscription` in searchIndexStore.ts → 0 matches.
    grep `currentSubscription` in wikiLinkIndexStore.ts → 4 matches (the guard).
    DesktopShell.tsx:508,511 calls both `subscribeToEvents()` from `useEffect(..., [])`, the exact pattern the wiki-link guard's doc comment says it exists to protect against.
