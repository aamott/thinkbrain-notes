//! Which remote branch a workspace syncs, and when the choice blocks.
//!
//! These exercise the binding seam in `round`: discovery happens once, the
//! persisted choice survives a remote that moves its default, a checkout that
//! stops agreeing with the binding blocks the sync without touching history,
//! and a remote rewritten to unrelated history is refused before it joins.

use super::super::history_ingest::{
    self,
    tests::{commit_into, commit_onto, git_repo},
};
use super::super::network::REMOTE_REF;
use super::super::test_support::ref_value;
use super::super::{history, history_source, snapshot};
use super::tests::{device, read, write};
use std::fs;
use std::path::Path;

fn set_head(repo_path: &Path, branch: &str) {
    let git = if repo_path.join("HEAD").exists() {
        repo_path.to_path_buf()
    } else {
        repo_path.join(".git")
    };
    fs::write(git.join("HEAD"), format!("ref: refs/heads/{branch}\n")).unwrap();
}

/// A clone checked out on a non-default branch, configured as the vault.
fn clone_on(branch: &str) -> (std::path::PathBuf, gix::Repository) {
    let (path, repo) = git_repo(&format!("clone-{branch}"), false);
    let main = commit_into(&repo, &[("base.md", b"base\n")], None, "base");
    commit_onto(
        &repo,
        &format!("refs/heads/{branch}"),
        &[("note.md", b"clone\n")],
        &[main],
        "on notes",
    );
    set_head(&path, branch);
    (path.to_path_buf(), repo)
}

#[test]
fn a_clone_syncs_its_checked_out_branch_not_the_default() {
    let (remote_path, remote) = git_repo("nondefault-remote", true);
    let first = commit_onto(
        &remote,
        "refs/heads/notes",
        &[("note.md", b"remote\n")],
        &[],
        "remote one",
    );

    let (vault, _clone) = clone_on("notes");
    let device = device("nondefault");
    write(&device, "ours.md", "ours\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");

    super::once(&device.repo, &vault, &remote_path.to_string_lossy()).expect("the sync succeeds");

    // Fetching followed the bound branch, and so did the push: `main` was
    // never created on the remote.
    assert_eq!(ref_value(&remote, "refs/heads/main"), None);
    assert_ne!(
        ref_value(&remote, "refs/heads/notes"),
        Some(first),
        "the bound branch moved to the merged tip"
    );
    let link_ref = history_ingest::remote_source_ref(&remote_path.to_string_lossy());
    assert_eq!(
        history_source::bound_remote(&device.repo, &link_ref).expect("binding"),
        Some("refs/heads/notes".to_string())
    );
}

#[test]
fn a_matching_upstream_with_a_different_name_is_followed() {
    let (remote_path, remote) = git_repo("upstream-remote", true);
    let tip = commit_onto(
        &remote,
        "refs/heads/upstream",
        &[("a.md", b"remote\n")],
        &[],
        "remote",
    );

    let (vault, _clone) = clone_on("main");
    let destination = remote_path.to_string_lossy().to_string();
    // A Windows path's backslashes are git-config escapes; double them so the
    // stored url reads back as the path verbatim, like `git clone` writes it.
    let url = destination.replace('\\', "\\\\");
    fs::write(
        vault.join(".git").join("config"),
        format!(
            "[branch \"main\"]\n\tremote = origin\n\tmerge = refs/heads/upstream\n[remote \"origin\"]\n\turl = {url}\n"
        ),
    )
    .unwrap();

    let device = device("upstream");
    write(&device, "ours.md", "ours\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    super::once(&device.repo, &vault, &destination).expect("the sync succeeds");

    assert_ne!(ref_value(&remote, "refs/heads/upstream"), Some(tip));
    let link_ref = history_ingest::remote_source_ref(&destination);
    assert_eq!(
        history_source::bound_remote(&device.repo, &link_ref).expect("binding"),
        Some("refs/heads/upstream".to_string())
    );
}

#[test]
fn a_changed_remote_default_never_retargets_the_binding() {
    let (remote_path, remote) = git_repo("moved-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");

    let device = device("moved");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    let destination = remote_path.to_string_lossy().to_string();
    super::once(&device.repo, &device.vault, &destination).expect("first sync");

    // The remote moves its default to a new branch; we keep syncing `main`.
    commit_onto(
        &remote,
        "refs/heads/notes",
        &[("other.md", b"x\n")],
        &[],
        "other",
    );
    set_head(&remote_path, "notes");
    let notes_tip = ref_value(&remote, "refs/heads/notes");
    write(&device, "ours.md", "two\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "two").expect("recorded");
    super::once(&device.repo, &device.vault, &destination).expect("second sync");

    // The push landed on `main`, the bound branch; `notes` never moved.
    let remote_main = ref_value(&remote, "refs/heads/main").expect("main still exists");
    let mut tree = remote.find_commit(remote_main).unwrap().tree().unwrap();
    assert!(
        tree.peel_to_entry_by_path("ours.md").unwrap().is_some(),
        "push went to the bound branch"
    );
    assert_eq!(ref_value(&remote, "refs/heads/notes"), notes_tip);
    assert_eq!(
        history_source::bound_remote(
            &device.repo,
            &history_ingest::remote_source_ref(&destination)
        )
        .unwrap(),
        Some("refs/heads/main".to_string())
    );
}

#[test]
fn a_deleted_remote_branch_is_an_error_not_a_recreate() {
    let (remote_path, remote) = git_repo("gone-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");

    let device = device("gone");
    write(&device, "ours.md", "one\n");
    let destination = remote_path.to_string_lossy().to_string();
    super::once(&device.repo, &device.vault, &destination).expect("first sync");

    // Someone deletes the branch on the remote. The binding stays; the next
    // sync reports the branch is gone rather than silently making a new one.
    fs::remove_file(remote_path.join("refs/heads/main")).unwrap();
    let error = super::once(&device.repo, &device.vault, &destination)
        .expect_err("the missing branch fails");
    assert_eq!(error.code, "sync.branch_missing");
}

#[test]
fn a_detached_checkout_blocks_the_sync_but_not_the_history() {
    let (vault, clone) = clone_on("main");
    let tip = ref_value(&clone, "refs/heads/main").unwrap();
    fs::write(vault.join(".git").join("HEAD"), format!("{tip}\n")).unwrap();

    let (remote_path, remote) = git_repo("detached-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");
    let device = device("detached");
    write(&device, "ours.md", "one\n");
    snapshot::record(
        &device.repo,
        &[Path::new("ours.md").to_path_buf()],
        "recorded",
    )
    .expect("recorded");

    let error = super::once(&device.repo, &vault, &remote_path.to_string_lossy())
        .expect_err("detached blocks the sync");
    assert_eq!(error.code, "sync.branch_detached");

    // History is unaffected by the sync-side refusal.
    assert_eq!(history::read(&device.repo, None, 10).unwrap().len(), 1);
}

#[test]
fn a_rewritten_remote_is_refused_before_anything_joins() {
    let (remote_path, remote) = git_repo("rewrite-remote", true);
    commit_into(&remote, &[("a.md", b"remote\n")], None, "remote one");

    let device = device("rewrite");
    write(&device, "ours.md", "one\n");
    let destination = remote_path.to_string_lossy().to_string();
    super::once(&device.repo, &device.vault, &destination).expect("first sync joins");

    // The remote is rewritten onto an unrelated root -- a reclone or a swap.
    let link_ref = history_ingest::remote_source_ref(&destination);
    let old_root = ref_value(&device.repo, &link_ref);
    let old_remote = ref_value(&device.repo, REMOTE_REF);
    commit_onto(
        &remote,
        "refs/heads/other",
        &[("a.md", b"foreign\n")],
        &[],
        "foreign",
    );
    fs::remove_file(remote_path.join("refs/heads/main")).unwrap();
    // Rewrite main to the unrelated commit.
    let foreign = ref_value(&remote, "refs/heads/other").unwrap();
    remote
        .reference(
            "refs/heads/main",
            foreign,
            gix::refs::transaction::PreviousValue::Any,
            "rewrite",
        )
        .unwrap();

    write(&device, "ours.md", "two\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "local")
        .expect("recorded");
    let joined = snapshot::head_commit(&device.repo).unwrap();

    let error = super::once(&device.repo, &device.vault, &destination)
        .expect_err("the unrelated remote is refused");
    assert_eq!(error.code, "sync.unrelated_history");

    // Nothing joined: our history, the vault, and the remote are untouched.
    assert_eq!(snapshot::head_commit(&device.repo).unwrap(), joined);
    assert_eq!(read(&device, "ours.md"), "two\n");
    assert_eq!(ref_value(&remote, "refs/heads/main"), Some(foreign));
    // The refusal ran before anything remembered the fetched graph: the
    // source ref still names the old root, no archive was written, the
    // remote marker never moved, and the active source was never switched
    // to history this workspace refused.
    assert_eq!(ref_value(&device.repo, &link_ref), old_root);
    assert_eq!(ref_value(&device.repo, REMOTE_REF), old_remote);
    let retained: Vec<_> = {
        let platform = device.repo.references().unwrap();
        platform
            .prefixed("refs/thinkbrain/sources/retained/")
            .unwrap()
            .filter_map(|r| r.ok())
            .map(|r| r.name().as_bstr().to_string())
            .collect()
    };
    assert!(retained.is_empty(), "a rejected graph archives nothing");
}

#[test]
fn a_switched_checkout_blocks_the_sync_but_keeps_history() {
    let (remote_path, remote) = git_repo("switch-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");

    let (vault, clone) = clone_on("main");
    let device = device("switch");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    super::once(&device.repo, &vault, &remote_path.to_string_lossy()).expect("first sync");

    // The user checks out a different branch of the clone; the bound remote
    // branch still names `main`, so syncing must stop rather than cross them.
    let main = ref_value(&clone, "refs/heads/main").unwrap();
    commit_onto(
        &clone,
        "refs/heads/notes",
        &[("n.md", b"x\n")],
        &[main],
        "on notes",
    );
    set_head(&vault, "notes");

    let error = super::once(&device.repo, &vault, &remote_path.to_string_lossy())
        .expect_err("a switched checkout blocks the sync");
    assert_eq!(error.code, "sync.branch_changed");
    assert_eq!(
        history::read(&device.repo, Some("ours.md"), 10)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_checkout_switched_mid_sync_never_pushes() {
    use super::super::engine::SyncPhase;

    let (remote_path, remote) = git_repo("midway-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");

    let (vault, clone) = clone_on("main");
    let device = device("midway");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    let destination = remote_path.to_string_lossy().to_string();
    super::once(&device.repo, &vault, &destination).expect("first sync binds");
    let pushed = ref_value(&remote, "refs/heads/main").expect("the first sync pushed");

    // Between fetch and push the user switches away. The phase callback is
    // deterministic: it detaches HEAD the moment Sending begins.
    let tip = ref_value(&clone, "refs/heads/main").unwrap();
    write(&device, "ours.md", "two\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "two").expect("recorded");
    let detached = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = detached.clone();
    let head_file = vault.join(".git").join("HEAD");
    let error = super::run_trip(
        &device.repo,
        &vault,
        &destination,
        None,
        super::PushPolicy::Required,
        move |phase| {
            if phase == SyncPhase::Sending && !flag.swap(true, std::sync::atomic::Ordering::SeqCst)
            {
                fs::write(&head_file, format!("{tip}\n")).unwrap();
            }
        },
    )
    .expect_err("the switched checkout blocks the push");

    assert_eq!(error.code, "sync.branch_detached");
    // The remote is exactly as the first sync left it: nothing went up.
    assert_eq!(
        ref_value(&remote, "refs/heads/main"),
        Some(pushed),
        "the blocked sync still pushed"
    );
}

#[test]
fn a_git_dir_appearing_late_is_adopted_only_when_it_agrees() {
    let (remote_path, remote) = git_repo("late-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");
    let destination = remote_path.to_string_lossy().to_string();

    let device = device("late");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    // The vault has no .git when the binding is made.
    super::once(&device.repo, &device.vault, &destination).expect("first sync");

    // A clone checked out on a *different* branch shows up afterwards.
    let (other_path, other) = git_repo("late-clone-other", false);
    commit_onto(
        &other,
        "refs/heads/other",
        &[("o.md", b"x\n")],
        &[],
        "other",
    );
    fs::write(
        other_path.join(".git").join("HEAD"),
        "ref: refs/heads/other\n",
    )
    .unwrap();
    fs::rename(other_path.join(".git"), device.vault.join(".git")).unwrap();

    let error = super::once(&device.repo, &device.vault, &destination)
        .expect_err("a checkout disagreeing with the binding is refused");
    assert_eq!(error.code, "sync.branch_changed");
}

#[test]
fn a_git_dir_appearing_late_is_adopted_when_it_agrees() {
    let (remote_path, remote) = git_repo("agree-remote", true);
    commit_into(&remote, &[("a.md", b"one\n")], None, "one");
    let destination = remote_path.to_string_lossy().to_string();

    let device = device("agree");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    super::once(&device.repo, &device.vault, &destination).expect("first sync");

    // A clone on the matching branch is adopted into the binding.
    let (clone_path, _clone) = clone_on("main");
    fs::rename(clone_path.join(".git"), device.vault.join(".git")).unwrap();

    write(&device, "ours.md", "two\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "two").expect("recorded");
    super::once(&device.repo, &device.vault, &destination).expect("sync proceeds");

    let link_ref = history_ingest::remote_source_ref(&destination);
    assert_eq!(
        history_source::bound_local(&device.repo, &link_ref).unwrap(),
        Some("refs/heads/main".to_string())
    );
    assert_ne!(ref_value(&remote, "refs/heads/main"), None);
}

#[test]
fn an_empty_new_destination_is_not_blocked_by_another_links_history() {
    // The marker that says "the bound branch existed" belongs to its
    // destination: a different link that fetched a real tip proves nothing
    // about a fresh remote, which must still initialize rather than report
    // the branch deleted.
    let (path_a, remote_a) = git_repo("first-link-remote", true);
    commit_into(&remote_a, &[("a.md", b"theirs\n")], None, "remote one");
    let destination_a = path_a.to_string_lossy().to_string();
    let device = device("fresh");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");

    // The first link joins our records with A's real tip, leaving a durable
    // per-link source ref behind -- the marker the old shared ref got wrong.
    super::once(&device.repo, &device.vault, &destination_a).expect("first sync joins");
    let main_a = ref_value(&remote_a, "refs/heads/main").expect("A has a real tip");

    // A second, never-fetched destination still initializes: its empty
    // remote answers unborn, and no other link's history turns that into
    // "the branch was deleted".
    let (path_b, remote_b) = git_repo("second-link-remote", true);
    let destination_b = path_b.to_string_lossy().to_string();
    super::once(&device.repo, &device.vault, &destination_b)
        .expect("the new destination initializes");

    // The pushed tip is the same commit both links now point at; A was not
    // touched by B's first sync.
    assert_eq!(
        ref_value(&remote_b, "refs/heads/main"),
        Some(main_a),
        "the new link did not publish the local tip"
    );
    assert_eq!(ref_value(&remote_a, "refs/heads/main"), Some(main_a));
    let link_b = history_ingest::remote_source_ref(&destination_b);
    assert_eq!(
        history_source::bound_remote(&device.repo, &link_b).expect("binding"),
        Some("refs/heads/main".to_string())
    );
}

#[test]
fn a_remote_default_pointing_nowhere_on_a_populated_remote_fails() {
    let (remote_path, remote) = git_repo("dangling-remote", true);
    // `other` exists, but HEAD names a branch nobody created: a dangling
    // default on a populated remote is an actionable error, not a guess.
    commit_onto(
        &remote,
        "refs/heads/other",
        &[("a.md", b"x\n")],
        &[],
        "other",
    );
    fs::write(remote_path.join("HEAD"), "ref: refs/heads/gone\n").unwrap();

    let device = device("dangling");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");

    let error = super::once(&device.repo, &device.vault, &remote_path.to_string_lossy())
        .expect_err("a dangling default fails");
    assert_eq!(error.code, "sync.branch_unknown");
    assert_eq!(ref_value(&remote, "refs/heads/main"), None);
}

/// A fresh hosting repo whose default was renamed before its first commit:
/// HEAD names `trunk`, no refs exist. The unborn default is still the branch
/// the link binds and pushes to -- `main` must never appear.
#[test]
fn an_unborn_non_main_default_is_bound_and_pushed() {
    let (remote_path, remote) = git_repo("unborn-remote", true);
    set_head(&remote_path, "trunk");

    let device = device("unborn");
    write(&device, "ours.md", "one\n");
    snapshot::record(&device.repo, &[Path::new("ours.md").to_path_buf()], "ours")
        .expect("recorded");
    let destination = remote_path.to_string_lossy().to_string();
    super::once(&device.repo, &device.vault, &destination).expect("the sync succeeds");

    assert_eq!(
        ref_value(&remote, "refs/heads/trunk"),
        snapshot::head_commit(&device.repo).expect("a head"),
        "the push did not create the unborn default"
    );
    assert_eq!(ref_value(&remote, "refs/heads/main"), None);
    let link_ref = history_ingest::remote_source_ref(&destination);
    assert_eq!(
        history_source::bound_remote(&device.repo, &link_ref).expect("binding"),
        Some("refs/heads/trunk".to_string())
    );
}
