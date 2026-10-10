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
- **Responsive:** side-by-side desktop, stacked mobile — container queries,
  because these surfaces live in a resizable sidebar.
- **Per-type:** text → full merge; JSON/YAML/`.canvas` → text merge offered
  but "keep newest / keep both" prominent (`.canvas`: "Visual compare isn't
  available yet for whiteboards"); images → thumbnails + size/date;
  PDF/unknown → metadata card. Keep-both suffix is source-based.
- **Awareness:** toast on new conflicts; activity-bar badge count.

## Decisions

- The list is the feature, not the merge view: cards that can't be usefully
  compared carry their own decision; only genuinely reviewable notes get a
  Review button.
- Save is disabled until every section is answered — the default would be
  this computer's side, and accepting it unread loses the other machine's
  edits.
- The toast counts arrivals (keyed on `theirs.path` in
  `conflictNotificationAdapter.ts`), not outstanding conflicts; it is
  transient and aggregate — sticky would suppress every other producer's
  toast. The badge is the durable awareness path.
- Copy audit runs on rendered pixels (`copy.test.tsx`), not source; git
  nouns banned, "merge"/"merged" allowed as ordinary English.
- The editor buffer is read once, when the comparison opens.
- Backend added: `list_conflicts` (names/sizes/dates only — deliberately no
  diff) and `sync://conflicts` (workspace-only change signal; a payload of
  conflicts would go stale in transit).

## Acceptance

- [x] Every conflict kind renders correct treatment; no raw diff markers —
      `conflictCard.ts` decides by name before content; the native side
      sends pairs of strings so markers cannot appear
- [x] Resolution round-trip: chosen chunks → saved result matches the
      preview (same function of the same state in `mergeModel.ts`)
- [x] Mobile-width layout stacks correctly
- [x] Copy audit automated in `copy.test.tsx`

## Known gaps (remaining work)

- Image cards show sizes and dates, not thumbnails — needs the editor's
  asset resolver on a path that is not a note.
- A merge tab stays open after it is answered — closing it needs a way for
  tab content to close its own tab, which does not exist.
