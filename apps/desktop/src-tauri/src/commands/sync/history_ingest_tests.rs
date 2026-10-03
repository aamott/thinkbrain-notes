use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use gix::refs::transaction::PreviousValue;

use super::super::test_support::ref_value;
use super::*;
use crate::commands::sync::bootstrap::{bootstrap, hidden_repo_path};
use crate::commands::sync::hidden_repo;
use crate::commands::sync::maintain;
use crate::commands::sync::network;
use crate::commands::sync::snapshot;
use crate::tests::make_temp_test_dir;

const NAMESPACE: &str = "history-ingest";

pub(crate) fn cancel() -> Arc<AtomicBool> {
    Arc::new(AtomicBool::new(false))
}

pub(crate) fn who() -> gix::actor::Signature {
    gix::actor::Signature {
        name: "ThinkBrain Notes".into(),
        email: "sync@thinkbrain.notes".into(),
        time: gix::date::Time::new(1_700_000_000, 0),
    }
}

/// A real non-bare repository at `name`, HEAD on `refs/heads/main` regardless
/// of the platform's configured default branch.
pub(crate) fn git_repo(name: &str, bare: bool) -> (PathBuf, gix::Repository) {
    let path = make_temp_test_dir(name, NAMESPACE, true);
    let repo = if bare {
        gix::init_bare(&path).expect("the bare repository initializes")
    } else {
        gix::init(&path).expect("the repository initializes")
    };
    let head = if bare { &path } else { &path.join(".git") };
    fs::write(head.join("HEAD"), "ref: refs/heads/main\n").expect("HEAD names main");
    (path, repo)
}

/// Commits `files` onto `parent` and points `refs/heads/main` at the result.
/// Deterministic -- the same inputs in two repositories produce the same id,
/// which is what the matching-dual-source test relies on.
pub(crate) fn commit_into(
    repo: &gix::Repository,
    files: &[(&str, &[u8])],
    parent: Option<gix::ObjectId>,
    message: &str,
) -> gix::ObjectId {
    commit_onto(
        repo,
        "refs/heads/main",
        files,
        &parent.into_iter().collect::<Vec<_>>(),
        message,
    )
}

/// [`commit_into`], but the commit lands on `reference` and may carry more
/// than one parent, so merge graphs can be built.
/// The commit builder all the fixtures share: upsert `files`, remove
/// `removals`, hang off `parents`, stamp `seconds` when given, and publish
/// the result to `reference`.
fn commit_editing(
    repo: &gix::Repository,
    reference: &str,
    files: &[(&str, &[u8])],
    removals: &[&str],
    parents: &[gix::ObjectId],
    message: &str,
    seconds: Option<i64>,
) -> gix::ObjectId {
    let base = parents
        .first()
        .copied()
        .map(|tip| {
            repo.find_commit(tip)
                .expect("the parent is readable")
                .tree_id()
                .expect("a commit names a tree")
                .detach()
        })
        .unwrap_or_else(|| gix::ObjectId::empty_tree(repo.object_hash()));
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
    for path in removals {
        editor.remove(*path).expect("the path is removed");
    }
    let tree = editor.write().expect("the tree is written").detach();
    let mut who = who();
    if let Some(seconds) = seconds {
        who.time = gix::date::Time::new(seconds, 0);
    }
    let tip = repo
        .write_object(&gix::objs::Commit {
            tree,
            parents: parents.iter().copied().collect(),
            author: who.clone(),
            committer: who,
            encoding: None,
            message: message.into(),
            extra_headers: Vec::new(),
        })
        .expect("the commit is written")
        .detach();
    repo.reference(reference, tip, PreviousValue::Any, "test")
        .expect("the branch moves");
    tip
}

/// [`commit_into`] onto an arbitrary ref with an arbitrary parent list --
/// merge and non-default-branch fixtures.
pub(crate) fn commit_onto(
    repo: &gix::Repository,
    reference: &str,
    files: &[(&str, &[u8])],
    parents: &[gix::ObjectId],
    message: &str,
) -> gix::ObjectId {
    commit_editing(repo, reference, files, &[], parents, message, None)
}

/// [`commit_into`] that genuinely deletes `removals`, for recreate fixtures.
pub(crate) fn commit_removing(
    repo: &gix::Repository,
    removals: &[&str],
    parent: gix::ObjectId,
    message: &str,
) -> gix::ObjectId {
    commit_editing(
        repo,
        "refs/heads/main",
        &[],
        removals,
        &[parent],
        message,
        None,
    )
}

/// [`commit_into`] with an explicit commit time, for skewed-clock fixtures.
pub(crate) fn commit_at(
    repo: &gix::Repository,
    files: &[(&str, &[u8])],
    parent: Option<gix::ObjectId>,
    message: &str,
    seconds: i64,
) -> gix::ObjectId {
    commit_editing(
        repo,
        "refs/heads/main",
        files,
        &[],
        &parent.into_iter().collect::<Vec<_>>(),
        message,
        Some(seconds),
    )
}

/// Every file under `root`, as (relative path, bytes) -- the proof a `.git`
/// was read but never written.
pub(crate) fn dir_contents(root: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut found = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in fs::read_dir(&dir).expect("the directory is readable") {
            let path = entry.expect("the entry is readable").path();
            if path.is_dir() {
                pending.push(path);
            } else if path.is_file() {
                found.push((
                    path.strip_prefix(root).unwrap().to_path_buf(),
                    fs::read(&path).expect("the file is readable"),
                ));
            }
        }
    }
    found.sort();
    found
}

/// Opens the hidden repository `bootstrap` created for `vault`.
pub(crate) fn hidden(app_data: &Path, vault: &Path) -> gix::Repository {
    gix::open(hidden_repo_path(app_data, &vault.to_string_lossy()))
        .expect("the hidden repository opens")
}

pub(crate) fn fetch(remote: &Path, hidden: &gix::Repository) -> gix::ObjectId {
    network::fetch(hidden, &remote.to_string_lossy(), &cancel(), None)
        .expect("the fetch succeeds")
        .tip
        .expect("the remote advertises a default branch")
}

pub(crate) fn retained_ref(hidden: &gix::Repository, destination: &str) -> Option<gix::ObjectId> {
    ref_value(hidden, &remote_source_ref(destination))
}

// ---------------------------------------------------------------------------
// Local import
// ---------------------------------------------------------------------------

/// The primary local story: an established repository's whole reachable graph
/// lands in the hidden repo under its source ref, the recorded branch stays a
/// snapshot's, and the user's `.git` comes through untouched.
#[test]
fn a_vaults_own_repository_is_imported_read_only() {
    let app_data = make_temp_test_dir("local-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("local-vault", false);
    let first = commit_into(&source, &[("one.md", b"first\n")], None, "one");
    let tip = commit_into(
        &source,
        &[("one.md", b"first\n"), ("journal/two.md", b"second\n")],
        Some(first),
        "two",
    );
    // The commit objects above were written directly, so the note is put on
    // disk for the snapshot to record.
    fs::write(vault.join("one.md"), "first\n").expect("the note is on disk");
    let git_before = dir_contents(&vault.join(".git"));
    let source_refs: Vec<_> = source
        .references()
        .expect("the refs iterate")
        .all()
        .expect("the refs iterate")
        .map(|r| {
            let mut r = r.expect("the ref is readable");
            (
                r.name().as_bstr().to_string(),
                r.peel_to_id().ok().map(|id| id.detach()),
            )
        })
        .collect();

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = hidden(&app_data, &vault);
    drop(workspace);

    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(tip));
    // Everything reachable from the imported root reads back whole -- the
    // exact object set the source itself reaches.
    assert_eq!(
        collect_reachable(&hidden, tip).expect("the imported graph reads"),
        collect_reachable(&source, tip).expect("the source graph reads"),
    );
    // The recorded branch is the bootstrap's snapshot, never the import's.
    let main = snapshot::head_commit(&hidden).expect("the history is readable");
    assert!(main.is_some());
    assert_ne!(main, Some(tip), "main was grafted onto the import");
    // Their repository: every file, every ref, unchanged.
    assert_eq!(dir_contents(&vault.join(".git")), git_before);
    for (name, value) in source_refs {
        assert_eq!(
            ref_value(&source, &name),
            value,
            "their ref {name} was moved"
        );
    }
}

/// No `.git` imports nothing and is not an error.
#[test]
fn a_vault_without_git_imports_nothing() {
    let vault = make_temp_test_dir("nogit-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("nogit-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();

    assert_eq!(
        ingest_workspace_git(&hidden, &vault).expect("the ingest succeeds"),
        None
    );
}

#[test]
fn an_unborn_repository_imports_nothing() {
    let app_data = make_temp_test_dir("unborn-appdata", NAMESPACE, true);
    let (vault, _source) = git_repo("unborn-vault", false);
    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");

    assert_eq!(
        ingest_workspace_git(&workspace.repo, &vault).expect("the ingest succeeds"),
        None
    );
    assert_eq!(ref_value(&workspace.repo, WORKSPACE_SOURCE_REF), None);
}

/// "Unborn" only means no history when nothing carries commits. HEAD naming
/// an unborn branch while a sibling carries real history is a repository to
/// resolve, not one to silently skip.
#[test]
fn an_unborn_head_with_committed_siblings_is_an_error() {
    let (vault, source) = git_repo("unborn-siblings-vault", false);
    // HEAD still names unborn `main`; `other` carries a real commit.
    commit_onto(
        &source,
        "refs/heads/other",
        &[("one.md", b"one\n")],
        &[],
        "one",
    );

    let hidden_dir = make_temp_test_dir("unborn-siblings-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();

    let error = ingest_workspace_git(&hidden, &vault)
        .expect_err("an unborn HEAD over real history is not silently skipped");
    assert_eq!(error.code, "sync.git_history_unsupported");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), None);
}

/// The per-attach re-import answers from the source ref alone when the tip
/// never moved -- no decode-and-verify pass on the unchanged graph.
#[test]
fn an_unchanged_tip_is_not_imported_again() {
    let (vault, source) = git_repo("again-vault", false);
    let tip = commit_into(&source, &[("one.md", b"one\n")], None, "one");

    let hidden_dir = make_temp_test_dir("again-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();

    let first = ingest_workspace_git(&hidden, &vault)
        .expect("the ingest succeeds")
        .expect("history is imported");
    assert_eq!(first.tip, tip);
    assert!(first.objects > 0);

    let second = ingest_workspace_git(&hidden, &vault)
        .expect("the ingest succeeds")
        .expect("the source is still imported");
    assert_eq!(second.tip, tip);
    assert_eq!(second.objects, 0, "an unchanged tip re-verifies nothing");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(tip));

    // A moved tip still pays the pass -- the early-out is only for "same".
    let moved = commit_into(&source, &[("one.md", b"two\n")], Some(tip), "two");
    let third = ingest_workspace_git(&hidden, &vault)
        .expect("the ingest succeeds")
        .expect("the moved tip is imported");
    assert_eq!(third.tip, moved);
    assert!(third.objects > 0);
}

// ---------------------------------------------------------------------------
// Source selection
// ---------------------------------------------------------------------------

/// With a configured link the link is primary: no workspace source ref, and
/// the fetched graph lands under the destination-hashed ref -- where it stays
/// after the remote is gone.
#[test]
fn a_configured_link_is_the_primary_source() {
    let app_data = make_temp_test_dir("linked-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("linked-vault", false);
    commit_into(&source, &[("one.md", b"mine\n")], None, "local");

    let (remote, remote_repo) = git_repo("linked-remote", true);
    let their_tip = commit_into(&remote_repo, &[("one.md", b"theirs\n")], None, "remote");

    let workspace = bootstrap(&app_data, &vault, true).expect("bootstrap succeeds");
    assert_eq!(
        ref_value(&workspace.repo, WORKSPACE_SOURCE_REF),
        None,
        "a configured link still let the local repository in"
    );

    let tip = fetch(&remote, &workspace.repo);
    assert_eq!(tip, their_tip);
    let destination = remote.to_string_lossy().into_owned();
    let ingested = retain_fetched(&workspace.repo, &destination, tip).expect("the retain succeeds");
    assert_eq!(ingested.tip, tip);
    assert_eq!(ref_value(&workspace.repo, &ingested.reference), Some(tip));

    // The source going away changes nothing that was already retained.
    fs::remove_dir_all(&remote).expect("the remote is gone");
    let hidden = hidden(&app_data, &vault);
    assert_eq!(retained_ref(&hidden, &destination), Some(tip));
    collect_reachable(&hidden, tip).expect("the retained graph still reads");
}

/// Both `.git` and a configured link: the link wins.
#[test]
fn a_configured_link_suppresses_the_local_import() {
    let app_data = make_temp_test_dir("both-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("both-vault", false);
    commit_into(&source, &[("one.md", b"mine\n")], None, "local");

    let workspace = bootstrap(&app_data, &vault, true).expect("bootstrap succeeds");

    assert_eq!(ref_value(&workspace.repo, WORKSPACE_SOURCE_REF), None);
    assert!(
        source_tips(&workspace.repo)
            .expect("the tips read")
            .is_empty()
    );
}

// ---------------------------------------------------------------------------
// Dual sources
// ---------------------------------------------------------------------------

/// Same tip from both sources: two refs, one graph, nothing duplicated.
#[test]
fn matching_sources_share_one_graph() {
    let app_data = make_temp_test_dir("match-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("match-vault", false);
    let tip = commit_into(&source, &[("one.md", b"same\n")], None, "same");

    let (remote, remote_repo) = git_repo("match-remote", true);
    assert_eq!(
        commit_into(&remote_repo, &[("one.md", b"same\n")], None, "same"),
        tip,
        "identical commits must produce identical ids"
    );

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = hidden(&app_data, &vault);
    drop(workspace);

    let fetched = fetch(&remote, &hidden);
    let destination = remote.to_string_lossy().into_owned();
    retain_fetched(&hidden, &destination, fetched).expect("the retain succeeds");

    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(tip));
    assert_eq!(retained_ref(&hidden, &destination), Some(tip));
    assert_eq!(
        source_tips(&hidden).expect("the tips read"),
        vec![tip, tip],
        "two refs, one tip"
    );
    // One graph: the reachable set from either ref is the same object set.
    assert_eq!(collect_reachable(&hidden, tip).unwrap().len(), 3);
}

/// Unrelated roots stay unrelated: two refs, two graphs, and main untouched.
#[test]
fn unrelated_sources_keep_separate_roots() {
    let app_data = make_temp_test_dir("unrelated-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("unrelated-vault", false);
    let local_tip = commit_into(&source, &[("one.md", b"mine\n")], None, "local");

    let (remote, remote_repo) = git_repo("unrelated-remote", true);
    let remote_tip = commit_into(&remote_repo, &[("one.md", b"theirs\n")], None, "remote");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let main = snapshot::head_commit(&workspace.repo).expect("the history is readable");
    drop(workspace);

    let hidden = hidden(&app_data, &vault);
    let fetched = fetch(&remote, &hidden);
    assert_eq!(fetched, remote_tip);
    let destination = remote.to_string_lossy().into_owned();
    retain_fetched(&hidden, &destination, fetched).expect("the retain succeeds");

    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(local_tip));
    assert_eq!(retained_ref(&hidden, &destination), Some(remote_tip));
    assert_ne!(local_tip, remote_tip);
    collect_reachable(&hidden, local_tip).expect("the local graph reads");
    collect_reachable(&hidden, remote_tip).expect("the remote graph reads");
    assert_eq!(
        snapshot::head_commit(&hidden).expect("the history is readable"),
        main,
        "main was repointed at an imported root"
    );
    assert_ne!(main, Some(local_tip));
    assert_ne!(main, Some(remote_tip));
}

// ---------------------------------------------------------------------------
// Interrupted copy
// ---------------------------------------------------------------------------

pub(super) struct FailAfter(usize);
impl Interrupt for FailAfter {
    fn after_each(&self, copied: usize) -> Result<(), NativeError> {
        if copied > self.0 {
            return Err(NativeError::new("test.injected", "injected interruption"));
        }
        Ok(())
    }
}

/// A copy that dies halfway leaves loose objects but moves no ref: the old
/// source root and main both keep what they pointed at.
#[test]
fn an_interrupted_copy_moves_no_ref() {
    let app_data = make_temp_test_dir("cut-appdata", NAMESPACE, true);
    let (vault, old_source) = git_repo("cut-vault", false);
    let old_tip = commit_into(&old_source, &[("one.md", b"first\n")], None, "old");
    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    let main = snapshot::head_commit(&hidden).expect("the history is readable");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), Some(old_tip));

    // An unrelated newer graph in a second repository, so its objects are
    // genuinely new to the hidden store -- nothing is pre-deduplicated.
    let (_new_path, new_source) = git_repo("cut-new-source", false);
    let new_tip = commit_into(
        &new_source,
        &[("one.md", b"replacement\n"), ("two.md", b"new\n")],
        None,
        "new root",
    );
    let first_new_object = *collect_reachable(&new_source, new_tip)
        .expect("the new graph reads")
        .keys()
        .next()
        .expect("the new graph has objects");
    let error = retain(
        &new_source,
        &hidden,
        new_tip,
        WORKSPACE_SOURCE_REF,
        FailAfter(0),
    )
    .expect_err("the injected failure surfaces");

    assert_eq!(error.code, "test.injected");
    assert_eq!(
        ref_value(&hidden, WORKSPACE_SOURCE_REF),
        Some(old_tip),
        "the interrupted copy moved the source ref"
    );
    assert_eq!(
        snapshot::head_commit(&hidden).expect("the history is readable"),
        main,
        "the interrupted copy moved main"
    );
    // Unreachable leftovers are acceptable; maintenance reaps them. What must
    // be true is that the cut landed mid-copy at all.
    hidden
        .find_object(first_new_object)
        .expect("at least one new object was copied before the interruption");
}

// ---------------------------------------------------------------------------
// Actionable failures
// ---------------------------------------------------------------------------

#[test]
fn an_invalid_git_directory_is_reported_not_ignored() {
    let app_data = make_temp_test_dir("broken-appdata", NAMESPACE, true);
    let vault = make_temp_test_dir("broken-vault", NAMESPACE, true);
    fs::create_dir(vault.join(".git")).expect("a .git exists but is not a repository");
    fs::write(vault.join(".git").join("HEAD"), "garbage\n").expect("written");

    let error = match bootstrap(&app_data, &vault, false) {
        Err(error) => error,
        Ok(_) => panic!("a corrupt .git directory must not be ignored"),
    };

    assert_eq!(error.code, "sync.git_history_invalid");
}

#[test]
fn a_shallow_repository_is_reported_as_incomplete() {
    let (vault, source) = git_repo("shallow-vault", false);
    let tip = commit_into(&source, &[("one.md", b"only\n")], None, "only");
    fs::write(vault.join(".git/shallow"), format!("{tip}\n"))
        .expect("the shallow marker is written");
    let reopened = gix::open(&vault).expect("the repository reopens");
    assert!(reopened.is_shallow(), "the fixture is not shallow");

    let hidden_dir = make_temp_test_dir("shallow-hidden", NAMESPACE, true);
    let hidden = crate::commands::sync::hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let error = ingest_workspace_git(&hidden, &vault).expect_err("the ingest fails");

    assert_eq!(error.code, "sync.git_history_incomplete");
}

#[test]
fn a_repository_missing_an_object_is_reported_as_incomplete() {
    let (vault, source) = git_repo("missing-vault", false);
    let tip = commit_into(&source, &[("one.md", b"gone\n")], None, "one");

    // Delete the blob the commit's tree names.
    let tree = source
        .find_commit(tip)
        .unwrap()
        .tree()
        .expect("the tree decodes");
    let blob = tree
        .iter()
        .next()
        .expect("an entry")
        .expect("the entry decodes")
        .oid()
        .to_owned();
    let hex = blob.to_hex().to_string();
    fs::remove_file(vault.join(format!(".git/objects/{}/{}", &hex[..2], &hex[2..])))
        .expect("the object deletes");

    let hidden_dir = make_temp_test_dir("missing-hidden", NAMESPACE, true);
    let hidden = crate::commands::sync::hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let error = ingest_workspace_git(&hidden, &vault).expect_err("the ingest fails");

    assert_eq!(error.code, "sync.git_history_incomplete");
    assert_eq!(ref_value(&hidden, WORKSPACE_SOURCE_REF), None);
}

#[test]
fn a_detached_head_is_reported_with_a_next_step() {
    let (vault, source) = git_repo("detached-vault", false);
    let tip = commit_into(&source, &[("one.md", b"detached\n")], None, "one");
    fs::write(vault.join(".git/HEAD"), format!("{tip}\n")).expect("HEAD detaches");

    let hidden_dir = make_temp_test_dir("detached-hidden", NAMESPACE, true);
    let hidden = crate::commands::sync::hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();
    let error = ingest_workspace_git(&hidden, &vault).expect_err("the ingest fails");

    assert_eq!(error.code, "sync.git_history_unsupported");
    assert!(
        error.message.contains("default branch"),
        "the message should send the user to their default branch: {}",
        error.message
    );
}

// ---------------------------------------------------------------------------
// Source refs
// ---------------------------------------------------------------------------

/// A source ref that no longer resolves must fail loudly. Silently skipping
/// it would let maintenance collect the only retained graph while the ref
/// still claimed it.
#[test]
fn a_source_ref_pointing_at_a_missing_object_fails_loudly() {
    let vault = make_temp_test_dir("dangling-vault", NAMESPACE, true);
    let hidden_dir = make_temp_test_dir("dangling-hidden", NAMESPACE, true);
    let hidden = hidden_repo::open_or_create(&hidden_dir, &vault).unwrap();

    // A syntactically valid SHA-1 that the store does not hold. Written as a
    // loose ref file so creation itself cannot object to the dangling target.
    let name = "refs/thinkbrain/sources/gone";
    let path = hidden.git_dir().join(name);
    fs::create_dir_all(path.parent().unwrap()).expect("the ref folder exists");
    fs::write(&path, format!("{}\n", "a".repeat(40))).expect("the ref is written");

    let error = source_tips(&hidden).expect_err("a dangling source ref must fail");

    assert_eq!(error.code, "sync.git_history_invalid");
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/// An object reachable only through an imported source ref must survive
/// cleanup: it is retained history, not trash.
#[test]
fn cleanup_keeps_objects_only_an_imported_ref_reaches() {
    let app_data = make_temp_test_dir("gc-appdata", NAMESPACE, true);
    let (vault, source) = git_repo("gc-vault", false);
    let first = commit_into(&source, &[("old.md", b"old\n")], None, "one");
    // The second commit drops old.md from the tree, so its blob is reachable
    // only through the imported root commit -- never through the snapshot,
    // since the file was never on disk in this vault.
    let first_tree = source
        .find_commit(first)
        .unwrap()
        .tree_id()
        .unwrap()
        .detach();
    let mut editor = source.edit_tree(first_tree).unwrap();
    editor.remove("old.md").expect("the path is removed");
    editor
        .upsert(
            "new.md",
            gix::object::tree::EntryKind::Blob,
            source.write_blob(b"new\n").unwrap().detach(),
        )
        .expect("the path is recorded");
    let tree = editor.write().expect("the tree is written").detach();
    let who = who();
    let tip2 = source
        .write_object(&gix::objs::Commit {
            tree,
            parents: [first].into_iter().collect(),
            author: who.clone(),
            committer: who,
            encoding: None,
            message: "two".into(),
            extra_headers: Vec::new(),
        })
        .expect("the second commit is written")
        .detach();
    source
        .reference("refs/heads/main", tip2, PreviousValue::Any, "test")
        .expect("the branch moves");
    fs::write(vault.join("new.md"), "new\n").expect("the note is on disk");

    let workspace = bootstrap(&app_data, &vault, false).expect("bootstrap succeeds");
    let hidden = workspace.repo;
    let old_blob = source
        .find_commit(first)
        .unwrap()
        .tree()
        .expect("the tree decodes")
        .iter()
        .next()
        .expect("an entry")
        .expect("the entry decodes")
        .oid()
        .to_owned();

    maintain::cleanup(&hidden, 1_800_000_000, &maintain::Policy::default())
        .expect("cleanup succeeds");

    hidden
        .find_object(old_blob)
        .expect("the imported blob survived cleanup");
}
