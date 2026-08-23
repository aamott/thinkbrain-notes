# Story: Safe Writes, Corruption Detection, and Recovery UI

## Goal

Atomic, crash-safe note saves; corruption detection on open; minimal recovery
UI. First slice of the data-safety epic — no snapshot retention, vault scan, or
repair flow yet.

## Acceptance Criteria

- [x] Every save writes a temp file then renames over the target; a crash
      mid-write leaves the previous file intact. `write_file_atomically` had
      existed and been tested since settings needed it — notes were the one
      caller still writing in place, which is the path this epic exists to
      protect. Both note sites in `markdown.rs` now use it.
      Proven by inode: `fs::write` opens with `O_TRUNC` and keeps the inode, a
      rename gives the name a new one, so the test asserts the number changed.
      Unix-only, because the helper is explicit that its Windows fallback
      (remove-then-rename) is not atomic and there is nothing equivalent for a
      test to read.
- [x] Previous version kept as a backup — `commands/backup.rs`. App-data, per
      workspace, mirroring the note's folder so the tree is browsable by hand;
      three versions per note, pruned oldest-first. Best-effort by contract: a
      backup that cannot be written must never fail the save, or the safety net
      becomes a way to lose work.
- [x] Opening detects encoding errors — `read_note` reads bytes and reports
      `workspace.note_unreadable` where `fs::read_to_string` used to fold the
      failure into the same error an absent file gets. The shell can now tell
      "not there" from "there and wrong".
- [x] Emptiness, on the outside-change path rather than the read path —
      `applyReloadedDocument` is the only place that knows both what the tab
      held a moment ago and that the change came from outside, since the app's
      own writes are echo-suppressed and never reach it. That is what separates
      damage from someone deleting their own text.
- **Not** truncation — a decision, not an outstanding item. The obvious test —
      empty note, non-empty version kept — was built, then removed before
      commit: it fires when someone deletes a note's contents and saves, since
      the version it kept is the text they just deleted. It would have refused
      to open a note they emptied on purpose, and with no recovery UI yet that
      leaves them stuck. What actually separates damage from intent is that the
      note went empty *without the app writing it*, which is the watcher's
      knowledge. That check belongs on the outside-change path.
- [x] Corruption routes to a recovery UI. Two surfaces, because they are two
      situations: a note that cannot be decoded has no editor to put a banner
      above, so the tab shows `DamagedNote` in place of the dead-end
      `Unavailable`; a note that went empty still opens and still wants typing
      into, so it gets `EmptiedNoteBanner` in `StaleDocumentBanner`'s shape —
      non-modal, `role="status"`, one per tab. Both offer the same
      `NoteVersionList`.
- [x] Honest messaging only. The version list says outright when this device
      kept nothing and points at the History panel, which is the cost of
      keeping backups out of the synced folder. A failed restore reports the
      failure rather than reporting success.
- [x] Nothing of the app's goes in the vault — backups live in per-device
      app-data, keyed by the same workspace hash the hidden repo uses.
- [x] Covered by tests, in Rust rather than Vitest: all of this is native — the
      write, the backup and the decode all happen where the bytes are. Reverting
      the atomic write, or the backup, fails them.
- [x] Recovery states covered — `NoteVersionList.test.tsx`. Removing the
      confirmation fails four of the six.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass — 1,339 desktop and 391
      native tests.

## What shipped, and what it exposed

Routing notes through the atomic helper changes the shape of what reaches the
file watcher: a created file at a name nobody asked about, and the destination
arriving by rename rather than by write. Either could have surfaced as an
outside edit, which is how a tab reloads itself out from under someone
mid-sentence. The existing echo-suppression test could not have caught it — it
writes with `fs::write` rather than through the save path — so a second test
now drives the real one and asserts the app reports no change of its own. The
temp name is hidden, so the vault walk skips it for the same reason it skips
every other dot-entry; that is pinned, because a later change to a non-hidden
temp name would be a quiet regression.

The same shape of question came up for the restore, and got the same answer:
it writes through the ordinary save path rather than around it, so the version
it replaces is kept like any other.

## Restoring

Restoring overwrites, and asks first. The write goes through the ordinary save
path, so the version being replaced is kept in turn — the restore is itself
undoable, which is what lets the confirmation be an honest question rather than
a last chance. The confirmation is inline rather than modal: the user did not
start this task, and `DirtyCloseDialog` stays the modal for the one decision
that genuinely blocks.

The version path arrives from the frontend and is not trusted. `restore_note_version`
checks it resolves inside *this note's own* backup folder before reading it;
without that a crafted request could write any readable file on the machine
into a note. A test covers the refusal.

## Discovery — resolved 2026-08-23

**Backup location: OS app-data, per device.** Not the vault. The reasoning is
better than "app caches do not belong in the vault", though that holds too: a
user with the app on two or three machines then has two or three *independent*
backup sets, each on a device that can be lost separately, and none of them
inside the folder the sync daemon is rewriting. Putting backups in the vault
would hand them to the very process a backup exists to protect against —
OneDrive mangling a file would mangle its backup alongside it, and the copies
would multiply across every device instead of standing apart.

The cost is honest and must be stated in the recovery UI: a backup does not
travel with the vault. Restoring on a machine that never held the note finds
nothing, and the user is pointed at the hidden repo's history instead, which
does travel.

**Retention: count-based**, with a setting later for both count and age. Count
is the one that bounds disk use predictably, which is what app-data needs.

**Detection: on every open, limited to what the read already knows** — invalid
UTF-8, which the read has to decide anyway and which previously surfaced as a
plain read error with no route to a backup.

The emptiness half of this answer did **not** survive implementation, and the
acceptance list above records why: checking it at read time cannot tell damage
from someone deleting their own text. It moved to the outside-change path,
where the app's own writes never reach and the previous contents are known.

Deliberately **not** attempted: general truncation detection. A short note is
not a damaged one, and without a prior known-good length the check cannot tell
them apart. A *suspicious shrink* against the last kept version is a defensible
heuristic once someone asks for it, but it is a heuristic and the UI would have
to say so rather than assert damage.

## Where it landed

Guessed wrong at planning time, so recorded as built:

- `src-tauri/src/commands/workspace.rs` — `write_file_atomically`, already there
- `src-tauri/src/commands/markdown.rs` — the save routed through it, and `read_note`
- `src-tauri/src/commands/backup.rs` — keeping, listing, pruning, restoring
- `src/shell/externalDocumentSync.ts` — the emptied-outside mark
- `src/shell/{DamagedNote,EmptiedNoteBanner,NoteVersionList}.tsx` — the surfaces
- `src/workspace/noteBackupService.ts` — the bridge
- `apps/desktop/src-tauri/src/commands/` — native temp/rename if needed

## References

- `plans/pending-data_safety-med-hard.md` — epic
- `plans/app-vision.md` — User data separation, Bring your own sync
- `plans/wip-note-model-low-hard.md` — note model and save path
