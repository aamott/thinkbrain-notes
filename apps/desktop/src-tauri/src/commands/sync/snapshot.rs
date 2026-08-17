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

// The lifecycle sub-story wires this to the watcher; until then its own tests
// are the only caller. See plans/auto-sync/pending-gix_engine_hidden_repo-high-hard.md.
#![allow(dead_code)]

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
    let vault = repo
        .workdir()
        .ok_or_else(|| NativeError::new("sync.no_worktree", "This sync history has no notes folder."))?
        .to_path_buf();

    let parent = head_commit(repo)?;
    let base_tree = match parent {
        Some(id) => commit_tree(repo, id)?,
        None => gix::ObjectId::empty_tree(repo.object_hash()),
    };

    let mut editor = repo
        .edit_tree(base_tree)
        .map_err(|error| failed("sync.tree_read_failed", "Could not read the last recorded state.", error))?;

    for path in paths {
        let relative = vault_relative(&vault, path)?;
        let absolute = vault.join(&relative);

        match std::fs::symlink_metadata(&absolute) {
            Ok(metadata) if metadata.is_file() => {
                let file = std::fs::File::open(&absolute)
                    .map_err(|error| failed("sync.note_read_failed", "Could not read a note to record it.", error))?;
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
            // Anything that is not a plain file — gone, or a directory or
            // symlink where a note used to be — is recorded as an absence. The
            // alternative is a history that quietly keeps files the vault no
            // longer has.
            _ => {
                // `remove` on a path that was never recorded is not an error:
                // a note created and deleted between two commits is simply
                // absent from both.
                editor
                    .remove(tree_path(&relative))
                    .map_err(|error| failed("sync.tree_write_failed", "Could not record a deleted note.", error))?;
            }
        }
    }

    let tree = editor
        .write()
        .map_err(|error| failed("sync.tree_write_failed", "Could not record the new state.", error))?
        .detach();

    if tree == base_tree {
        return Ok(None);
    }

    let signature = gix::actor::Signature {
        name: AUTHOR_NAME.into(),
        email: AUTHOR_EMAIL.into(),
        time: gix::date::Time::now_local_or_utc(),
    };

    let commit = repo
        .commit_as(
            signature.to_ref(&mut gix::date::parse::TimeBuf::default()),
            signature.to_ref(&mut gix::date::parse::TimeBuf::default()),
            HISTORY_REF,
            message,
            tree,
            parent,
        )
        .map_err(|error| failed("sync.commit_failed", "Could not record this change.", error))?;

    Ok(Some(commit.detach()))
}

fn head_commit(repo: &gix::Repository) -> Result<Option<gix::ObjectId>, NativeError> {
    match repo.find_reference(HISTORY_REF) {
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

    if relative.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
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
}
