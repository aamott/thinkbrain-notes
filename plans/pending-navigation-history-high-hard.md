# Navigation History

> Back/Forward should feel like the internet: a stack of *places the user was*,
> not a stack of tabs. Today it is a tab-activation log — correct browser
> semantics for tab switching, but wrong granularity for a notes app.

## Goal

Make the title-bar Back/Forward behave like browser/Obsidian history: each
entry is a **location** (document + cursor/scroll position), so Back returns
the user to where they actually were — including in-file jumps — instead of
only to whichever tab was active.

## The core problem

`DesktopTabHistory.entries` stores tab ids only
(`apps/desktop/src/tabs/tabModel.ts`). Tab ids are stable and survive
rename/retarget, which is good plumbing — but they cannot represent "same
file, different position." A wikilink jump to a heading, an outline click, or
a search-result hit inside an open document records nothing, so Back steps
over the navigation users do most in a notes app.

Obsidian's model is the target: per-entry location snapshot; revisiting
restores the position recorded *at that visit*. `editorStateCache` already
parks CodeMirror state per tab id — it is the natural carrier once entries
can name a position, not just a tab.

## What already matches standard behavior

Keep these — they are correct and should not regress:

- Forward tail truncation on new navigation; revisits don't record.
- Dead-entry scrubbing on close; retarget follows renames.
- Disabled-state buttons; scroll/cursor restoration on revisit.

## Design space — compare before implementing

The implementer owns the end state. Sketch at least the candidates below
(and any better one) and pick the *simplest that delivers the user-visible
behavior* — the user only sees Back/Forward landing on the right place.

- **Entries + cursor, locations instead of tab ids** — minimal diff from
  today; keeps the index math and the cursor/activeTabId duplication that
  produced the `removeTab` bug.
- **Two stacks `{ back, forward }` of location entries** — current visit is
  `activeTabId`; no cursor, no dead-entry scan; the re-anchor bug becomes
  unrepresentable.
- **Per-tab trails (Obsidian's leaf model)** — each tab owns its own history;
  conceptually clean for in-file navigation but duplicates state across tabs
  and complicates the global Back/Forward chrome.

Evaluate against the same scenarios the tests cover (open/activate/close/
retarget/reset, mid-history navigation) plus "in-file jump then Back."
Whatever shape wins, the inherent complexity stays: close must scrub,
retarget must rewrite, workspace switch must rebase.

## Status

- ⬜ `location_centric_history` — entries become `{ tabId, position? }`;
  in-file jumps record visits; revisit restores the recorded position
- ⬜ `history_cursor_reanchor` — fix `removeTab` re-anchoring to
  `lastIndexOf(activeTabId)`, which corrupts position mid-history
- ⬜ `history_input_parity` — keyboard shortcut, mouse back/forward buttons,
  command-palette entries; dropdown/tooltip polish optional
