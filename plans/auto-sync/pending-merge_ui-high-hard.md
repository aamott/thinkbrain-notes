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

- [ ] Every conflict kind renders correct treatment; no raw diff markers ever
- [ ] Resolution round-trip: choose chunks → result matches preview → History
      shows both prior versions
- [ ] Mobile-width layout stacks correctly (browser responsive check now;
      device testing in mobile epic)
- [ ] Copy audit: no merge/commit/HEAD/repository/ours/theirs in user-facing
      strings

## Status

⬜ Pending.
