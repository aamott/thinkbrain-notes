# Cloud Conflict Detection

Story 2. Turns daemon-created conflict files into conflict events.

## Scope

- **Pattern table** (data, not providers): filename patterns pairing a
  conflict copy to its original. Tested with real fixtures: OneDrive, Google
  Drive, Syncthing (`.sync-conflict-*`). Best-effort rows: Dropbox
  (`* (conflicted copy)`), Nextcloud, iCloud. First task: capture real
  fixtures per provider — do not trust documented patterns.
- **Live detection:** subscribe to `workspace://changed`; match new files
  against table; pair with original; emit conflict event (new — today
  conflicts are only synchronous errors).
- **Startup reconciliation:** one-time vault scan on workspace open, before
  watcher starts (conflicts appear while app is closed).
- **Cleanup protocol:** provider copy deleted only after resolution write
  succeeds, via echo-suppressed path. Keep-both → rename copy with
  source-based suffix (e.g. `Notes (OneDrive).md`). Failed resolution leaves
  everything untouched.

## Acceptance

- [ ] **Fixtures per provider. Not done, and not doable from here** — see
      Known gaps. The table is written from documentation and every row says so
      in its own `Evidence`, which a test enforces.
- [x] Pairing handles multiple copies of one original, and nested folders
- [x] Pairing requires the original to exist, so a name in a conflict shape
      with nothing to pair against is left alone
- [x] Startup scan finds pre-existing conflicts; the live watcher adds to the
      same keyed set, so one conflict is one conflict however often it is seen
- [x] Conflict copies stay out of the history branch, while remaining outside
      the ignore rules so a checkpoint can still hold both sides
- [ ] Cleanup never deletes an unresolved copy; keep-both renames correctly —
      waiting on a resolution write to exist (story 3)
- [ ] Conflict events reach the frontend — waiting on story 4's panel to
      receive them. `Engine::conflicts()` is what it will read.
- [ ] Verified on Windows (OneDrive's home turf — the watcher itself is not
      yet Windows-verified)

## Known gaps

- **No row has been witnessed.** The story's first instruction was to capture
  real fixtures rather than trust documentation, and that needs the daemons
  themselves. Every row is therefore `Evidence::Documented`, and a test fails
  the moment a row claims otherwise without a fixture beside it. Syncthing is
  the row most likely to be right — its marker is unmistakable.
- **OneDrive and Google Drive are deliberately absent.** OneDrive appends the
  computer name (`note-DESKTOP-AB12CD.md`) and Google Drive a counter
  (`note (1).md`); both are shapes people also produce by hand, and a false
  positive here tells someone their own file is a conflict and offers to
  discard half of it. They need fixtures before they are worth the risk —
  which matters, because OneDrive is the most likely provider a first user has.

## Status

🟨 Table, pairing, scan, live detection and the history filter done. Remaining:
real fixtures, the frontend event, and cleanup.
