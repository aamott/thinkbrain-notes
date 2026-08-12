# Conflict-Safe Note Writes

## Goal

Stop a save from silently overwriting a file that changed underneath it.

## Why this exists

The watcher can now tell an open tab that its file changed, and the shell asks
the user what to do about it (`StaleDocumentBanner`). But the answer is only
advisory: `write_markdown_file` overwrites blind. Whatever the user picks — and
whether or not they ever saw the notice — the next save from that tab replaces
the newer file.

The settings writes already solve this. `write_app_settings` and
`write_workspace_settings` take an `expected` precondition and fail with
`settings.app_conflict` / `settings.workspace_conflict` when the file on disk is
not what the caller last read; `native/documentChain.ts` retries against fresh
state. Notes have no equivalent.

The gap is widest exactly where it matters: a tab left open overnight while a
sync client pulls changes, or two ThinkBrain windows on the same vault.

## Design

- Give `write_markdown_file` an optional `expected: Option<String>` and the same
  precondition check the settings commands use, returning a
  `workspace.note_conflict` error.
- The shell already knows what it last read — `documents[tabId].contents` is the
  buffer, and a save carries it. What it does not track is the *disk* text at
  load time, which is what `expected` needs. Adding it to `DocumentViewState`
  is the smaller half of this story.
- On conflict, do not retry the way `documentChain` does. A note is not a
  settings file: merging is the user's call, so surface it through the same
  conflict banner instead.

## Acceptance Criteria

- [ ] `write_markdown_file` accepts `expected` and rejects a mismatched write
      with a distinct error code, with Rust tests covering match, mismatch, and
      the first write to a new file.
- [ ] The shell tracks the disk text a tab was loaded with, and sends it.
- [ ] A rejected save leaves the buffer untouched and raises the conflict
      banner rather than an error toast.
- [ ] Saving with no outside change is unaffected — no extra read per save.

## Non-goals

Merging the two versions, or showing them side by side. That waits on
`git-integration/pending-inline_diff_viewer-high-med.md`.
