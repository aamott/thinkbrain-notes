# Cloud Conflict Detection

Story 2. Turns daemon-created conflict files into conflict events.

## Scope (done) and remaining work

Shipped: pattern table pairing a conflict copy to its original, live
detection on `workspace://changed`, one-time startup scan, keyed dedup,
history-filter exclusion, cleanup protocol (delete copy only after the
resolution write succeeds; keep-both renames to `note (Provider).md`),
`list_conflicts` + `sync://conflicts` frontend event.

Remaining: real fixtures per provider, and Windows verification.

## Acceptance

- [ ] **Fixtures per provider** — the table is written from documentation;
  every row is `Evidence::Documented` and a test fails the moment a row
  claims more without a fixture beside it. Capture real fixtures — do not
  trust documented patterns. Syncthing (`.sync-conflict-*`) is most likely
  right; Dropbox/Nextcloud/iCloud rows are best-effort.
- [x] Pairing: multiple copies of one original, nested folders; the
      original must exist so an unpaired conflict-shaped name is left alone
- [x] Startup scan finds pre-existing conflicts; the live watcher adds to
      the same keyed set — one conflict is one conflict however often seen
- [x] Conflict copies stay out of the history branch but outside ignore
      rules, so a checkpoint can hold both sides
- [x] Cleanup never deletes an unresolved copy; keep-both renames after the
      provider that made it (never matches the table again, counts up on
      name collision). Deliberately not echo-suppressed: the watcher's
      outside-edit path already removes the copy from file lists and
      reloads the note in every window
- [x] Conflict events reach the frontend; `sync://conflicts` carries only
      the workspace because a conflict payload would go stale
- [ ] Verified on Windows (OneDrive's home turf — the watcher itself is not
      yet Windows-verified)

## Known gaps

- **No row has been witnessed** — needs the real daemons.
- **OneDrive and Google Drive are deliberately absent**: their conflict
  shapes (`note-DESKTOP-AB12CD.md`, `note (1).md`) are shapes people also
  produce by hand, and a false positive offers to discard half someone's
  note. They need fixtures before they are worth the risk — which matters,
  because OneDrive is the most likely provider a first user has.
- A resolved copy was briefly re-raised as a fresh conflict seconds after
  resolution; found in story 3, fixed in `registry::note_changes`.

## Status

🟨 Table, pairing, scan, live detection, history filter, cleanup and the
frontend event done. Remaining: real fixtures per provider, and Windows.
