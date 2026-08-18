//! Recording vault changes as commits in the hidden repository.
//!
//! Deliberately index-free. Git keeps an index so that a person can stage part
//! of their work before committing it; nobody stages anything here, and no `git`
//! command is ever pointed at this repository, so the index would be a file we
//! maintain for an audience that does not exist. Instead each change goes
//! straight to objects: blob, then tree editor over the previous commit's tree,
//! then commit.
//!
//! The consequence that matters is cost. Recording a change touches only the
//! paths that changed and the trees above them, so a one-note edit in a
//! ten-thousand-note vault stays a one-note edit.

use std::path::{Component, Path, PathBuf};

use crate::NativeError;

/// Who the hidden repository records commits as.
///
/// Not the user, and deliberately not read from their git configuration: this
/// history belongs to the app, most people syncing notes have no `user.email`
/// set at all, and a commit that fails because of that would be a sync failure
/// with a baffling explanation.
const AUTHOR_NAME: &str = "ThinkBrain Notes";
const AUTHOR_EMAIL: &str = "sync@thinkbrain.notes";

/// The branch the hidden repository records vault history on.
const HISTORY_REF: &str = "refs/heads/main";

/// Where checkpoints live.
///
/// Deliberately not a branch. Checkpoints hold the conflict copies a sync
/// daemon left lying in the vault, and those must never reach the user's
/// remote — a ref outside `refs/heads/` cannot be swept up by the ordinary
/// "push my branches" refspec.
const CHECKPOINT_REF: &str = "refs/thinkbrain/checkpoints";

/// Why a restore point was taken.
///
/// A fixed set rather than a caller-supplied string, because the local
/// conflict-rate counter reads these back: it has to tell "the user had to
/// decide between two versions" from "the user put an older version back",
/// and free text would make that a guess.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    ConflictResolved,
    VersionRestored,
    /// A copy that carried nothing to decide, settled without asking.
    DuplicateDiscarded,
}

impl Reason {
    /// What this checkpoint says it is, in the history that holds it.
    pub const fn message(self) -> &'static str {
        match self {
            Reason::ConflictResolved => "Checkpoint before resolving a conflict",
            Reason::VersionRestored => "Checkpoint before restoring an earlier version",
            Reason::DuplicateDiscarded => "Checkpoint before discarding a duplicate copy",
        }
    }
}

fn failed(code: &'static str, message: &'static str, error: impl std::fmt::Display) -> NativeError {
    NativeError::with_details(code, message, error.to_string())
}

/// Records the current on-disk state of `paths` as a new commit.
///
/// `paths` are vault-relative. A path that exists on disk is stored; one that
/// does not is removed from the tree, which is how a deleted note is recorded.
/// Paths outside the vault are refused rather than silently skipped.
///
/// Returns `None` when the resulting tree is identical to the last commit's —
/// a save that changed nothing, or a change already recorded, should not leave
/// an empty commit behind for the user to scroll past in their history.
pub fn record(
    repo: &gix::Repository,
    paths: &[PathBuf],
    message: &str,
) -> Result<Option<gix::ObjectId>, NativeError> {
    let parent = head_of(repo, HISTORY_REF)?;
    let base_tree = tree_of(repo, parent)?;
    let tree = build_tree(repo, base_tree, paths)?;

    if tree == base_tree {
        return Ok(None);
    }

    commit_on(repo, HISTORY_REF, message, tree, parent).map(Some)
}

/// Records the current state of `paths` as a restore point, and returns
/// something restorable either way.
///
/// This is the undo in "every resolution is undoable": the merge engine takes a
/// checkpoint of both sides before it writes either, so a wrong click is a
/// restore rather than a loss. Unlike [`record`], it never answers "nothing
/// changed, so nothing to name" — the caller is about to overwrite a file and
/// needs an id. When nothing changed, the previous checkpoint already points at
/// this exact content, so that is the honest answer.
pub fn checkpoint(
    repo: &gix::Repository,
    paths: &[PathBuf],
    reason: Reason,
) -> Result<gix::ObjectId, NativeError> {
    let parent = head_of(repo, CHECKPOINT_REF)?;
    let base_tree = tree_of(repo, parent)?;
    let tree = build_tree(repo, base_tree, paths)?;

    if tree == base_tree {
        if let Some(existing) = parent {
            return Ok(existing);
        }
        // No checkpoint yet and nothing to store — the files named have never
        // existed. That is still a state worth being able to restore to, so it
        // gets a commit of its own rather than an error.
    }

    commit_on(repo, CHECKPOINT_REF, reason.message(), tree, parent)
}

/// Writes blobs for the paths that exist and drops the ones that do not,
/// returning the resulting tree.
fn build_tree(
    repo: &gix::Repository,
    base_tree: gix::ObjectId,
    paths: &[PathBuf],
) -> Result<gix::ObjectId, NativeError> {
    let vault = repo
        .workdir()
        .ok_or_else(|| {
            NativeError::new("sync.no_worktree", "This sync history has no notes folder.")
        })?
        .to_path_buf();

    let mut editor = repo.edit_tree(base_tree).map_err(|error| {
        failed(
            "sync.tree_read_failed",
            "Could not read the last recorded state.",
            error,
        )
    })?;

    for path in paths {
        let relative = vault_relative(&vault, path)?;
        let absolute = vault.join(&relative);

        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) if metadata.is_file() => {
                let file = match std::fs::File::open(&absolute) {
                    Ok(f) => f,
                    Err(open_error) => {
                        let still_file = match std::fs::symlink_metadata(&absolute) {
                            Ok(metadata) => metadata.is_file(),
                            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
                            Err(error) => {
                                return Err(failed(
                                    "sync.note_read_failed",
                                    "Could not read a note to record it.",
                                    error,
                                ));
                            }
                        };
                        if still_file {
                            return Err(failed(
                                "sync.note_read_failed",
                                "Could not read a note to record it.",
                                open_error,
                            ));
                        }
                        editor.remove(tree_path(&relative)).map_err(|error| {
                            failed(
                                "sync.tree_write_failed",
                                "Could not record a deleted note.",
                                error,
                            )
                        })?;
                        continue;
                    }
                };
                let blob = repo.write_blob_stream(file).map_err(|error| {
                    failed(
                        "sync.note_store_failed",
                        "Could not store a note's contents.",
                        error,
                    )
                })?;
                let kind = if is_executable(&metadata) {
                    gix::object::tree::EntryKind::BlobExecutable
                } else {
                    gix::object::tree::EntryKind::Blob
                };
                editor
                    .upsert(tree_path(&relative), kind, blob.detach())
                    .map_err(|error| {
                        failed("sync.tree_write_failed", "Could not record a note.", error)
                    })?;
            }
            // A folder, or a symlink standing where a note used to be. Its name
            // in the tree stands for everything underneath it, so removing it
            // would take the whole folder's history with it — and the watcher
            // reports folders. Whatever is inside arrives as its own change.
            Ok(_) => continue,
            // Genuinely gone, which is a deletion to record. The alternative is
            // a history that quietly keeps files the vault no longer has.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // `remove` on a path that was never recorded is not an error: a
                // note created and deleted between two commits is simply absent
                // from both.
                editor.remove(tree_path(&relative)).map_err(|error| {
                    failed(
                        "sync.tree_write_failed",
                        "Could not record a deleted note.",
                        error,
                    )
                })?;
            }
            // Something else is wrong — a drive that went away, a folder we may
            // not read. Recording that as a deletion would throw notes out of
            // history over a problem that is very likely temporary.
            Err(error) => {
                return Err(failed(
                    "sync.note_read_failed",
                    "Could not read a note to record it.",
                    error,
                ));
            }
        }
    }

    Ok(editor
        .write()
        .map_err(|error| {
            failed(
                "sync.tree_write_failed",
                "Could not record the new state.",
                error,
            )
        })?
        .detach())
}

/// Commits `tree` onto `reference`, authored by the app.
fn commit_on(
    repo: &gix::Repository,
    reference: &str,
    message: &str,
    tree: gix::ObjectId,
    parent: Option<gix::ObjectId>,
) -> Result<gix::ObjectId, NativeError> {
    let signature = gix::actor::Signature {
        name: AUTHOR_NAME.into(),
        email: AUTHOR_EMAIL.into(),
        time: gix::date::Time::now_local_or_utc(),
    };

    let commit = repo
        .commit_as(
            signature.to_ref(&mut gix::date::parse::TimeBuf::default()),
            signature.to_ref(&mut gix::date::parse::TimeBuf::default()),
            reference,
            message,
            tree,
            parent,
        )
        .map_err(|error| failed("sync.commit_failed", "Could not record this change.", error))?;

    Ok(commit.detach())
}

fn tree_of(
    repo: &gix::Repository,
    commit: Option<gix::ObjectId>,
) -> Result<gix::ObjectId, NativeError> {
    match commit {
        Some(id) => commit_tree(repo, id),
        None => Ok(gix::ObjectId::empty_tree(repo.object_hash())),
    }
}

/// The latest commit on the vault's history branch, if there is one.
pub fn head_commit(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    head_of(repo, HISTORY_REF)
}

/// The newest restore point, or `None` if nothing has ever been checkpointed.
pub fn checkpoint_head(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    head_of(repo, CHECKPOINT_REF)
}

fn head_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    match repo.find_reference(reference) {
        Ok(mut reference) => {
            let id = reference.peel_to_id().map_err(|error| {
                failed(
                    "sync.history_read_failed",
                    "Could not read the sync history.",
                    error,
                )
            })?;
            Ok(Some(id.detach()))
        }
        Err(gix::reference::find::existing::Error::NotFound { .. }) => Ok(None),
        Err(error) => Err(failed(
            "sync.history_read_failed",
            "Could not read the sync history.",
            error,
        )),
    }
}

fn commit_tree(
    repo: &gix::Repository,
    commit: gix::ObjectId,
) -> Result<gix::ObjectId, NativeError> {
    let tree = repo
        .find_commit(commit)
        .map_err(|error| {
            failed(
                "sync.history_read_failed",
                "Could not read the sync history.",
                error,
            )
        })?
        .tree_id()
        .map_err(|error| {
            failed(
                "sync.history_read_failed",
                "Could not read the sync history.",
                error,
            )
        })?;
    Ok(tree.detach())
}

/// Narrows a caller-supplied path to a vault-relative one, refusing anything
/// that points outside the vault.
///
/// The paths reaching here come from the watcher and from resolution code, not
/// from the user, but a `..` that escaped the vault would write the user's
/// unrelated files into sync history — worth a check even when the caller is
/// trusted.
pub(super) fn vault_relative(vault: &Path, path: &Path) -> Result<PathBuf, NativeError> {
    let relative = if path.is_absolute() {
        path.strip_prefix(vault).map_err(|_| {
            NativeError::new(
                "sync.path_outside_vault",
                "That file is outside this workspace's notes.",
            )
        })?
    } else {
        path
    };

    // Only a plain sequence of names, rather than "no `..`" — that let through
    // `./note.md`, and on Windows a drive-relative `C:note.md`, which joins
    // against whatever directory that drive happens to be sitting in.
    if !relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err(NativeError::new(
            "sync.path_outside_vault",
            "That file is outside this workspace's notes.",
        ));
    }

    Ok(relative.to_path_buf())
}

/// Renders a relative path the way the tree editor nests by, so
/// `journal/2026/note.md` becomes three levels of tree rather than one entry
/// with slashes in its name.
///
/// Always `/`, never the platform separator: a vault edited on Windows and
/// synced to a Mac has to produce the same tree on both, and git itself has
/// only ever used `/` inside a tree.
fn tree_path(relative: &Path) -> String {
    relative
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(unix)]
fn is_executable(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_metadata: &std::fs::Metadata) -> bool {
    false
}

#[cfg(test)]
#[path = "snapshot_tests.rs"]
mod tests;
