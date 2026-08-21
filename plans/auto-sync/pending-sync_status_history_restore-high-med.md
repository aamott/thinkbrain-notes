# Sync Status, History, Restore

Story 5. The trust surfaces. All work with zero sync configured.

## Scope

- **Status pill** (direct `StatusBar.tsx` wiring — it's hardcoded today, no
  registration API needed yet): `✓ All synced · 9:31 AM` / syncing spinner /
  `⚠ 2 items need attention` + count. Click → conflicts panel or history.
  Persist last-success time + last-error message; errors always name a
  recovery action.
- **Sync History:** friendly list from hidden-repo commits ("Today 9:31 AM —
  3 notes updated"), expandable to per-file lines with Restore buttons.
- **Restore previous version:** right-click note → dated list from hidden
  repo → restore (restore itself is checkpointed, so it's undoable too).
- Local-only conflict-rate counter surfaced here (feeds the
  three-way-for-cloud go/no-go; no telemetry).

## Acceptance

- [x] Pill reflects real state transitions; error copy includes action —
      `status.rs` ranks the five states by who has to act, and `recoveryFor`
      names something to do for every failure code including the ones nobody
      planned for. A test walks each branch and asserts the action is there.
- [x] History readable by a nonuser-of-git; expandable raw message escape
      hatch — the list is dates and note counts, and "What was written down"
      holds the record itself for anyone who would rather read that. The copy
      audit renders every state of the panel and the footer and fails on a git
      noun.
- [x] Restore round-trip test incl. restore-of-restore — and the checkpoint
      test asserts the restore point holds what was *about to be overwritten*,
      which is the half that makes the second restore possible.
- [x] Everything functions with no remote/cloud configured — nothing in this
      story has a network path. A vault with its own git repository has no
      engine, and the footer says so rather than claiming everything is saved.

## What this story decided

**One reader answers both questions.** "Sync History" and "previous versions of
this note" are the same walk asked a narrower question, so they are one
function (`history::read(repo, note, limit)`) and one panel. Two readers could
disagree about what happened to a note, which is the one thing a history may
never do.

**The last-saved time is read from history, not remembered.** A pill that
forgot the moment the app launched would be the least trustworthy thing on the
screen. The head commit's time is already the answer, so nothing is persisted.

**A note's version list leaves out the change that deleted it.** That change
left no content behind, so offering it would be offering to delete the note
again under a button labelled Restore. The version before it is the one to put
back, and it is one row further down.

**A restore is not echo-suppressed**, for the same reason resolving a conflict
is not: the note changed under an editor that is probably open on it, and the
watcher's outside-edit path already refreshes every window.

**The conflict-rate counter is derived, not counted.** Checkpoints carry a
fixed `Reason`, so "how often has someone had to choose between two versions"
is a walk of an existing ref rather than a new file to keep in step with
reality. Local only, and never sent anywhere — it exists so story 6's
three-way-merge go/no-go is answered with this vault's evidence.

## Backend this story added

- `sync_status` — the footer's whole answer in one read: state, counts, when it
  last saved, and the failure if there is one.
- `sync_history` — recent changes newest first, or one note's restorable
  versions. Diffs each change against its parent with the low-level tree diff,
  which needs no index and no attribute stack, so a page of history stays a
  page of object reads.
- `restore_version` — reads the old version, takes a restore point of what is
  on disk, then writes. In that order, which is what makes it undoable.
- `sync_conflict_rate` — decisions against recorded changes.
- `sync://status` — announced by the sweeper when a change lands or a failure
  appears or clears, and by the watcher when a batch reaches the engine. Only
  when the footer would read differently: the sweeper runs twice a second and
  almost every tick is last tick's answer.
- **Sync failure notification:** a failed round trip opens a short notification
  with the error and recovery action, then remains behind the status-bar bell
  until a successful round trip clears it. Failed automatic attempts still
  count toward the frequency cap, so an unreachable link cannot flash the
  footer every sweep tick.

## Known gaps

- **Restore has no confirmation step.** It does not need one — the restore
  point is taken first, so the way out is another restore — but a note with
  unsaved edits in an open editor will have them replaced on disk, and the
  editor reloads. The merge tab has the same shape and the same gap.
- **Not verified on Windows**, like the rest of this feature. Two status tests
  are Unix-only: they provoke a real recording failure by naming a note inside
  a file, which Windows reports as "not found" rather than "not a directory".

## Status

🟨 Pill, history, per-note versions, restore and the counter done. Remaining:
the retry-policy decision above, and Windows.
