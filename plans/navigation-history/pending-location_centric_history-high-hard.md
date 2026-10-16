# Location-Centric History

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** hard

Replace the tab-id-only history entries with location entries so Back/Forward
navigates *places*, not just tabs. This is the epic's headline change: users
who grew up on browsers expect Back to undo "I clicked a link and landed
somewhere else" — including somewhere else in the same document.

## Sketch (needs design pass)

- Entry becomes roughly `{ tabId, position? }` where position is enough to
  restore scroll + cursor/selection in the document at that visit (a
  CodeMirror `EditorState` ref or serializable anchor — see
  `editorStateCache`, which already solves the park/restore problem per tab).
- Record a new visit when a *navigation gesture* moves the user: file open,
  tab activate, wikilink follow, heading/anchor jump, search-result jump.
  Plain typing/clicking around a document does not record.
- Revisit restores the position captured at that visit (browser semantics),
  not just the tab's latest state.
- Decide per-surface semantics: does phone navigation
  (`shell/phone/usePhoneNavigation.ts`) share this model or stay a depth
  stack? Divergent models already exist; make the choice explicit.
- Preview-tab takeover and retarget already rewrite entries in place — keep
  that, extended to positions.

## Acceptance criteria

- Following a link/jump within one document, then Back, returns to the
  pre-jump position in that document.
- Back/Forward across tabs still works exactly as today (forward truncation,
  dead-entry scrubbing, rename retarget) — existing `tabModel` tests still
  pass or are deliberately updated.
- Revisiting restores the recorded scroll/cursor, not merely the tab.

Key files: `apps/desktop/src/tabs/tabModel.ts`,
`apps/desktop/src/tabs/editorStateCache.ts`,
`apps/desktop/src/shell/DesktopShell.tsx`,
`apps/desktop/src/shell/phone/usePhoneNavigation.ts`
