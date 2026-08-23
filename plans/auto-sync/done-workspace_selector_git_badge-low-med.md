# Workspace selector: git-linked folder indicator

Low urgency UX follow-up. Depends on 6e (Bring in from Git link) so recent
workspaces can include folders that have a Git link configured.

## Problem

The workspace selector lists recent folders with no cue whether a folder is
an ordinary notes folder or one linked for Git sync (`sync.destination` set).
After Bring in from Git link, several recent entries may look identical
except for the path.

## Open product choice (settle before or during UI)

How to mark a git-linked workspace in the selector:

- **A.** Two folder icons (plain vs git-linked)
- **B.** Same folder icon plus a small second badge/glyph
- **C.** Something else (text suffix, tint, etc.)

Default lean if undecided: **B** (keeps one folder metaphor; badge is
easier to theme and less likely to look like a different object). Confirm
with a quick glance at the selector density before shipping.

## Decisions to lock with the choice

- **Choice:** **A** (Folder vs FolderGit2 icons from Lucide).
- **Signal = app Git link, not vault `.git`.** A folder counts as linked when
  this app has a persisted `sync.destination` for it (workspace settings in
  app-data). A user-owned `.git` inside the vault is a different status
  already handled elsewhere; do not conflate the two icons.
- **Cheap to compute for the recent list.** Prefer reading the small
  settings record (or a tiny native summary) per recent path; do not attach
  a full sync engine just to paint the selector.
- **Stale / missing settings.** If settings cannot be read, show the plain
  folder treatment rather than guessing "git".
- **A11y.** The difference must not be color-only; expose an accessible name
  or description ("Git-linked workspace" / "Folder").
- **Current workspace.** The open folder uses the same rule as recent rows.

## Acceptance

- [x] Icon/badge choice recorded (A/B/C) in this file before merge
- [x] Recent list distinguishes plain folders from Git-linked ones
- [x] Distinction is based on this app's `sync.destination`, not vault `.git`
- [x] Unreadable settings fall back to plain-folder treatment
- [x] Accessible name/description differs for the two kinds
- [x] Focused UI test covers at least one plain and one linked recent path

## Out of scope

- Sync status (synced / needs attention) in the selector — footer/history
  already own that
- Cloud-daemon / OneDrive badges
- Sorting or filtering the recent list by linked vs plain

## Status

🟩 Implemented in app code. Choice A (FolderGit2) implemented with accessible names and focused test.

