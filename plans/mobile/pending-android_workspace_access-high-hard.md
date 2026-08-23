# Story: A Workspace Can Be Opened on Android

**Status:** ⬜ pending · **Urgency:** high · **Difficulty:** hard

> Observed on a device, 2026-08-23: the app builds, installs and launches on
> Android, and then no workspace can be opened — with or without git. Everything
> else in the mobile epic is downstream of this.

## Why it fails

Not a bug. Two assumptions meet and neither holds on Android.

**There is no directory picker.** `workspaceAdapter.pickWorkspaceDirectory`
asks `tauri-plugin-dialog` for `open({ directory: true })`. Android has no
equivalent: the Storage Access Framework returns a `content://` URI naming a
document tree, not a path, and the permission attached to it is a grant the app
must hold rather than something a path implies.

**The native layer requires a filesystem path.** `resolve_workspace_root`
(`commands/workspace.rs:442`) refuses anything that is not absolute and does
not `canonicalize()` to a directory. Every command downstream of it —
`markdown.rs`, `backup.rs`, the whole sync layer, the watcher, the search
indexer — takes a `Path` and opens it directly.

So this is not "wire up a picker". It is a question about where a vault is
allowed to live on a phone.

## The decision to make

Three ways out, and they are product decisions before they are technical ones.
Nobody has chosen; the trade-offs are written down here so the choice is made
once, deliberately.

**A. An app-owned vault directory.** The app creates and owns the vault under
its own app-specific storage. No picker, no permission prompt, works with the
code exactly as it stands.

- *For:* shippable now; nothing in the native layer changes; the same path
  resolution the desktop uses keeps working.
- *Against:* the user cannot browse to their notes with another app, and on
  most devices the folder is deleted when the app is uninstalled — a notes app
  that loses the notes on uninstall is a hard thing to defend, so this option
  needs an export or a sync remote to be honest.

**B. Storage Access Framework, properly.** Real user-chosen folders.

- *For:* the only option where "your files are yours, in a folder you picked"
  stays literally true on Android, which is a claim `app-vision.md` makes.
- *Against:* every native command has to speak `content://` instead of `Path`.
  That is `workspace.rs`, `markdown.rs`, `backup.rs`, `watcher/`, the search
  indexer and the sync layer — and gix needs a real filesystem for the hidden
  repo regardless, so the hidden repo would stay in app-data while the vault
  did not. Large, and it splits the storage model in two.

**C. Clone-first onboarding.** The vault arrives by cloning a git remote into a
path the app chooses.

- *For:* **the problem does not arise.** Nothing is picked, so nothing needs a
  picker. On a phone, "sign in and get your notes" is a better first run than
  "find a folder" whatever the platform allows. It also makes the mobile build
  useful the day it works, without waiting on B.
- *Against:* it is not a general answer — it serves people who already sync
  with git and nobody else — and it depends on
  `mobile/pending-mobile_git_access-high-hard.md`, which has its own unmade
  decision about where a token lives.

These are not exclusive. C plus A is a coherent first release: notes arrive by
clone or start in an app-owned folder, and B is the answer to "let me point at
the folder I already have" whenever it is worth its cost.

## Acceptance (to be settled when the option is chosen)

- [ ] A workspace can be opened on an Android device, and the choice of how is
      recorded here with its reasoning
- [ ] Whatever is chosen, the failure mode of the *other* paths is honest — a
      user who taps something that cannot work on this platform is told why,
      not left with a dialog that never opens
- [ ] If the vault can be lost on uninstall, the app says so before it is the
      only copy
- [ ] The hidden repo, the search index and the backups keep working, all three
      of which resolve through `app_data_dir()` and are unaffected by where the
      vault itself lives

## Notes

- `capabilities/mobile.json` already grants `fs:default` plus read/write text
  file permissions, so the Tauri-side permission surface exists whichever way
  this goes.
- Nobody has yet observed whether `notify` (the watcher) or `rusqlite` (the
  search index) work on a device. Both take real paths, so option B would
  affect them and option A would not.
