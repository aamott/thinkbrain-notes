# Story: Android SAF Linked Folders

**Status:** ⬜ pending · **Urgency:** low · **Difficulty:** hard

## Goal

Let Android users work with a durable, user-selected folder through the Storage
Access Framework (SAF), so notes can remain outside app-private storage and be
visible to compatible sync and file-management tools. Research the storage
model when this story is scheduled; do not assume today's Tauri limitations or
choose an architecture from stale information.

## Why this is deferred

Android v1 uses managed real-filesystem vaults so the existing Rust workspace,
asset, search, backup, watcher and gix code can operate unchanged. SAF returns a
persisted `content://` tree grant rather than a filesystem path, and converting
that URI to a guessed `/storage/...` path is not a supported solution. Git still
requires a real local worktree even if note files are exposed through SAF.

## Research gate

Before production implementation:

- Re-check current Tauri dialog/fs/path support and Android platform guidance.
- Prototype `ACTION_OPEN_DOCUMENT_TREE`, persisted read/write grants, recursive
  listing, create, atomic replacement, rename, move and delete through a small
  Android plugin.
- Test local storage and at least one cloud document provider, permission
  revocation, reboot persistence, large files and provider-specific failures.
- Compare a managed local mirror with foreground reconciliation against a full
  workspace-storage abstraction. Include Git worktree placement, live-preview
  assets, search indexing, backups, external-change detection and conflicts.
- Record the chosen source-of-truth and recovery semantics before implementation.

## Acceptance

- [ ] The research gate is completed against then-current dependencies and real
      Android devices/providers
- [ ] The selected design preserves user-owned standard Markdown files without
      pretending a SAF URI is a native path
- [ ] Persisted grants, revoked access, external edits and reconciliation
      conflicts have explicit UX and typed failure behavior
- [ ] Git, search, backups, attachments and change detection have documented,
      tested locations and lifecycle semantics
- [ ] The mobile epic and workspace-access documentation are updated with the
      final decision before implementation begins

## References

- `pending-android_workspace_access-high-hard.md` — managed-vault Android v1 decision
- `pending-mobile_git_access-high-hard.md` — Git worktree and credential constraints
- Android Storage Access Framework: `ACTION_OPEN_DOCUMENT_TREE` and persisted URI grants
