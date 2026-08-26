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
(`commands/workspace_paths.rs:65`) refuses anything that is not absolute and
does not `canonicalize()` to a directory. Every command downstream of it —
`markdown.rs`, `backup.rs`, the whole sync layer, the watcher, the search
indexer — takes a `Path` and opens it directly.

So this is not "wire up a picker". It is a question about where a vault is
allowed to live on a phone.

## Decision (approved 2026-08-25)

Android v1 uses **managed vaults plus clone-first onboarding**. The app creates
or clones each vault under a dedicated real-filesystem directory such as
`<app-data>/vaults/<validated-child>`. Mobile offers **Create vault** and
**Clone from Git**; it does not invoke the unsupported folder picker. Desktop
keeps its current Open Folder and user-selected Git import parent flows.

This is the smallest model compatible with the existing native layer and gix:
workspace commands, asset scope, backups, search, watching and sync can keep
using canonical `Path`s. Native code owns managed-root resolution and child
validation; the renderer is never trusted to construct an arbitrary app-data
path.

A managed vault is removed when Android uninstalls the app. Creation therefore
shows a one-time, non-blocking storage notice that states the uninstall risk and
points to Git or a future explicit export/backup path. The same explanation
remains available in workspace/storage information, but the app does not show a
persistent warning or infer whether external tooling has protected the vault.
Android scoped storage also means OneDrive, Syncthing and similar apps generally
cannot watch the private managed directory directly; passive external sync is a
reason for the deferred SAF/shared-folder work, not a state Android v1 can
truthfully detect.

Direct Storage Access Framework support is deferred. Turning a `content://`
tree URI into a guessed `/storage/...` path is not acceptable: it breaks scoped
storage and non-local document providers. The follow-up is tracked in
`pending-android_saf_linked_folders-low-hard.md` and starts with research into a
persisted SAF tree plus managed local mirror/reconciliation or explicit
import/export, rather than assuming every Rust and gix operation can use a URI.

## Implementation order

1. Add a native managed-vault root with create/list/resolve operations and strict
   containment under app data.
2. Report workspace-access capabilities to the renderer. Android shows Create
   and Clone while Open Folder fails explicitly as unavailable; desktop remains
   unchanged.
3. Prove local CRUD, reopen, live-preview assets, backups, SQLite search and the
   watcher on a real device. Watcher failure must not prevent opening; use
   explicit refresh plus foreground reconciliation if Android watching is not
   reliable.
4. Adapt the existing Git import worker so native code chooses the managed
   parent on Android, then prove a public clone before adding mobile secrets.
5. Implement the shared Android Keystore-backed secret store and private clone
   in `pending-mobile_git_access-high-hard.md`.

## Acceptance

- [ ] A managed vault can be created, opened, closed and reopened on an Android
      device without invoking a folder picker
- [ ] Managed vault paths are created and resolved natively, stay beneath the
      dedicated managed root, and pass the existing canonical-path checks
- [ ] Android offers Create vault and Clone from Git; Open Folder is absent or
      returns a typed, user-visible unavailable result instead of doing nothing
- [ ] Desktop workspace opening and user-selected Git import destinations are
      unchanged
- [ ] Managed-vault creation shows a one-time, non-blocking notice that Android
      removes the directory on uninstall; the app does not claim to know whether
      Git or an external tool has protected it
- [ ] The storage/uninstall explanation remains available later from workspace
      or storage information without becoming a persistent warning
- [ ] CRUD, reopen, live-preview assets, backups and the SQLite search index are
      exercised successfully on a real device
- [ ] The watcher is exercised on-device; if unreliable, opening still succeeds
      and explicit/foreground reconciliation keeps the workspace current
- [ ] A public repository is cloned into the managed root through the reused
      import worker; private clone remains owned by the Git-access story

## Notes

- `capabilities/mobile.json` already grants `fs:default` plus read/write text
  file permissions, so the Tauri-side permission surface exists whichever way
  this goes.
- Nobody has yet observed whether `notify` (the watcher) or `rusqlite` (the
  search index) work on a device. Managed vaults give both real paths; the
  deferred SAF design must address them separately.
