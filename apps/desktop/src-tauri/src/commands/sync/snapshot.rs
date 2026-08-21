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

use super::failed;
#[path = "snapshot_record.rs"]
mod record;

/// Who the hidden repository records commits as.
///
/// Not the user, and deliberately not read from their git configuration: this
/// history belongs to the app, most people syncing notes have no `user.email`
/// set at all, and a commit that fails because of that would be a sync failure
/// with a baffling explanation.
const AUTHOR_NAME: &str = "ThinkBrain Notes";
const AUTHOR_EMAIL: &str = "sync@thinkbrain.notes";

/// The branch the hidden repository records vault history on.
pub const HISTORY_REF: &str = "refs/heads/main";

/// Where checkpoints live.
///
/// Deliberately not a branch. Checkpoints hold the conflict copies a sync
/// daemon left lying in the vault, and those must never reach the user's
/// remote — a ref outside `refs/heads/` cannot be swept up by the ordinary
/// "push my branches" refspec.
pub const CHECKPOINT_REF: &str = "refs/thinkbrain/checkpoints";

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

fn history_read_failed(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.history_read_failed",
        "Could not read the sync history.",
        error,
    )
}

/// What recording one batch actually put in history.
pub struct Landed {
    pub commit: Option<gix::ObjectId>,
    /// Notes this batch could not record. The rest of the vault still landed.
    pub skipped: Vec<(PathBuf, NativeError)>,
}

/// Records the current on-disk state of `paths` as a new commit.
///
/// `paths` are vault-relative. A path that exists on disk is stored; one that
/// does not is removed from the tree, which is how a deleted note is recorded.
/// A path that cannot be read is skipped rather than aborting the batch: one
/// bad note must not stall the vault.
///
/// Returns `None` when the resulting tree is identical to the last commit's —
/// a save that changed nothing, or a change already recorded, should not leave
/// an empty commit behind for the user to scroll past in their history.
pub fn record(
    repo: &gix::Repository,
    paths: &[PathBuf],
    message: &str,
) -> Result<Option<gix::ObjectId>, NativeError> {
    Ok(landed(repo, paths, message)?.commit)
}

/// [`record`], and the notes that could not be included.
pub fn landed(
    repo: &gix::Repository,
    paths: &[PathBuf],
    message: &str,
) -> Result<Landed, NativeError> {
    let parent = head_of(repo, HISTORY_REF)?;
    let base_tree = tree_of(repo, parent)?;
    let (tree, skipped) = build_tree(repo, base_tree, paths)?;

    if tree == base_tree {
        return Ok(Landed {
            commit: None,
            skipped,
        });
    }

    Ok(Landed {
        commit: Some(commit_on(repo, HISTORY_REF, message, tree, parent)?),
        skipped,
    })
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
    let (tree, _) = build_tree(repo, base_tree, paths)?;

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

fn unreadable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.note_read_failed",
        "Could not read a note to record it.",
        error,
    )
}

/// Writes blobs for the paths that exist and drops the ones that do not,
/// returning the resulting tree and any notes that could not be included.
fn build_tree(
    repo: &gix::Repository,
    base_tree: gix::ObjectId,
    paths: &[PathBuf],
) -> Result<(gix::ObjectId, Vec<(PathBuf, NativeError)>), NativeError> {
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

    let mut skipped = Vec::new();
    let mut remaining: Vec<PathBuf> = paths.to_vec();
    while let Some(path) = remaining.pop() {
        let relative = match vault_relative(&vault, &path) {
            Ok(relative) => relative,
            Err(error) => {
                skipped.push((path, error));
                continue;
            }
        };
        let absolute = vault.join(&relative);

        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) if metadata.is_dir() => {
                // A folder's name stands for everything underneath it. Expanding
                // it here is how a rename or a rescan that only named the folder
                // still records the notes that moved, rather than leaving the
                // old folder in history.
                match super::bootstrap::recordable_under(&vault, &absolute) {
                    Ok(notes) => remaining.extend(notes),
                    Err(error) => skipped.push((path, error)),
                }
            }
            Ok(metadata) if metadata.is_file() => {
                match record::record_file(repo, &mut editor, &vault, &relative, &path) {
                    Ok(()) => {}
                    Err(record::RecordFileError::Skipped((path, error))) => {
                        skipped.push((path, error));
                    }
                    Err(record::RecordFileError::Fatal(error)) => return Err(error),
                }
            }
            // A symlink standing where a note used to be is not a note.
            // Following it is how history ends up holding files from outside
            // the vault.
            Ok(_) => continue,
            // Genuinely gone, which is a deletion to record. The alternative is
            // a history that quietly keeps files the vault no longer has.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                // `remove` on a path that was never recorded is not an error: a
                // note created and deleted between two commits is simply absent
                // from both. A vanished folder takes every recorded note under
                // it — `remove("notes")` would drop the whole subtree, which is
                // the point.
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
            Err(error) => skipped.push((path, unreadable(error))),
        }
    }

    Ok((
        editor
            .write()
            .map_err(|error| {
                failed(
                    "sync.tree_write_failed",
                    "Could not record the new state.",
                    error,
                )
            })?
            .detach(),
        skipped,
    ))
}

/// Records a merge on the history branch: one tree, two parents.
///
/// Everything else here writes a single line of history, because everything
/// else is one device typing. A sync is the only thing that joins two.
pub fn record_merge(
    repo: &gix::Repository,
    tree: gix::ObjectId,
    ours: gix::ObjectId,
    theirs: gix::ObjectId,
    message: &str,
) -> Result<gix::ObjectId, NativeError> {
    commit_on(repo, HISTORY_REF, message, tree, [ours, theirs])
}

/// Commits `tree` onto `reference`, authored by the app.
fn commit_on(
    repo: &gix::Repository,
    reference: &str,
    message: &str,
    tree: gix::ObjectId,
    parents: impl IntoIterator<Item = gix::ObjectId>,
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
            parents,
        )
        .map_err(|error| failed("sync.commit_failed", "Could not record this change.", error))?;

    Ok(commit.detach())
}

/// The tree a commit recorded, or the empty tree when there is no commit.
pub fn tree_of(
    repo: &gix::Repository,
    commit: Option<gix::ObjectId>,
) -> Result<gix::ObjectId, NativeError> {
    match commit {
        Some(id) => commit_tree(repo, id),
        None => Ok(gix::ObjectId::empty_tree(repo.object_hash())),
    }
}

/// What changed between two recorded states, exactly as git sees it.
///
/// One walk with three readers: history names the notes a change touched, a
/// push names the objects the far side is missing, and a sync writes the result
/// into someone's folder. Each wants a different slice of the same answer, and
/// working the answer out three times was three chances to work it out
/// differently.
///
/// Folders are included, and so is everything inside a folder that appeared —
/// the walk descends into an addition rather than naming it and stopping.
pub fn changes_between(
    repo: &gix::Repository,
    state: &mut gix::diff::tree::State,
    before: gix::ObjectId,
    after: gix::ObjectId,
) -> Result<Vec<gix::diff::tree::recorder::Change>, NativeError> {
    let before = tree_at(repo, before)?;
    let after = tree_at(repo, after)?;

    let mut recorder = gix::diff::tree::Recorder::default();
    gix::diff::tree(
        gix::objs::TreeRefIter::from_bytes(&before.data, before.id.kind()),
        gix::objs::TreeRefIter::from_bytes(&after.data, after.id.kind()),
        state,
        &repo.objects,
        &mut recorder,
    )
    .map_err(|error| {
        failed(
            "sync.history_read_failed",
            "Could not read what a change touched.",
            error,
        )
    })?;

    Ok(recorder.records)
}

/// The empty tree is answered without a lookup: nothing ever writes it, so a
/// repository that has never recorded anything does not contain it.
fn tree_at(repo: &gix::Repository, tree: gix::ObjectId) -> Result<gix::Tree<'_>, NativeError> {
    if tree == gix::ObjectId::empty_tree(repo.object_hash()) {
        return Ok(repo.empty_tree());
    }
    repo.find_tree(tree).map_err(|error| {
        failed(
            "sync.history_read_failed",
            "Could not read a recorded state.",
            error,
        )
    })
}

/// The latest commit on the vault's history branch, if there is one.
pub fn head_commit(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    head_of(repo, HISTORY_REF)
}

/// Every blob the current history commit holds, so a rescan can name the
/// notes that vanished as well as the ones still on disk.
pub(super) fn recorded_blob_paths(repo: &gix::Repository) -> Result<Vec<PathBuf>, NativeError> {
    let Some(commit) = head_commit(repo)? else {
        return Ok(Vec::new());
    };
    let tree = repo
        .find_commit(commit)
        .map_err(history_read_failed)?
        .tree()
        .map_err(history_read_failed)?;
    let mut recorder = gix::traverse::tree::Recorder::default();
    tree.traverse()
        .breadthfirst(&mut recorder)
        .map_err(history_read_failed)?;
    Ok(recorder
        .records
        .into_iter()
        .filter(|entry| entry.mode.is_blob())
        .map(|entry| PathBuf::from(entry.filepath.to_string()))
        .collect())
}

/// The newest restore point, or `None` if nothing has ever been checkpointed.
pub fn checkpoint_head(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    head_of(repo, CHECKPOINT_REF)
}

fn head_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    try_head_of(repo, reference).map_err(history_read_failed)
}

pub(super) fn try_head_of(
    repo: &gix::Repository,
    reference: &str,
) -> Result<Option<gix::ObjectId>, String> {
    repo.try_find_reference(reference)
        .map_err(|error| error.to_string())?
        .map(|mut found| {
            found
                .peel_to_id()
                .map(gix::Id::detach)
                .map_err(|error| error.to_string())
        })
        .transpose()
}

fn commit_tree(
    repo: &gix::Repository,
    commit: gix::ObjectId,
) -> Result<gix::ObjectId, NativeError> {
    let tree = repo
        .find_commit(commit)
        .map_err(history_read_failed)?
        .tree_id()
        .map_err(history_read_failed)?;
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
    super::conflict::relative_str(relative)
}

/// Opens `path` without following a final-component symlink.
///
/// `File::open` follows, so a file swapped for a symlink after
/// `symlink_metadata` would leak the target into history.
fn open_without_following(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // FILE_FLAG_OPEN_REPARSE_POINT: open the link itself.
        options.custom_flags(0x0020_0000);
    }
    options.open(path)
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
