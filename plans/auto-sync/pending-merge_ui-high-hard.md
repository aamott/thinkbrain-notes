# Merge UI

Story 4. The product centerpiece: nontechnical users merge confidently.
Mockup: `merge-ui-mockup.html` (this directory). Zero git jargon anywhere —
copy review is an acceptance criterion.

## Scope

- **Triage cards** (sidebar panel): one card per conflict — "Two versions of
  this note exist", source chip, Review button. Trivial cases resolve in the
  card (binaries, keep newest).
- **Merge tab** (opens from card): both versions with source + device/time
  chips; identical regions collapsed ("14 identical lines"); per-chunk choice
  chips labeled **by source** ("Keep this computer's" / "Keep OneDrive's" /
  "Keep both"); live Result preview; "Done — save merged note"; reassurance
  line ("You can always undo — previous versions are kept in History").
- **Responsive:** side-by-side desktop, stacked mobile — labels unchanged.
- **Per-type:** text → full merge; JSON/YAML/`.canvas` → text merge offered
  but "keep newest / keep both" prominent (`.canvas` copy: "Visual compare
  isn't available yet for whiteboards"); images → thumbnails + size/date;
  PDF/unknown → metadata card. Keep-both suffix is source-based.
- **Awareness:** toast on new conflicts ("Sync found 2 items to review");
  activity-bar badge count.

## Acceptance

- [x] Every conflict kind renders correct treatment; no raw diff markers ever —
      `conflictCard.ts` decides by name *before* content, so a `.canvas` board
      and an `.svg` drawing are not offered a comparison they would fail at.
      Markers cannot appear: the native side sends pairs of strings
- [x] Resolution round-trip: choose chunks → result matches preview — the
      preview and the save are the same function of the same state
      (`mergeModel.ts`), and a test asserts the saved contents *is* what was
      previewed. "History shows both prior versions" waits on story 5's drawer;
      the checkpoint itself is covered in story 3
- [x] Mobile-width layout stacks correctly — container queries rather than
      viewport breakpoints, because these surfaces live in a resizable sidebar
      whose width has nothing to do with the window's
- [x] Copy audit: automated. `copy.test.tsx` renders every state of both
      surfaces and fails on a git noun in what reaches the screen

## What this story decided

**The list is the feature, not the merge view.** Most conflicts are not worth
opening — a picture the user recognises, a board they know they redrew — so
every card that cannot usefully be compared carries its own decision. Only a
note that can genuinely be reviewed gets a Review button.

**Saving waits for every section.** The mockup shows Done available with a
section still pending. It is disabled until each one is answered: the default
would be this computer's side, and accepting it unread is exactly how someone
loses the paragraph they wrote on the other machine.

**The audit runs against pixels, not source.** `conflict.theirs.path` in code
is fine; "theirs" on screen is not. Rendering each state and scanning the text
is the only way to tell those apart. "Merge" and "merged" are deliberately not
on the banned list — the mockup itself says "save merged note", and merging
two documents is ordinary English. It is the *nouns* of git that mean nothing
to someone who has never used one.

**The editor buffer is read once, when the comparison opens.** Re-reading it
would mean re-reading the whole comparison on every keystroke in the other tab,
which would throw away the decisions already made.

## Backend this story added

- `list_conflicts` — the triage list. Deliberately does not diff: a card shows
  names, sizes and dates, and the list asks for every conflict at once.
- `sync://conflicts` — a change signal carrying only the workspace, so a window
  re-reads rather than trusting a payload that went stale on the way. Emitted
  both when a daemon drops a copy and when any window settles one.

## Known gaps

- **No new-conflict toast.** Sync failures now use the status-bar notification
  surface, but a conflict toast still needs a deliberate notification policy:
  a cloud daemon can make several copies at once, and one toast per file would
  be noise. The badge remains the durable awareness path for now. Blocked on
  `notification_system` — a conflict adapter pushes into the same store.
- **Image cards show sizes and dates, not thumbnails.** Reading an image out of
  the vault into the panel needs the asset resolver that the editor uses, on a
  path that is not a note.
- **A merge tab stays open after it is answered**, showing that it was saved.
  Closing it would mean a way for tab content to close its own tab, which does
  not exist.

## Status

🟨 Triage cards, the comparison, the result preview, the resolution write and
the badge are done. Remaining: thumbnails, the toast, and self-closing tabs.
