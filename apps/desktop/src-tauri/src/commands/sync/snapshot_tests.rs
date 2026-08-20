use super::super::hidden_repo;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::{Path, PathBuf};

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
/// holds without caring how the trees nest. Resolves HEAD first (returning
/// an empty list when there is no commit yet) and delegates the tree walk
/// to [`tree_paths_of`].
fn recorded_paths(repo: &gix::Repository) -> Vec<String> {
    let Some(commit) = head_commit(repo).expect("the history is readable") else {
        return Vec::new();
    };
    tree_paths_of(repo, commit)
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
    let commit = head_commit(repo)
        .expect("the history is readable")
        .expect("there is a commit");
    let mut tree = repo
        .find_commit(commit)
        .expect("the commit exists")
        .tree()
        .expect("the tree exists");
    let entry = tree
        .peel_to_entry_by_path(Path::new(path))
        .expect("the path is searchable")
        .expect("the path is recorded");
    let object = entry.object().expect("the blob is readable");
    String::from_utf8(object.data.clone()).expect("the note is text")
}

/// A checkpoint is the undo in "every resolution is undoable". The merge
/// engine takes one of both sides before it writes either, so a wrong click is
/// a restore rather than a loss.
#[test]
fn a_checkpoint_records_the_current_state_of_the_named_notes() {
    let f = fixture("checkpoint-records");
    write(&f.vault, "note.md", "# Mine\n");
    write(&f.vault, "note-DESKTOP-AB12CD.md", "# Theirs\n");

    let id = checkpoint(
        &f.repo,
        &[
            PathBuf::from("note.md"),
            PathBuf::from("note-DESKTOP-AB12CD.md"),
        ],
        Reason::ConflictResolved,
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
    checkpoint(&f.repo, &[PathBuf::from("note-DESKTOP-AB12CD.md")], Reason::ConflictResolved).expect("checkpointed");

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
    let first = checkpoint(&f.repo, &[PathBuf::from("one.md")], Reason::ConflictResolved).expect("checkpointed");

    write(&f.vault, "two.md", "# Two\n");
    let second = checkpoint(&f.repo, &[PathBuf::from("two.md")], Reason::ConflictResolved).expect("checkpointed");

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
    let first = checkpoint(&f.repo, &[PathBuf::from("one.md")], Reason::ConflictResolved).expect("checkpointed");

    let second = checkpoint(&f.repo, &[PathBuf::from("one.md")], Reason::ConflictResolved).expect("checkpointed");

    assert_eq!(first, second);
}

/// Checkpointing files that are not there is not an error: the merge engine
/// takes a checkpoint before writing, and "this side did not exist yet" is
/// a state worth being able to restore to.
#[test]
fn a_first_checkpoint_of_absent_notes_still_yields_a_restore_point() {
    let f = fixture("checkpoint-absent");

    let id = checkpoint(&f.repo, &[PathBuf::from("missing.md")], Reason::ConflictResolved).expect("checkpointed");

    assert!(tree_paths_of(&f.repo, id).is_empty());
    // The checkpoint must actually be reachable from the checkpoint ref, or
    // the restore point the caller was handed is not restorable.
    assert_eq!(
        checkpoint_head(&f.repo).expect("the checkpoint ref is readable"),
        Some(id),
        "the checkpoint ref does not point at the commit it returned"
    );
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
        f.repo
            .find_commit(commit)
            .expect("the commit exists")
            .message_raw_sloppy()
            .to_string(),
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
    record(&f.repo, &[PathBuf::from("one.md")], "first")
        .expect("recorded")
        .expect("committed");

    write(&f.vault, "two.md", "# Two\n");
    record(&f.repo, &[PathBuf::from("two.md")], "second")
        .expect("recorded")
        .expect("committed");

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
    record(
        &f.repo,
        &[PathBuf::from("one.md"), PathBuf::from("two.md")],
        "first",
    )
    .expect("recorded")
    .expect("committed");

    fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
    record(&f.repo, &[PathBuf::from("one.md")], "second")
        .expect("recorded")
        .expect("committed");

    assert_eq!(recorded_paths(&f.repo), ["two.md"]);
}

#[test]
fn a_missing_note_does_not_abort_the_batch() {
    let f = fixture("record-missing-batch");
    write(&f.vault, "one.md", "# One\n");
    write(&f.vault, "two.md", "# Two\n");
    record(
        &f.repo,
        &[PathBuf::from("one.md"), PathBuf::from("two.md")],
        "first",
    )
    .expect("recorded")
    .expect("committed");

    fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
    write(&f.vault, "two.md", "# Two updated\n");
    record(
        &f.repo,
        &[PathBuf::from("one.md"), PathBuf::from("two.md")],
        "second",
    )
    .expect("the missing note is recorded as a deletion")
    .expect("committed");

    assert_eq!(recorded_paths(&f.repo), ["two.md"]);
    assert_eq!(contents_of(&f.repo, "two.md"), "# Two updated\n");
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

/// A path that escapes the vault is skipped rather than aborting the batch.
/// One bad name must not stall the rest of the notes.
#[test]
fn a_path_outside_the_vault_is_skipped_and_the_rest_still_lands() {
    let f = fixture("record-escape");
    write(&f.vault, "one.md", "# One\n");

    let landed = landed(
        &f.repo,
        &[PathBuf::from("one.md"), PathBuf::from("../secrets.md")],
        "mixed",
    )
    .expect("the batch is not aborted");

    assert!(landed.commit.is_some(), "the good note was not recorded");
    assert_eq!(landed.skipped.len(), 1);
    assert_eq!(landed.skipped[0].1.code, "sync.path_outside_vault");
    assert_eq!(recorded_paths(&f.repo), ["one.md"]);
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

/// A folder's name stands for everything underneath it, so naming one must
/// record the notes inside rather than skip it — otherwise a rename that
/// only reports the folder leaves the old name in history forever.
#[test]
fn recording_a_folder_records_the_notes_inside_it() {
    let f = fixture("record-folder");
    write(&f.vault, "notes/one.md", "# One\n");

    record(&f.repo, &[PathBuf::from("notes")], "a folder arrived")
        .expect("recording succeeds")
        .expect("a commit is made");

    assert_eq!(recorded_paths(&f.repo), ["notes/one.md"]);
}

/// The watcher reports a folder rename as the two folder paths, never the
/// notes inside. Both have to be applied or the tree keeps the old name.
#[test]
fn recording_a_renamed_folder_moves_the_notes_inside_it() {
    let f = fixture("record-folder-rename");
    write(&f.vault, "notes/one.md", "# One\n");
    record(&f.repo, &[PathBuf::from("notes/one.md")], "first")
        .expect("recording succeeds")
        .expect("a commit is made");

    fs::rename(f.vault.join("notes"), f.vault.join("journal")).expect("the folder is renamed");
    record(
        &f.repo,
        &[PathBuf::from("notes"), PathBuf::from("journal")],
        "renamed",
    )
    .expect("recording succeeds")
    .expect("a commit is made");

    assert_eq!(recorded_paths(&f.repo), ["journal/one.md"]);
}

/// A folder that is gone must take its notes with it, or a delete that the
/// watcher only named as the folder would keep those notes in history.
#[test]
fn recording_a_deleted_folder_drops_the_notes_inside_it() {
    let f = fixture("record-folder-delete");
    write(&f.vault, "notes/one.md", "# One\n");
    write(&f.vault, "keep.md", "# Keep\n");
    record(
        &f.repo,
        &[PathBuf::from("notes/one.md"), PathBuf::from("keep.md")],
        "first",
    )
    .expect("recording succeeds")
    .expect("a commit is made");

    fs::remove_dir_all(f.vault.join("notes")).expect("the folder is deleted");
    record(&f.repo, &[PathBuf::from("notes")], "deleted")
        .expect("recording succeeds")
        .expect("a commit is made");

    assert_eq!(recorded_paths(&f.repo), ["keep.md"]);
}

/// A symlink standing where a note used to be is not a note. Following it
/// is how history ends up holding files from outside the vault.
#[cfg(unix)]
#[test]
fn recording_a_symlink_does_not_store_its_target() {
    let f = fixture("record-symlink");
    write(&f.vault, "note.md", "# A note\n");
    record(&f.repo, &[PathBuf::from("note.md")], "first")
        .expect("recorded")
        .expect("committed");

    let outside = make_temp_test_dir("record-symlink-outside", "sync", true);
    write(&outside, "secret.md", "# Not theirs\n");
    fs::remove_file(f.vault.join("note.md")).expect("the note is removed");
    std::os::unix::fs::symlink(outside.join("secret.md"), f.vault.join("note.md"))
        .expect("the vault holds a symlink");

    // A symlink is not a note, so the recorder skips it and the tree is
    // unchanged from the previous commit — `record` answers `None` rather
    // than writing an empty commit (and never follows the link to store the
    // target's bytes).
    let recorded = record(&f.repo, &[PathBuf::from("note.md")], "second").expect("recording succeeds");
    assert_eq!(
        recorded, None,
        "a symlink was recorded as a change instead of being skipped"
    );

    assert_eq!(recorded_paths(&f.repo), ["note.md"]);
    assert_eq!(contents_of(&f.repo, "note.md"), "# A note\n");
}

#[cfg(unix)]
#[test]
fn a_symlink_is_not_opened_as_its_target() {
    let vault = make_temp_test_dir("open-symlink-vault", "sync", true);
    let outside = make_temp_test_dir("open-symlink-outside", "sync", true);
    write(&outside, "secret.md", "# Not theirs\n");
    std::os::unix::fs::symlink(outside.join("secret.md"), vault.join("note.md"))
        .expect("the vault holds a symlink");

    open_without_following(&vault.join("note.md"))
        .expect_err("a symlink must not be followed");
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

#[cfg(windows)]
#[test]
fn a_drive_relative_path_is_refused() {
    let f = fixture("vault-relative-drive");

    let error = vault_relative(&f.vault, Path::new(r"C:note.md"))
        .expect_err("a drive-relative path is not a plain vault-relative path");

    assert_eq!(error.code, "sync.path_outside_vault");
}
