# Conflict-Safe Note Writes

## Goal

Stop a save from silently overwriting a file that changed underneath it.

## Why this exists

The watcher can now tell an open tab that its file changed, and the shell asks
the user what to do about it (`StaleDocumentBanner`). But the answer was only
advisory: `write_markdown_file` overwrote blind. Whatever the user picked — and
whether or not they ever saw the notice — the next save from that tab replaced
the newer file.

The settings writes already solve this. `write_app_settings` and
`write_workspace_settings` take an `expected` precondition and fail with
`settings.app_conflict` / `settings.workspace_conflict` when the file on disk is
not what the caller last read; `native/documentChain.ts` retries against fresh
state. Notes had no equivalent.

The gap is widest exactly where it matters: a tab left open overnight while a
sync client pulls changes, or two ThinkBrain windows on the same vault.

## Design

- `write_markdown_file` takes an optional `expected: Option<String>` and refuses
  a mismatch with `workspace.note_conflict`.
- The shell tracks the disk text each tab is level with, in
  `DocumentViewState.diskContents`, and sends it on every save.
- On conflict, do not retry the way `documentChain` does. A note is not a
  settings file: merging is the user's call, so it surfaces through the same
  conflict banner instead.

## Acceptance Criteria

- [x] `write_markdown_file` accepts `expected` and rejects a mismatched write
      with a distinct error code, with Rust tests covering match, mismatch, and
      a write with no precondition at all.
- [x] The shell tracks the disk text a tab was loaded with, and sends it.
- [x] A rejected save leaves the buffer untouched and raises the conflict
      banner rather than an error toast.
- [x] Saving with no outside change is unaffected — no extra read per save.

## Decisions

**`expected: None` means unchecked, not "expected no file".** This inverts the
settings semantics, where an absent file is itself a precondition. A note always
exists by the time the command runs, and callers with no read behind them —
extension writes, scripted edits — have nothing to expect. Making the check
opt-in is what keeps the AC above ("no extra read per save") reachable and
leaves those callers working.

**Forgetting the precondition is a build error, not a silent blind write.**
`WorkspaceMarkdownDocumentWrite.expected` is `string | undefined` — required to
be present, allowed to be absent in value. Optional (`expected?: string`) would
fail open: a call site that dropped it would compile, pass every test, and
quietly restore the overwrite this story exists to stop. Requiring the key makes
the unchecked write something someone chose and can be read in the call.
`extensionWorkspace.writeNote` is the one place that chooses it.

**Read, check and write are under `WORKSPACE_ENTRY_MUTATION_LOCK`.** The lock
the entry mutations already take. A check another in-process writer could land
inside would only narrow the window it was added to close; this also stops a
rename or delete slipping between. Outside processes cannot be locked out at
all — that is inherent, and the window is now microseconds instead of the life
of an open tab.

**An unreadable file counts as a mismatch, not a read error.** The caller's move
is the same either way: do not overwrite. Reporting it as a failed read sends
them down a path that cannot help.

**"Keep mine" re-anchors instead of only dismissing.** This is a change to what
the earlier story signed off, forced by the precondition. Dismissing alone would
leave the tab computing its saves from the version the user just declined, so
the next save would be refused and the same notice would return — every time,
with no way through. So it re-reads the file and points the precondition at what
is there now, leaving the buffer untouched. That is not the same as forcing the
write: a *further* change landing after the user chose is still caught, which is
the whole point of having asked them.

**A tab that was never read cannot be saved.** `saveablePrecondition` returns
`null` for a view whose load failed or is still running, and the shell refuses.
This fixes a latent bug rather than adding one: a failed load left an empty
buffer that a save would have written over a file the shell could not read.

## What is not covered by tests

The shell glue in `saveDocument` and `keepMyVersion` — that the branches wire
the tested pure functions together in the right order. The pure functions
(`saveablePrecondition`, `applySavedDocument`, `applyRefusedSave`,
`anchorDiskContents`) are covered and mutation-checked, and the one failure that
would lose data — dropping `expected` — is now a compile error rather than
something a test would have to catch. What is left uncovered fails visibly
instead: an error toast where a banner belonged, or a banner that will not go
away.

## Non-goals

Merging the two versions, or showing them side by side. That waits on
`git-integration/pending-inline_diff_viewer-high-med.md`.
