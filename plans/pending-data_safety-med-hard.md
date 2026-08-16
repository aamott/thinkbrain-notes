# Data Safety & Recovery

> New epic (medium urgency). User notes are irreplaceable; data loss is the
> worst-case failure for a notes app. Read `plans/app-vision.md` (User data
> separation, Bring your own sync) and `plans/technical-decisions.md` before
> starting any story here.

## Goal

Guarantee that user Markdown files survive crashes, sync conflicts, partial
writes, and disk errors — and give users a clear recovery path when something
goes wrong. Notes must never be silently corrupted or overwritten without a
recoverable backup.

## Scope

In scope (first slice — focused story):

- atomic writes (temp file + rename) for every note save
- corruption detection on open (truncated/partial writes, encoding errors)
- a recovery UI that surfaces detected corruption and offers the last good
  backup

Deferred (later stories):

- vault integrity scan (detect orphaned backups, stale temp files)
- periodic snapshot/backup retention policy
- repair flow for frontmatter/Markdown damage
- integration with cloud-sync conflict detection (see `plans/git-integration/`)

Non-goals:

- a proprietary backup cloud service
- versioning that duplicates Git (Git sync owns that path)
- AI-driven repair or content reconstruction

## Architecture Decisions

- **Atomic writes via temp-then-rename.** Every save writes to a temp file in
  the same directory, then renames over the target. This survives crashes mid-
  write without leaving a half-written note.
- **Backups live alongside the file, outside the vault's app-data.** A
  `.thinkbrain-backups/` folder (or OS temp, TBD by discovery) holds the
  previous version briefly. App caches/settings never go in the vault.
- **Detection is read-time, not background.** The editor detects corruption
  when opening a file (truncation, encoding mismatch, empty result from a
  non-empty file) and routes to the recovery UI rather than silently showing
  an empty editor.
- **Recovery UI is minimal and honest.** Show what was detected, offer the
  last backup, and never pretend data is safe when it isn't.

## Dependencies

- `workspace-explorer` / `note-model` — the document adapter and save path
  are the integration points for atomic writes.
- Cloud-sync conflict work (`plans/git-integration/`) is a separate concern;
  this epic handles local corruption, that epic handles sync conflicts.

## Status

- ⬜ Focused first story: safe writes + corruption detection + recovery UI —
  `data-safety/pending-safe_writes_corruption_detection-med-hard.md`
- 🟨 Settings survive a downgrade, and corruption is recoverable —
  `data-safety/pending-settings_survive_a_downgrade-med-med.md`. Not notes, but
  the same failure: a document the app could not fully read was replaced instead
  of kept. The recovery UI it needs is the one the story above owns.
