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

use std::path::{Path, PathBuf};

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
pub fn checkpoint(repo: &gix::Repository, paths: &[PathBuf]) -> Result<gix::ObjectId, NativeError> {
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

    commit_on(repo, CHECKPOINT_REF, "Checkpoint before resolving a conflict", tree, parent)
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
        .ok_or_else(|| NativeError::new("sync.no_worktree", "This sync history has no notes folder."))?
        .to_path_buf();

    let mut editor = repo
        .edit_tree(base_tree)
        .map_err(|error| failed("sync.tree_read_failed", "Could not read the last recorded state.", error))?;

    for path in paths {
        let relative = vault_relative(&vault, path)?;
        let absolute = vault.join(&relative);

        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) if metadata.is_file() => {
                let file = match std::fs::File::open(&absolute) {
                    Ok(f) => f,
                    // Gone between the two calls — a sync daemon deleting the
                    // note mid-batch, which is the very thing this feature
                    // exists for. It is a deletion to record, not a reason to
                    // abandon every other note that settled with it.
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        editor
                            .remove(tree_path(&relative))
                            .map_err(|error| failed("sync.tree_write_failed", "Could not record a deleted note.", error))?;
                        continue;
                    }
                    Err(error) => {
                        return Err(failed("sync.note_read_failed", "Could not read a note to record it.", error));
                    }
                };
                let blob = repo
                    .write_blob_stream(file)
                    .map_err(|error| failed("sync.note_store_failed", "Could not store a note's contents.", error))?;
                let kind = if is_executable(&metadata) {
                    gix::object::tree::EntryKind::BlobExecutable
                } else {
                    gix::object::tree::EntryKind::Blob
                };
                editor
                    .upsert(tree_path(&relative), kind, blob.detach())
                    .map_err(|error| failed("sync.tree_write_failed", "Could not record a note.", error))?;
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
                editor
                    .remove(tree_path(&relative))
                    .map_err(|error| failed("sync.tree_write_failed", "Could not record a deleted note.", error))?;
            }
            // Something else is wrong — a drive that went away, a folder we may
            // not read. Recording that as a deletion would throw notes out of
            // history over a problem that is very likely temporary.
            Err(error) => {
                return Err(failed("sync.note_read_failed", "Could not read a note to record it.", error));
            }
        }
    }

    Ok(editor
        .write()
        .map_err(|error| failed("sync.tree_write_failed", "Could not record the new state.", error))?
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

fn tree_of(repo: &gix::Repository, commit: Option<gix::ObjectId>) -> Result<gix::ObjectId, NativeError> {
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
#[cfg(test)]
pub fn checkpoint_head(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    head_of(repo, CHECKPOINT_REF)
}

fn head_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    match repo.find_reference(reference) {
        Ok(mut reference) => {
            let id = reference
                .peel_to_id()
                .map_err(|error| failed("sync.history_read_failed", "Could not read the sync history.", error))?;
            Ok(Some(id.detach()))
        }
        Err(gix::reference::find::existing::Error::NotFound { .. }) => Ok(None),
        Err(error) => Err(failed("sync.history_read_failed", "Could not read the sync history.", error)),
    }
}

fn commit_tree(repo: &gix::Repository, commit: gix::ObjectId) -> Result<gix::ObjectId, NativeError> {
    let tree = repo
        .find_commit(commit)
        .map_err(|error| failed("sync.history_read_failed", "Could not read the sync history.", error))?
        .tree_id()
        .map_err(|error| failed("sync.history_read_failed", "Could not read the sync history.", error))?;
    Ok(tree.detach())
}

/// Narrows a caller-supplied path to a vault-relative one, refusing anything
/// that points outside the vault.
///
/// The paths reaching here come from the watcher and from resolution code, not
/// from the user, but a `..` that escaped the vault would write the user's
/// unrelated files into sync history — worth a check even when the caller is
/// trusted.
fn vault_relative(vault: &Path, path: &Path) -> Result<PathBuf, NativeError> {
    let relative = if path.is_absolute() {
        path.strip_prefix(vault).map_err(|_| {
            NativeError::new("sync.path_outside_vault", "That file is outside this workspace's notes.")
        })?
    } else {
        path
    };

    // Only a plain sequence of names, rather than "no `..`" — that let through
    // `./note.md`, and on Windows a drive-relative `C:note.md`, which joins
    // against whatever directory that drive happens to be sitting in.
    if !relative.components().all(|component| matches!(component, std::path::Component::Normal(_))) {
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
mod tests {
    use super::super::hidden_repo;
    use super::*;
    use crate::tests::make_temp_test_dir;
    use std::fs;

    struct Fixture {
        vault: PathBuf,
        repo: gix::Repository,
    }

    fn fixture(name: &str) -> Fixture {
        let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
        let git_dir = make_temp_test_dir(&format!("{name}-gitdir"), "sync", true);
        let repo = hidden_repo::open_or_create(&git_dir, &vault).expect("the hidden repository opens");
        Fixture { vault, repo }
    }

    fn write(vault: &Path, relative: &str, contents: &str) {
        let path = vault.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("the note's folder exists");
        }
        fs::write(path, contents).expect("the note is written");
    }

    /// Every path in the recorded tree, so a test can say exactly what history
    /// holds without caring how the trees nest.
    fn recorded_paths(repo: &gix::Repository) -> Vec<String> {
        let Some(commit) = head_commit(repo).expect("the history is readable") else {
            return Vec::new();
        };
        let tree = repo.find_commit(commit).expect("the commit exists").tree().expect("the tree exists");
        let mut paths = Vec::new();
        let mut recorder = gix::traverse::tree::Recorder::default();
        tree.traverse().breadthfirst(&mut recorder).expect("the tree is walkable");
        for entry in recorder.records {
            if entry.mode.is_blob() {
                paths.push(entry.filepath.to_string());
            }
        }
        paths.sort();
        paths
    }

    /// Every blob path in a given commit's tree.
    fn tree_paths_of(repo: &gix::Repository, commit: gix::ObjectId) -> Vec<String> {
        let tree = repo
            .find_commit(commit)
            .expect("the commit exists")
            .tree()
            .expect("the tree exists");
        let mut recorder = gix::traverse::tree::Recorder::default();
        tree.traverse()
            .breadthfirst(&mut recorder)
            .expect("the tree is walkable");
        let mut paths: Vec<String> = recorder
            .records
            .iter()
            .filter(|entry| entry.mode.is_blob())
            .map(|entry| entry.filepath.to_string())
            .collect();
        paths.sort();
        paths
    }

    fn contents_of(repo: &gix::Repository, path: &str) -> String {
        let commit = head_commit(repo).expect("the history is readable").expect("there is a commit");
        let mut tree = repo.find_commit(commit).expect("the commit exists").tree().expect("the tree exists");
        let entry = tree
            .peel_to_entry_by_path(Path::new(path))
            .expect("the path is searchable")
            .expect("the path is recorded");
        let object = entry.object().expect("the blob is readable");
        String::from_utf8(object.data.clone()).expect("the note is text")
    }

    /// A checkpoint is the undo in "every resolution is undoable". The merge
    /// engine takes one of both sides before it writes either, so a wrong click
    /// is a restore rather than a loss.
    #[test]
    fn a_checkpoint_records_the_current_state_of_the_named_notes() {
        let f = fixture("checkpoint-records");
        write(&f.vault, "note.md", "# Mine\n");
        write(&f.vault, "note-DESKTOP-AB12CD.md", "# Theirs\n");

        let id = checkpoint(
            &f.repo,
            &[PathBuf::from("note.md"), PathBuf::from("note-DESKTOP-AB12CD.md")],
        )
        .expect("the checkpoint is taken");

        assert_eq!(
            tree_paths_of(&f.repo, id),
            ["note-DESKTOP-AB12CD.md", "note.md"]
        );
    }

    /// Checkpoints hold the conflict copies a sync daemon left behind. Those
    /// must never reach the user's remote, so they live on a ref of their own
    /// rather than on the branch that gets pushed.
    #[test]
    fn a_checkpoint_leaves_the_history_branch_alone() {
        let f = fixture("checkpoint-separate");
        write(&f.vault, "note.md", "# One\n");
        let history = record(&f.repo, &[PathBuf::from("note.md")], "first")
            .expect("recorded")
            .expect("committed");

        write(&f.vault, "note-DESKTOP-AB12CD.md", "# Theirs\n");
        checkpoint(&f.repo, &[PathBuf::from("note-DESKTOP-AB12CD.md")]).expect("checkpointed");

        assert_eq!(head_commit(&f.repo).expect("readable"), Some(history));
    }

    /// Not under `refs/heads/`, so the ordinary "push my branches" refspec
    /// story 6 will use cannot sweep it up by accident.
    #[test]
    fn the_checkpoint_ref_is_not_a_branch() {
        assert!(!CHECKPOINT_REF.starts_with("refs/heads/"));
    }

    /// Each checkpoint keeps the one before it, or the second resolution of an
    /// evening would throw away the restore point from the first.
    #[test]
    fn checkpoints_keep_the_ones_before_them() {
        let f = fixture("checkpoint-chain");
        write(&f.vault, "one.md", "# One\n");
        let first = checkpoint(&f.repo, &[PathBuf::from("one.md")]).expect("checkpointed");

        write(&f.vault, "two.md", "# Two\n");
        let second = checkpoint(&f.repo, &[PathBuf::from("two.md")]).expect("checkpointed");

        assert_ne!(first, second);
        let parents: Vec<_> = f
            .repo
            .find_commit(second)
            .expect("the commit exists")
            .parent_ids()
            .map(|id| id.detach())
            .collect();
        assert_eq!(parents, [first], "the earlier checkpoint was orphaned");
        assert_eq!(tree_paths_of(&f.repo, second), ["one.md", "two.md"]);
    }

    /// Unlike history, a checkpoint always hands back something restorable.
    /// The caller is about to overwrite a file and needs a restore point; "no
    /// commit, nothing changed" would leave it with nothing to name.
    #[test]
    fn a_checkpoint_with_nothing_new_reuses_the_last_one() {
        let f = fixture("checkpoint-unchanged");
        write(&f.vault, "one.md", "# One\n");
        let first = checkpoint(&f.repo, &[PathBuf::from("one.md")]).expect("checkpointed");

        let second = checkpoint(&f.repo, &[PathBuf::from("one.md")]).expect("checkpointed");

        assert_eq!(first, second);
    }

    /// Checkpointing files that are not there is not an error: the merge engine
    /// takes a checkpoint before writing, and "this side did not exist yet" is
    /// a state worth being able to restore to.
    #[test]
    fn a_first_checkpoint_of_absent_notes_still_yields_a_restore_point() {
        let f = fixture("checkpoint-absent");

        let id = checkpoint(&f.repo, &[PathBuf::from("missing.md")]).expect("checkpointed");

        assert!(tree_paths_of(&f.repo, id).is_empty());
    }

    #[test]
    fn a_first_commit_records_the_notes_it_was_given() {
        let f = fixture("record-first");
        write(&f.vault, "one.md", "# One\n");
        write(&f.vault, "two.md", "# Two\n");

        let commit = record(
            &f.repo,
            &[PathBuf::from("one.md"), PathBuf::from("two.md")],
            "Sync 2026-08-16 09:31 — 2 notes changed",
        )
        .expect("the change is recorded")
        .expect("a first commit is made");

        assert_eq!(recorded_paths(&f.repo), ["one.md", "two.md"]);
        assert_eq!(
            f.repo.find_commit(commit).expect("the commit exists").message_raw_sloppy().to_string(),
            "Sync 2026-08-16 09:31 — 2 notes changed"
        );
    }

    /// The property that makes this index-free design worth having: recording a
    /// change costs only the paths that changed. If a later commit had to be
    /// told about every note, a ten-thousand-note vault would rewrite itself on
    /// every keystroke's worth of idle.
    #[test]
    fn a_later_commit_keeps_notes_it_was_not_told_about() {
        let f = fixture("record-incremental");
        write(&f.vault, "one.md", "# One\n");
        record(&f.repo, &[PathBuf::from("one.md")], "first").expect("recorded").expect("committed");

        write(&f.vault, "two.md", "# Two\n");
        record(&f.repo, &[PathBuf::from("two.md")], "second").expect("recorded").expect("committed");

        assert_eq!(recorded_paths(&f.repo), ["one.md", "two.md"]);
        assert_eq!(contents_of(&f.repo, "one.md"), "# One\n");
    }

    #[test]
    fn notes_in_folders_are_recorded_as_folders() {
        let f = fixture("record-nested");
        write(&f.vault, "journal/2026/08-16.md", "# Today\n");

        record(&f.repo, &[PathBuf::from("journal/2026/08-16.md")], "nested")
            .expect("recorded")
            .expect("committed");

        assert_eq!(recorded_paths(&f.repo), ["journal/2026/08-16.md"]);
        assert_eq!(contents_of(&f.repo, "journal/2026/08-16.md"), "# Today\n");
    }

    #[test]
    fn a_deleted_note_leaves_the_history_going_forward() {
        let f = fixture("record-delete");
        write(&f.vault, "one.md", "# One\n");
        write(&f.vault, "two.md", "# Two\n");
        record(&f.repo, &[PathBuf::from("one.md"), PathBuf::from("two.md")], "first")
            .expect("recorded")
            .expect("committed");

        fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
        record(&f.repo, &[PathBuf::from("one.md")], "second").expect("recorded").expect("committed");

        assert_eq!(recorded_paths(&f.repo), ["two.md"]);
    }

    /// A save that changed nothing must not leave a commit behind. The user
    /// reads this history to find a version to restore; padding it with empty
    /// entries makes it useless for that.
    #[test]
    fn recording_an_unchanged_note_makes_no_commit() {
        let f = fixture("record-unchanged");
        write(&f.vault, "one.md", "# One\n");
        let first = record(&f.repo, &[PathBuf::from("one.md")], "first")
            .expect("recorded")
            .expect("committed");

        let second = record(&f.repo, &[PathBuf::from("one.md")], "second").expect("recorded");

        assert_eq!(second, None, "an unchanged note was recorded as a change");
        assert_eq!(head_commit(&f.repo).expect("readable"), Some(first));
    }

    /// The vault is the boundary. A path that escapes it would pull the user's
    /// unrelated files into a history they think holds only their notes.
    #[test]
    fn a_path_outside_the_vault_is_refused() {
        let f = fixture("record-escape");

        let error = record(&f.repo, &[PathBuf::from("../secrets.md")], "escape")
            .expect_err("a path outside the vault is refused");

        assert_eq!(error.code, "sync.path_outside_vault");
    }

    #[test]
    fn an_absolute_path_inside_the_vault_is_accepted() {
        let f = fixture("record-absolute");
        write(&f.vault, "one.md", "# One\n");

        record(&f.repo, &[f.vault.join("one.md")], "absolute")
            .expect("recorded")
            .expect("committed");

        assert_eq!(recorded_paths(&f.repo), ["one.md"]);
    }

    /// A folder is not a note, and its name in the tree stands for everything
    /// underneath it.
    ///
    /// The watcher reports folders as well as files, so one arriving in a batch
    /// must be passed over rather than treated as "not a file, therefore gone" —
    /// that reading takes every note in the folder out of history along with it.
    #[test]
    fn recording_a_folder_leaves_the_notes_inside_it_alone() {
        let f = fixture("record-folder");
        write(&f.vault, "notes/one.md", "# One\n");
        record(&f.repo, &[PathBuf::from("notes/one.md")], "first")
            .expect("recording succeeds")
            .expect("a commit is made");

        record(&f.repo, &[PathBuf::from("notes")], "a folder changed")
            .expect("recording succeeds");

        assert_eq!(recorded_paths(&f.repo), ["notes/one.md"]);
    }

    /// `..` is not the only way to name something that is not a note in this
    /// vault. `./note.md` resolves to the right file today only because the
    /// tree builder happens to drop the odd component on the way past.
    #[test]
    fn a_path_that_is_not_plainly_a_name_is_refused() {
        let f = fixture("vault-relative-curdir");

        let error = vault_relative(&f.vault, Path::new("./note.md"))
            .expect_err("a path that is not a plain sequence of names is refused");

        assert_eq!(error.code, "sync.path_outside_vault");
    }
}
