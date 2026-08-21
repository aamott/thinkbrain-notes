# Bring in workspace from Git link

Story 6e. Depends on 6c (keychain) and 6d (labeled sign-in profiles). Second
onboarding story: create a **new** notes folder from a secret-free HTTPS git
link (or a local bare-folder destination) and open it.

Does **not** redesign credential profiles. Import reuses `sync.signInProfile`
and the existing catalog; a missing selection is never replaced.

## Decisions

- **Two selector actions.** The workspace menu's single Add workspace action
  becomes `Open folder…` (existing picker) and `Bring in from Git link…`.
- **Workspace-owned dialog.** An accessible focused dialog/sheet: git link,
  parent-folder picker, native-derived child-folder preview, optional saved
  sign-in filtered to the link host. Public HTTPS and local paths work with
  no profile. Never auto-select a different profile when the chosen one is
  missing.
- **Parent + derived child.** The user picks a parent directory. Native code
  derives a cross-platform-safe child name from the remote path (strip
  trailing slash and `.git`; reject empty, `.`/`..`, separators, control
  characters, Windows reserved/device names, trailing dot/space). Preview
  returns the exact name and target path; the frontend does not join paths.
- **New empty child only.** Create exactly one new folder under the canonical
  parent. Refuse if it already exists. Never merge into a non-empty or
  existing folder in this release.
- **App-owned for this operation.** On any setup failure, remove that created
  folder plus this operation's workspace settings and hidden repo. Never
  remove the selected parent or anything that predated the command.
- **No vault `.git`.** Hidden-repo bootstrap, fetch/adopt/merge/send, selected
  profile context, path validation, and default-branch discovery are reused.
  No system Git, no branch chooser. An empty remote may create an empty
  linked workspace.
- **Settings before the trip.** Persist `sync.destination` and the explicit
  `sync.signInProfile` (or no profile) before the first trip so a new window
  is configured. A failed operation cleans those settings. Never persist
  token material.
- **Dedicated import orchestration.** Bootstrap + first trip run off the
  command handler around existing round-trip primitives (not a fork of
  network/merge). Starting import returns promptly with an opaque request ID
  and target path. A dedicated `sync://import` event carries request ID,
  state/phase, target path, and a redacted NativeError. Only the matching
  dialog consumes progress. Completion opens the new workspace window
  **exactly once** (native open on success, so a closed source window still
  keeps the imported folder).
- **No missed fast completion.** The dialog installs its event listener before
  enabling import and holds an early result until the start command returns
  its request ID.
- **Opening may check again.** Opening the successful workspace attaches the
  engine and may run one extra idle-style check. That check cannot interleave
  with the import trip (workspace lane) and must not mutate a completed
  import incorrectly. It is a no-op when nothing changed.
- **No cancellation** this release. Prevent duplicate submissions.

## Acceptance

- [x] Native child-name cases: strip `.git`/slash; reject empty, dot,
      separators, controls, reserved/device names, trailing dot/space
- [x] Traversal/reserved names never become a child folder
- [x] Existing target is refused; parent is left untouched
- [x] Failed fetch removes the created folder, settings, and hidden repo
- [x] Successful import never writes `.git` in the vault
- [x] Settings persist destination + profile id without token material
- [x] Local bare remote with a nonstandard default branch is adopted
- [x] Empty remote creates an empty linked workspace
- [x] Import command and `sync://import` event are registered
- [x] Selector menu splits Open folder / Bring in from Git link
- [x] Dialog is accessible, focused, parent-picker + derived preview
- [x] Host-filtered profiles; public/local work with no profile; missing
      selection is not replaced; a profile from another host is refused
- [x] Validation, phase copy, duplicate-submit prevention
- [x] A fast local import cannot finish before the dialog is listening
- [x] Success opens the workspace window exactly once (native `open_workspace_window`
      on ok; the dialog only closes and does not open a second window)
- [x] Failure keeps the dialog and names a recovery action
- [ ] Live GitHub / GitLab proof (still 6c leftover; not claimed here)

## Known limitations

- Default branch only — no branch chooser.
- New child folder only — will not import into an existing/non-empty folder.
- Cancellation is out of scope; closing the dialog does not stop native work.
- A crash mid-import may leave an orphan child folder. No vault marker is
  added (zero-files-in-vault stands).
- Opening the imported workspace may fire one extra no-op check via the
  existing attach path; it cannot interleave with the import trip.
- Live host proof (GitHub / GitLab) is still required, shared with 6c/6d.

## Status

🟨 Implemented in app code. Remaining: live host proof (GitHub / GitLab),
same leftover as stories 6c and 6d.
