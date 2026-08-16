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

- [ ] Fixture tests per tested provider; pairing handles multiple copies of
      one original
- [ ] Startup scan finds pre-existing conflicts; no duplicate events with
      live watcher
- [ ] Cleanup never deletes an unresolved copy; keep-both renames correctly
- [ ] Verified on Windows (OneDrive's home turf — watcher itself is not yet
      Windows-verified)

## Status

⬜ Pending.
