//! Regression tests for the failure surfaces of history ingestion: malformed
//! graphs, moved or rewritten sources, remote publication, and what survives
//! a vanished source.

use std::fs;

use gix::objs::Write as _;
use gix::refs::transaction::PreviousValue;

use super::super::test_support::ref_value;
use super::tests::{cancel, commit_into, dir_contents, fetch, git_repo, hidden, retained_ref, who};
use super::*;
use crate::commands::sync::bootstrap::bootstrap;
use crate::commands::sync::hidden_repo;
use crate::commands::sync::maintain;
use crate::commands::sync::network::{self, REMOTE_REF};
use crate::commands::sync::round;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;

const NAMESPACE: &str = "history-ingest-safety";

/// Writes raw bytes of `kind` into `repo` -- the only way to produce an
/// object no constructor would build, like a commit naming a bogus parent.
fn write_raw(repo: &gix::Repository, kind: gix::objs::Kind, bytes: &[u8]) -> gix::ObjectId {
    repo.write_buf(kind, bytes).expect("the object is written")
}

/// Commit bytes with `parents` that do not have to be valid object ids.
fn commit_bytes(tree: gix::ObjectId, parents: &[&str], message: &str) -> Vec<u8> {
    let mut bytes = format!("tree {tree}\n").into_bytes();
    for parent in parents {
        bytes.extend(format!("parent {parent}\n").into_bytes());
    }
    bytes.extend(b"author A <a@b.c> 1700000000 +0000\ncommitter A <a@b.c> 1700000000 +0000\n\n");
    bytes.extend(message.as_bytes());
    bytes
}

fn retained_archive(hidden: &gix::Repository, identity_suffix: &str, tip: gix::ObjectId) -> bool {
    ref_value(
        hidden,
        &format!("{SOURCE_REF_PREFIX}retained/{identity_suffix}/{tip}"),
    ) == Some(tip)
}

// ---------------------------------------------------------------------------
// Malformed and mistyped graphs
// ---------------------------------------------------------------------------

/// A commit whose `parent` line is not a hash is malformed history, not a
/// history at all: the import must fail incomplete and move nothing.
#[test]
fn a_commit_with_a_malformed_parent_is_incomplete_and_moves_nothing() {
    let app_data = make_temp_test_dir("badparent-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("badparent-vault", false);
    let good_tip = commit_into(&source, &[("one.md", b"first\n")], None, "good");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    let main = snapshot::head_commit(&hidden).expect("the history is readable");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(good_tip));

    // A commit with a valid tree but a parent line that is not a hash.
    let tree = source
        .find_commit(good_tip)
        .unwrap()
        .tree_id()
        .unwrap()
        .detach();
    let corrupt = write_raw(
        &source,
        gix::objs::Kind::Commit,
        &commit_bytes(tree, &["not-a-hash"], "corrupt"),
    );
    source
        .reference("refs/heads/main", corrupt, PreviousValue::Any, "corrupt")
        .expect("the branch moves");
    let git_before = dir_contents(&vault.join(".git"));

    let error = ingest_workspace_git(&hidden, &vault).expect_err("a malformed parent must fail");

    assert_eq!(error.code, "sync.git_history_incomplete");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(good_tip));
    assert_eq!(snapshot::head_commit(&hidden).unwrap(), main);
    // Their repository is exactly as the fixture left it.
    assert_eq!(dir_contents(&vault.join(".git")), git_before);
}

/// A commit whose tree line names a blob is a lie about kinds: traversal must
/// fail incomplete rather than trust the declared entry.
#[test]
fn a_commit_naming_a_blob_as_its_tree_is_incomplete() {
    let (vault, source) = git_repo("wrongkind-vault", false);
    let blob = source.write_blob(b"not a tree\n").unwrap().detach();
    let corrupt = write_raw(
        &source,
        gix::objs::Kind::Commit,
        &commit_bytes(blob, &[], "corrupt"),
    );
    source
        .reference("refs/heads/main", corrupt, PreviousValue::Any, "corrupt")
        .expect("the branch moves");

    let hidden_dir = make_temp_test_dir("wrongkind-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let error = ingest_workspace_git(&hidden, &vault).expect_err("the ingest fails");

    assert_eq!(error.code, "sync.git_history_incomplete");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), None);
}

/// A tip that does not exist at all is incomplete, not unsupported.
#[test]
fn a_missing_tip_is_incomplete() {
    let vault = make_temp_test_dir("notip-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("notip-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let missing = gix::ObjectId::from_hex(b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").unwrap();

    let error = retain(&hidden, &hidden, missing, WORKSPACE_SOURCE_REF, NoInterrupt)
        .expect_err("a missing tip fails");

    assert_eq!(error.code, "sync.git_history_incomplete");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), None);
}

/// A merge commit pulls in both parent graphs whole, and a gitlink entry
/// (someone else's repository) is skipped rather than treated as missing.
#[test]
fn a_merge_imports_both_parents_and_skips_gitlinks() {
    let (vault, source) = git_repo("merge-vault", false);
    let left = commit_into(&source, &[("left.md", b"left\n")], None, "left");
    let right = commit_into(&source, &[("right.md", b"right\n")], None, "right");
    assert_ne!(left, right, "distinct parents needed");

    // Merge tree: both files plus a gitlink to a commit this repo never had.
    let left_tree = source
        .find_commit(left)
        .unwrap()
        .tree_id()
        .unwrap()
        .detach();
    let mut editor = source.edit_tree(left_tree).unwrap();
    editor
        .upsert(
            "right.md",
            gix::object::tree::EntryKind::Blob,
            source.write_blob(b"right\n").unwrap().detach(),
        )
        .unwrap();
    // An OID that does not exist anywhere -- the point is that it is skipped.
    let foreign = gix::ObjectId::from_hex(b"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb").unwrap();
    editor
        .upsert("submodule", gix::object::tree::EntryKind::Commit, foreign)
        .unwrap();
    let tree = editor.write().unwrap().detach();
    let who = who();
    let merge_tip = source
        .write_object(&gix::objs::Commit {
            tree,
            parents: [left, right].into_iter().collect(),
            author: who.clone(),
            committer: who,
            encoding: None,
            message: "merge left and right".into(),
            extra_headers: Vec::new(),
        })
        .unwrap()
        .detach();
    source
        .reference("refs/heads/main", merge_tip, PreviousValue::Any, "merge")
        .unwrap();

    let hidden_dir = make_temp_test_dir("merge-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let ingested = ingest_workspace_git(&hidden, &vault)
        .expect("the merge graph imports")
        .expect("a graph is imported");

    assert_eq!(ingested.tip, merge_tip);
    // Both complete sides plus the merge, and byte-identical contents -- the
    // message and timestamps are part of the copied bytes.
    for id in [left, right, merge_tip] {
        assert_eq!(
            hidden.find_object(id).expect("the object is there").data,
            source.find_object(id).unwrap().data,
            "{id} was not copied byte-identically"
        );
    }
    let objects = collect_reachable(&hidden, merge_tip).expect("the merged graph reads");
    assert!(!objects.contains_key(&foreign), "the gitlink was copied");
}

/// A `.git` that is a dangling symlink is a source that fails loudly, not a
/// vault with no history to import.
#[cfg(unix)]
#[test]
fn a_dangling_git_symlink_is_reported_not_ignored() {
    let vault = make_temp_test_dir("dangling-link-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("dangling-link-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    std::os::unix::fs::symlink("/definitely/not/a/real/git", vault.join(".git"))
        .expect("the symlink is created");

    let error = ingest_workspace_git(&hidden, &vault).expect_err("the ingest fails");

    assert_eq!(error.code, "sync.git_history_invalid");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), None);
}

// ---------------------------------------------------------------------------
// Rewritten and removed sources
// ---------------------------------------------------------------------------

/// A source that rewrote its history keeps both graphs: the old root is
/// archived under `retained/`, the identity ref names the new tip, and cleanup
/// may not collect either.
#[test]
fn a_rewritten_local_source_keeps_the_displaced_root() {
    let app_data = make_temp_test_dir("rewrite-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("rewrite-vault", false);
    let old_tip = commit_into(&source, &[("one.md", b"old\n")], None, "old");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    let main = snapshot::head_commit(&hidden).expect("the history is readable");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(old_tip));

    // Replace main with an unrelated root, then import again.
    let new_tip = commit_into(&source, &[("other.md", b"new\n")], None, "new root");
    source
        .reference("refs/heads/main", new_tip, PreviousValue::Any, "rewrite")
        .unwrap();

    let ingested = ingest_workspace_git(&hidden, &vault)
        .expect("the re-import succeeds")
        .expect("a graph is imported");
    assert_eq!(ingested.tip, new_tip);

    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(new_tip));
    assert!(
        retained_archive(&hidden, "workspace-git", old_tip),
        "the displaced root was not archived"
    );
    assert_eq!(snapshot::head_commit(&hidden).unwrap(), main);

    maintain::cleanup(&hidden, 1_800_000_000, &maintain::Policy::default())
        .expect("cleanup succeeds");
    collect_reachable(&hidden, old_tip).expect("the old graph survives cleanup");
    collect_reachable(&hidden, new_tip).expect("the new graph survives cleanup");
}

/// A fast-forward move needs no archive: the old tip is still inside the new
/// graph, so no `retained/` ref is written.
#[test]
fn a_fast_forward_source_writes_no_archive() {
    let app_data = make_temp_test_dir("ff-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("ff-vault", false);
    let first = commit_into(&source, &[("one.md", b"one\n")], None, "one");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(first));

    // The source advances to a child of the imported tip; re-importing is a
    // pure move forward, not a displacement.
    let second = commit_into(&source, &[("one.md", b"two\n")], Some(first), "two");
    let ingested = ingest_workspace_git(&hidden, &vault)
        .expect("the re-import succeeds")
        .expect("a graph is imported");
    assert_eq!(ingested.tip, second);

    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(second));
    collect_reachable(&hidden, first).expect("the old graph still reads");
    collect_reachable(&hidden, second).expect("the new graph reads");
    let platform = hidden.references().expect("the refs iterate");
    let retained: Vec<_> = platform
        .prefixed("refs/thinkbrain/sources/retained/")
        .expect("the prefix iterates")
        .collect();
    assert!(
        retained.is_empty(),
        "a contained old tip was archived anyway"
    );
}

/// The remote half of a rewrite: the old fetched root is archived and the
/// hashed source ref follows the new advertised tip, fetch returning the new
/// tip rather than a stale ref's.
#[test]
fn a_rewritten_remote_is_refetched_and_the_old_root_archived() {
    let (remote, remote_repo) = git_repo("rew-remote", true);
    let old_tip = commit_into(&remote_repo, &[("a.md", b"one\n")], None, "old remote");

    let vault = make_temp_test_dir("rew-remote-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("rew-remote-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let destination = remote.to_string_lossy().into_owned();

    let fetched = fetch(&remote, &hidden);
    assert_eq!(fetched, old_tip);
    retain_fetched(&hidden, &destination, fetched).expect("the first retain succeeds");
    let source_ref = remote_source_ref(&destination);
    assert_eq!(ref_value(&hidden, &source_ref), Some(old_tip));

    // The remote rewrites its default branch onto an unrelated root.
    let new_tip = commit_into(&remote_repo, &[("b.md", b"two\n")], None, "new remote");
    remote_repo
        .reference("refs/heads/main", new_tip, PreviousValue::Any, "rewrite")
        .unwrap();

    let fetched = fetch(&remote, &hidden);
    assert_eq!(fetched, new_tip, "the fetch returned a stale tip");
    retain_fetched(&hidden, &destination, fetched).expect("the second retain succeeds");

    let suffix = source_ref
        .strip_prefix(SOURCE_REF_PREFIX)
        .unwrap()
        .to_string();
    assert_eq!(ref_value(&hidden, &source_ref), Some(new_tip));
    assert!(retained_archive(&hidden, &suffix, old_tip));

    maintain::cleanup(&hidden, 1_800_000_000, &maintain::Policy::default())
        .expect("cleanup succeeds");
    collect_reachable(&hidden, old_tip).expect("the old remote graph survives");
    collect_reachable(&hidden, new_tip).expect("the new remote graph survives");
}

/// Once imported, the source can vanish entirely: reopening and cleanup keep
/// the retained ref and every object it still names.
#[test]
fn a_removed_source_keeps_its_imported_history() {
    let app_data = make_temp_test_dir("gone-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("gone-vault", false);
    let tip = commit_into(&source, &[("old.md", b"old\n")], None, "old");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(tip));
    drop(source);
    fs::rename(vault.join(".git"), vault.join(".git-away")).expect("the .git moves away");

    let reopened = bootstrap(&app_data, &vault, false).expect("re-bootstrap succeeds");
    assert!(!reopened.has_own_git);
    assert_eq!(
        ref_value(&reopened.repo, WORKSPACE_SOURCE_REF),
        Some(tip),
        "the source ref vanished with the source"
    );

    maintain::cleanup(&reopened.repo, 1_800_000_000, &maintain::Policy::default())
        .expect("cleanup succeeds");
    collect_reachable(&reopened.repo, tip).expect("the imported graph survives");
}

// ---------------------------------------------------------------------------
// Remote publication and failure preservation
// ---------------------------------------------------------------------------

/// The real round trip on a remote whose default branch is not `main`: the
/// advertised tip lands under the hashed source ref, the whole graph is
/// retained, and nothing on the remote moved.
#[test]
fn a_round_trip_publishes_the_advertised_default_branch() {
    let (remote, remote_repo) = git_repo("round-remote", true);
    let notes_tip = commit_into(&remote_repo, &[("a.md", b"on notes\n")], None, "notes one");
    let notes_tip = commit_into(
        &remote_repo,
        &[("a.md", b"on notes\n"), ("b.md", b"two\n")],
        Some(notes_tip),
        "notes two",
    );
    // `main` exists too, with deliberately different history, but HEAD names
    // `notes` -- the fetch must take what HEAD advertises.
    let main_tip = commit_into(&remote_repo, &[("x.md", b"on main\n")], None, "main");
    remote_repo
        .reference("refs/heads/notes", notes_tip, PreviousValue::Any, "notes")
        .unwrap();
    remote_repo
        .reference("refs/heads/main", main_tip, PreviousValue::Any, "main")
        .unwrap();
    fs::write(remote.join("HEAD"), "ref: refs/heads/notes\n").unwrap();
    let remote_refs_before = dir_contents(&remote);

    let app_data = make_temp_test_dir("round-appdata", NAMESPACE, true);
    let vault = make_temp_test_dir("round-vault", NAMESPACE, true);
    let workspace = bootstrap(&app_data, &vault, true).expect("bootstrap succeeds");
    let destination = remote.to_string_lossy().into_owned();

    round::once(&workspace.repo, &vault, &destination).expect("the round trip succeeds");

    let hidden = hidden(&app_data, &vault);
    assert_eq!(
        retained_ref(&hidden, &destination),
        Some(notes_tip),
        "the source ref did not name the advertised default branch"
    );
    assert_eq!(ref_value(&hidden, REMOTE_REF), Some(notes_tip));
    collect_reachable(&hidden, notes_tip).expect("the fetched graph reads whole");
    assert_eq!(dir_contents(&remote), remote_refs_before);
}

/// A shallow remote fails the fetch with the actionable history error and
/// changes nothing: retained history, markers, and config all stay.
#[test]
fn a_shallow_remote_fails_without_moving_anything() {
    let (remote, remote_repo) = git_repo("shallow-remote", true);
    let tip = commit_into(&remote_repo, &[("a.md", b"one\n")], None, "one");

    let vault = make_temp_test_dir("shallow-remote-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("shallow-remote-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let config_before = fs::read(hidden_dir.join("config")).expect("the config reads");
    let destination = remote.to_string_lossy().into_owned();

    // Existing retained history and markers, so the assertion that nothing
    // moved is meaningful rather than vacuous.
    let fetched = fetch(&remote, &hidden);
    assert_eq!(fetched, tip);
    retain_fetched(&hidden, &destination, fetched).expect("the retain succeeds");
    hidden
        .reference(REMOTE_REF, tip, PreviousValue::Any, "fetched")
        .unwrap();
    hidden
        .reference(
            crate::commands::sync::snapshot::HISTORY_REF,
            tip,
            PreviousValue::Any,
            "recorded",
        )
        .unwrap();

    // The remote advances so a fetch has real work to do -- a fetch of a
    // tip we already hold could be a no-op that never reaches the shallow
    // check.
    let _child = commit_into(&remote_repo, &[("a.md", b"two\n")], Some(tip), "two");
    fs::write(remote.join("shallow"), format!("{tip}\n")).unwrap();

    let error = network::fetch(&hidden, &destination, &cancel(), None)
        .expect_err("the shallow remote fails");

    assert_eq!(error.code, "sync.git_history_incomplete");
    assert_eq!(retained_ref(&hidden, &destination), Some(tip));
    assert_eq!(ref_value(&hidden, REMOTE_REF), Some(tip));
    assert_eq!(
        ref_value(&hidden, crate::commands::sync::snapshot::HISTORY_REF),
        Some(tip)
    );
    assert_eq!(
        fs::read(hidden_dir.join("config")).expect("the config reads"),
        config_before,
        "the fetch guard was persisted to the repository config"
    );
}

/// A cancelled fetch moves nothing either -- the source-only design means the
/// worker cannot have written a ref at all.
#[test]
fn a_cancelled_fetch_moves_no_refs() {
    let (remote, remote_repo) = git_repo("cancel-remote", true);
    commit_into(&remote_repo, &[("a.md", b"one\n")], None, "one");

    let vault = make_temp_test_dir("cancel-remote-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("cancel-remote-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let destination = remote.to_string_lossy().into_owned();
    let cancel = cancel();
    cancel.store(true, std::sync::atomic::Ordering::Relaxed);

    // A tiny local pack can finish before the flag is observed, so `Ok` is
    // allowed -- but any failure must be the cancellation answer, never a
    // transport error smuggled through this test.
    match network::fetch(&hidden, &destination, &cancel, None) {
        Ok(_) => {}
        Err(error) => assert_eq!(error.code, "sync.remote_timeout"),
    }

    assert_eq!(retained_ref(&hidden, &destination), None);
    assert_eq!(ref_value(&hidden, REMOTE_REF), None);
}
