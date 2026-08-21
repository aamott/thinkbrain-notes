use super::super::engine::Engine;
use super::super::network::REMOTE_REF;
use super::super::test_support;
use super::*;
use crate::commands::sync::history;
use crate::commands::sync::snapshot::{self, HISTORY_REF};
use std::fs;
use std::path::Path;
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

type Fixture = test_support::RepoFixture;

fn fixture(name: &str) -> Fixture {
    test_support::repo_fixture(name, "sync")
}

const NOW: i64 = 1_700_000_000;
const DAY: i64 = 86_400;

fn policy() -> Policy {
    Policy {
        retention: Duration::from_secs(90 * 24 * 60 * 60),
        historical_file_limit: 50,
    }
}

fn who(seconds: i64) -> gix::actor::Signature {
    gix::actor::Signature {
        name: "ThinkBrain Notes".into(),
        email: "sync@thinkbrain.notes".into(),
        time: gix::date::Time::new(seconds, 0),
    }
}

fn tree_with(
    repo: &gix::Repository,
    base: gix::ObjectId,
    files: &[(&str, &[u8])],
) -> gix::ObjectId {
    let mut editor = repo.edit_tree(base).expect("the tree opens");
    for (path, bytes) in files {
        let blob = repo
            .write_blob(*bytes)
            .expect("the blob is stored")
            .detach();
        editor
            .upsert(*path, gix::object::tree::EntryKind::Blob, blob)
            .expect("the path is recorded");
    }
    editor.write().expect("the tree is written").detach()
}

fn commit_at(
    repo: &gix::Repository,
    tree: gix::ObjectId,
    parent: Option<gix::ObjectId>,
    seconds: i64,
    message: &str,
) -> gix::ObjectId {
    let who = who(seconds);
    repo.write_object(&gix::objs::Commit {
        tree,
        parents: parent.into_iter().collect(),
        author: who.clone(),
        committer: who,
        encoding: None,
        message: message.into(),
        extra_headers: Vec::new(),
    })
    .expect("the commit is written")
    .detach()
}

fn set_ref(repo: &gix::Repository, name: &str, id: gix::ObjectId) {
    repo.reference(name, id, gix::refs::transaction::PreviousValue::Any, "test")
        .expect("the ref moves");
}

fn blob_of(repo: &gix::Repository, commit: gix::ObjectId, path: &str) -> gix::ObjectId {
    let mut tree = repo
        .find_commit(commit)
        .expect("the commit exists")
        .tree()
        .expect("the tree exists");
    tree.peel_to_entry_by_path(Path::new(path))
        .expect("the path is searchable")
        .expect("the path is recorded")
        .object_id()
}

fn loose_path(repo: &gix::Repository, id: gix::ObjectId) -> std::path::PathBuf {
    let hex = id.to_hex().to_string();
    repo.git_dir()
        .join("objects")
        .join(&hex[..2])
        .join(&hex[2..])
}

fn chain_ids(repo: &gix::Repository) -> Vec<gix::ObjectId> {
    let mut ids = Vec::new();
    let mut next = snapshot::checkpoint_head(repo).expect("the restore points are readable");
    while let Some(id) = next {
        let Ok(commit) = repo.find_commit(id) else {
            break;
        };
        ids.push(id);
        next = commit.parent_ids().next().map(|parent| parent.detach());
    }
    ids
}

fn tree_paths(repo: &gix::Repository, commit: gix::ObjectId) -> Vec<String> {
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

/// Old restore points fall off the private chain, and only their now-unreachable
/// loose objects are deleted. The history branch is not touched.
#[test]
fn old_restore_points_are_truncated_and_their_bytes_come_back() {
    let f = fixture("maintain-truncate");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let old_tree = tree_with(
        &f.repo,
        empty,
        &[("old.md", b"only in the old restore point\n")],
    );
    let old = commit_at(&f.repo, old_tree, None, NOW - 100 * DAY, "old");
    let old_blob = blob_of(&f.repo, old, "old.md");
    let recent_tree = tree_with(&f.repo, empty, &[("recent.md", b"still within 90 days\n")]);
    let recent = commit_at(&f.repo, recent_tree, Some(old), NOW - 10 * DAY, "recent");
    set_ref(&f.repo, CHECKPOINT_REF, recent);
    test_support::write(&f.vault, "note.md", "on main\n");
    let main = snapshot::record(&f.repo, &[std::path::PathBuf::from("note.md")], "main")
        .expect("recorded")
        .expect("committed");

    let done = cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    assert!(
        done.reclaimed > 0,
        "dropping the old restore point should free its object"
    );
    let kept = chain_ids(&f.repo);
    assert_eq!(
        kept.len(),
        1,
        "only the restore point within 90 days remains"
    );
    assert!(
        f.repo
            .find_commit(kept[0])
            .expect("the kept restore point exists")
            .parent_ids()
            .next()
            .is_none(),
        "the oldest kept restore point is a new root"
    );
    assert!(
        !loose_path(&f.repo, old_blob).exists(),
        "the old blob leaked"
    );
    assert_eq!(
        snapshot::head_commit(&f.repo).expect("main is readable"),
        Some(main),
        "synced history was rewritten"
    );
}

/// The newest restore point is the undo invariant. It stays even when it is
/// itself older than 90 days, and even when it holds a file over the threshold.
#[test]
fn the_newest_restore_point_and_its_large_file_are_kept() {
    let f = fixture("maintain-newest");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let large = vec![b'x'; 80];
    let tree = tree_with(&f.repo, empty, &[("photo.bin", &large)]);
    let newest = commit_at(&f.repo, tree, None, NOW - 200 * DAY, "newest");
    set_ref(&f.repo, CHECKPOINT_REF, newest);
    let blob = blob_of(&f.repo, newest, "photo.bin");

    cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    let kept = chain_ids(&f.repo);
    assert_eq!(kept.len(), 1);
    assert!(
        loose_path(&f.repo, blob).exists(),
        "the newest restore point lost its over-threshold file"
    );
    assert_eq!(tree_paths(&f.repo, kept[0]), ["photo.bin"]);
}

/// Historical restore points drop files over the threshold; the same file on
/// main is protected and is not deleted.
#[test]
fn over_threshold_files_leave_older_restore_points_but_not_main() {
    let f = fixture("maintain-threshold");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let large = vec![b'y'; 80];
    let old_tree = tree_with(
        &f.repo,
        empty,
        &[("stash.bin", &large), ("note.md", b"old note\n")],
    );
    let old = commit_at(&f.repo, old_tree, None, NOW - 10 * DAY, "old");
    let stash = blob_of(&f.repo, old, "stash.bin");
    let newest_tree = tree_with(&f.repo, old_tree, &[("kept.md", b"newest\n")]);
    let newest = commit_at(&f.repo, newest_tree, Some(old), NOW, "newest");
    set_ref(&f.repo, CHECKPOINT_REF, newest);
    test_support::write(&f.vault, "stash.bin", std::str::from_utf8(&large).unwrap());
    snapshot::record(&f.repo, &[std::path::PathBuf::from("stash.bin")], "main").expect("recorded");

    cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    let kept = chain_ids(&f.repo);
    assert_eq!(kept.len(), 2);
    let historical = kept[1];
    assert!(
        !tree_paths(&f.repo, historical).contains(&"stash.bin".to_string()),
        "the older restore point still names the over-threshold file"
    );
    assert!(
        loose_path(&f.repo, stash).exists(),
        "a file that is also on main was deleted"
    );
    let main = snapshot::head_commit(&f.repo)
        .expect("main is readable")
        .expect("main exists");
    assert!(tree_paths(&f.repo, main).contains(&"stash.bin".to_string()));
}

/// A unique over-threshold file that lives only in an older restore point is
/// dropped from that tree and then deleted as an unprotected loose object.
#[test]
fn a_historical_over_threshold_file_not_on_main_is_deleted() {
    let f = fixture("maintain-orphan-large");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let large = vec![b'z'; 80];
    let old_tree = tree_with(&f.repo, empty, &[("stash.bin", &large)]);
    let old = commit_at(&f.repo, old_tree, None, NOW - 10 * DAY, "old");
    let stash = blob_of(&f.repo, old, "stash.bin");
    let newest_tree = tree_with(&f.repo, empty, &[("note.md", b"newest\n")]);
    let newest = commit_at(&f.repo, newest_tree, Some(old), NOW, "newest");
    set_ref(&f.repo, CHECKPOINT_REF, newest);

    cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    assert!(
        !loose_path(&f.repo, stash).exists(),
        "the orphaned over-threshold file was kept"
    );
}

/// Remote tip, merge base, and unpushed main commits stay, even when an old
/// restore point that named something unique is removed.
#[test]
fn protected_refs_and_unpushed_work_survive() {
    let f = fixture("maintain-protected");
    test_support::write(&f.vault, "base.md", "shared\n");
    let base = snapshot::record(&f.repo, &[std::path::PathBuf::from("base.md")], "base")
        .expect("recorded")
        .expect("committed");
    test_support::write(&f.vault, "ahead.md", "not pushed\n");
    let ahead = snapshot::record(&f.repo, &[std::path::PathBuf::from("ahead.md")], "ahead")
        .expect("recorded")
        .expect("committed");
    set_ref(&f.repo, REMOTE_REF, base);

    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let secret_tree = tree_with(&f.repo, empty, &[("secret.md", b"only undo\n")]);
    let secret = commit_at(&f.repo, secret_tree, None, NOW - 100 * DAY, "secret");
    let secret_blob = blob_of(&f.repo, secret, "secret.md");
    let newest_tree = tree_with(&f.repo, empty, &[("now.md", b"now\n")]);
    let newest = commit_at(&f.repo, newest_tree, Some(secret), NOW, "now");
    set_ref(&f.repo, CHECKPOINT_REF, newest);

    cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    assert_eq!(
        snapshot::head_commit(&f.repo).expect("main is readable"),
        Some(ahead)
    );
    assert!(
        f.repo.find_commit(base).is_ok(),
        "the merge base was deleted"
    );
    assert!(
        f.repo.find_commit(ahead).is_ok(),
        "unpushed work was deleted"
    );
    assert_eq!(
        f.repo
            .find_reference(REMOTE_REF)
            .expect("the remote tip exists")
            .peel_to_id()
            .expect("the remote tip peels")
            .detach(),
        base
    );
    assert!(
        !loose_path(&f.repo, secret_blob).exists(),
        "the private blob was protected"
    );
}

/// After truncation, an id from a dropped restore point is no longer a version
/// that can be put back.
#[test]
fn a_stale_restore_id_is_no_longer_available() {
    let f = fixture("maintain-stale");
    test_support::write(&f.vault, "note.md", "now\n");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let old_tree = tree_with(&f.repo, empty, &[("note.md", b"then\n")]);
    let old = commit_at(&f.repo, old_tree, None, NOW - 100 * DAY, "old");
    let newest_tree = tree_with(&f.repo, empty, &[("note.md", b"now\n")]);
    let newest = commit_at(&f.repo, newest_tree, Some(old), NOW, "newest");
    set_ref(&f.repo, CHECKPOINT_REF, newest);

    cleanup(&f.repo, NOW, &policy()).expect("cleanup succeeds");

    let engine = Engine::new(f.repo, false);
    let error = history::restore(&engine, "note.md", &old.to_string())
        .expect_err("a dropped restore point should not write");
    assert_eq!(error.code, "sync.version_missing");
}

/// Clearing undo history removes only the private restore-point ref. Notes on
/// disk and synced history stay.
#[test]
fn clearing_undo_history_leaves_notes_and_synced_history() {
    let f = fixture("maintain-clear");
    test_support::write(&f.vault, "note.md", "keep me\n");
    let main = snapshot::record(&f.repo, &[std::path::PathBuf::from("note.md")], "main")
        .expect("recorded")
        .expect("committed");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let tree = tree_with(&f.repo, empty, &[("note.md", b"undo copy\n")]);
    let checkpoint = commit_at(&f.repo, tree, None, NOW, "undo");
    set_ref(&f.repo, CHECKPOINT_REF, checkpoint);

    let done = clear_undo(&f.repo).expect("clear succeeds");

    assert!(snapshot::checkpoint_head(&f.repo)
        .expect("readable")
        .is_none());
    assert_eq!(
        snapshot::head_commit(&f.repo).expect("main is readable"),
        Some(main)
    );
    assert_eq!(
        fs::read_to_string(f.vault.join("note.md")).expect("the note is on disk"),
        "keep me\n"
    );
    assert!(
        f.repo.find_reference(HISTORY_REF).is_ok(),
        "synced history was removed"
    );
    assert!(done.bytes_after <= done.bytes_before);
}

/// A maintenance failure is remembered without becoming a recording stop.
#[test]
fn a_maintenance_failure_does_not_stop_recording() {
    let f = test_support::engine_fixture("maintain-nonblocking");
    f.engine.set_maintenance_problem(Some(NativeError::new(
        CLEANUP_FAILED,
        "Could not tidy the saved undo history on this computer.",
    )));
    test_support::write(&f.vault, "note.md", "still saved\n");
    f.engine
        .note_changes([std::path::PathBuf::from("note.md")], Instant::now());

    assert!(f.engine.flush().expect("recording still works").is_some());
    assert!(f.engine.problem().is_none());
    assert!(f.engine.maintenance_problem().is_some());
}

#[test]
fn checkpoint_is_serialized_against_maintenance_and_remains_restorable() {
    let f = test_support::engine_fixture("maintain-checkpoint-lock");
    test_support::write(&f.vault, "note.md", "held before maintenance\n");
    let vault = f.vault;
    let engine = Arc::new(f.engine);

    let worker = Arc::clone(&engine);
    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let maintenance = thread::spawn(move || {
        worker
            .maintain_after_lock(true, || {
                entered_tx
                    .send(())
                    .expect("maintenance announces that it holds the lock");
                release_rx
                    .recv()
                    .expect("maintenance is released to continue");
            })
            .expect("maintenance finishes");
    });
    entered_rx
        .recv_timeout(Duration::from_secs(5))
        .expect("maintenance acquires the recording lock");

    assert!(
        engine
            .try_checkpoint(
                &[std::path::PathBuf::from("note.md")],
                snapshot::Reason::VersionRestored,
            )
            .expect("the checkpoint attempt is readable")
            .is_none(),
        "the checkpoint acquired the recording lock during maintenance"
    );
    assert!(
        snapshot::checkpoint_head(&engine.repository())
            .expect("the checkpoint ref is readable")
            .is_none(),
        "a checkpoint was written during maintenance"
    );

    release_tx
        .send(())
        .expect("maintenance is released to finish");
    maintenance.join().expect("the maintenance thread finishes");
    let checkpoint = engine
        .checkpoint(
            &[std::path::PathBuf::from("note.md")],
            snapshot::Reason::VersionRestored,
        )
        .expect("the checkpoint completes after maintenance");

    let repo = engine.repository();
    repo.find_commit(checkpoint)
        .expect("the checkpoint commit remains readable");
    test_support::write(&vault, "note.md", "changed after maintenance\n");
    history::restore(&engine, "note.md", &checkpoint.to_string())
        .expect("the checkpoint remains restorable");
    assert_eq!(
        fs::read_to_string(vault.join("note.md")).expect("the restored note is readable"),
        "held before maintenance\n"
    );
}

/// Automatic cleanup is at most daily: a just-finished pass is not repeated.
#[test]
fn automatic_cleanup_is_skipped_when_it_already_ran_today() {
    let f = fixture("maintain-daily");
    let empty = gix::ObjectId::empty_tree(f.repo.object_hash());
    let old_tree = tree_with(&f.repo, empty, &[("old.md", b"old\n")]);
    let old = commit_at(&f.repo, old_tree, None, NOW - 100 * DAY, "old");
    let newest_tree = tree_with(&f.repo, empty, &[("now.md", b"now\n")]);
    let newest = commit_at(&f.repo, newest_tree, Some(old), NOW, "now");
    set_ref(&f.repo, CHECKPOINT_REF, newest);
    mark_done(&f.repo, SystemTime::now()).expect("the last run is recorded");

    assert!(!due(&f.repo, SystemTime::now()));
    let before = chain_ids(&f.repo);
    // Force is what Settings uses; automatic paths honour `due`.
    assert_eq!(before, chain_ids(&f.repo));
}

#[test]
fn maintain_when_not_due_returns_zero_cleanup_without_measuring_usage() {
    let f = test_support::engine_fixture("maintain-not-due-zero");
    mark_done(&f.engine.repository(), SystemTime::now()).expect("the last run is recorded");
    assert!(
        !f.engine.due_for_maintenance(),
        "the fixture must report maintenance as not due"
    );

    let done = f
        .engine
        .maintain(false)
        .expect("the not-due path returns Ok");

    assert_eq!(
        done,
        Cleanup {
            bytes_before: 0,
            bytes_after: 0,
            reclaimed: 0,
        },
        "the not-due path returns a zero-valued Cleanup without measuring usage"
    );
}

#[test]
fn usage_counts_the_hidden_repository_not_the_notes_folder() {
    let f = fixture("maintain-usage");
    let before = usage(&f.repo).expect("usage is readable");
    test_support::write(&f.vault, "huge.md", &"a".repeat(50_000));
    let after = usage(&f.repo).expect("usage is still readable");
    assert_eq!(
        before, after,
        "a note that lives only in the folder was counted as undo history"
    );
}
