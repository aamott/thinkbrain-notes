use super::super::hidden_repo;
use super::*;
use crate::commands::sync::snapshot;
use crate::commands::sync::snapshot::HISTORY_REF as BRANCH;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::{Path, PathBuf};

struct Fixture {
    vault: PathBuf,
    repo: gix::Repository,
}

fn fixture(name: &str) -> Fixture {
    let vault = make_temp_test_dir(&format!("{name}-vault"), "push", true);
    let git_dir = make_temp_test_dir(&format!("{name}-gitdir"), "push", true);
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

/// Records the vault's current state, and answers with the commit it made.
fn record(f: &Fixture, message: &str, paths: &[&str]) -> gix::ObjectId {
    let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    snapshot::record(&f.repo, &paths, message).expect("the change is recorded");
    head(f)
}

fn head(f: &Fixture) -> gix::ObjectId {
    snapshot::head_commit(&f.repo)
        .expect("the branch is readable")
        .expect("something has been recorded")
}

/// A bare repository standing in for the one someone would push to.
fn remote(name: &str) -> PathBuf {
    let path = make_temp_test_dir(&format!("{name}-remote"), "push", true);
    gix::init_bare(&path).expect("the remote repository is created");
    path
}

fn link(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn remote_tip(path: &Path, reference: &str) -> Option<gix::ObjectId> {
    let repo = gix::open(path).expect("the remote opens");
    repo.try_find_reference(reference)
        .expect("the remote's refs are readable")
        .map(|mut found| {
            found
                .peel_to_id()
                .expect("the ref points at an object")
                .detach()
        })
}

/// Everything the remote can actually read, which is the only proof that a
/// pack arrived whole: an object whose contents are missing still has a name.
fn readable_objects(path: &Path, tip: gix::ObjectId) -> usize {
    let repo = gix::open(path).expect("the remote opens");
    let mut seen = std::collections::BTreeSet::new();
    let mut trees = Vec::new();
    for commit in repo
        .find_commit(tip)
        .expect("the tip is readable")
        .ancestors()
        .all()
        .expect("the history walks")
    {
        let commit = commit.expect("the walk succeeds").id;
        seen.insert(commit);
        trees.push(
            repo.find_commit(commit)
                .expect("every commit in the history is readable")
                .tree_id()
                .expect("a commit names a tree")
                .detach(),
        );
    }
    while let Some(tree) = trees.pop() {
        if !seen.insert(tree) {
            continue;
        }
        for entry in repo.find_tree(tree).expect("every tree is readable").iter() {
            let entry = entry.expect("the tree decodes");
            let id = entry.oid().to_owned();
            if entry.mode().is_tree() {
                trees.push(id);
            } else if seen.insert(id) {
                repo.find_object(id).expect("every blob is readable");
            }
        }
    }
    seen.len()
}

// ---------------------------------------------------------------------------
// Which objects go
// ---------------------------------------------------------------------------

#[test]
fn a_first_push_carries_the_whole_history() {
    let f = fixture("push-carry-first");
    write(&f.vault, "one.md", "first\n");
    record(&f, "one", &["one.md"]);
    write(&f.vault, "journal/two.md", "second\n");
    let tip = record(&f, "two", &["journal/two.md"]);

    let carried = carried(&f.repo, tip, None).expect("the objects are counted");

    // Two commits, three trees (two roots and the journal folder), two blobs.
    assert_eq!(carried.len(), 7, "carried: {carried:?}");
}

#[test]
fn a_later_push_carries_only_what_changed() {
    let f = fixture("push-carry-later");
    write(&f.vault, "one.md", "first\n");
    let first = record(&f, "one", &["one.md"]);
    write(&f.vault, "two.md", "second\n");
    let second = record(&f, "two", &["two.md"]);

    let carried = carried(&f.repo, second, Some(first)).expect("the objects are counted");

    // The new commit, its root tree, and the one new note. The first note's
    // blob is already there and must not be sent again.
    assert_eq!(carried.len(), 3, "carried: {carried:?}");
}

#[test]
fn a_remote_already_at_our_tip_needs_nothing() {
    let f = fixture("push-carry-none");
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);

    assert!(carried(&f.repo, tip, Some(tip))
        .expect("the objects are counted")
        .is_empty());
}

/// A commit whose note went back to an earlier wording reuses that earlier
/// blob, so the object set has to be a set — sending a duplicate is a corrupt
/// pack, not a wasted byte.
#[test]
fn an_object_that_appears_twice_is_carried_once() {
    let f = fixture("push-carry-dedup");
    write(&f.vault, "one.md", "first\n");
    record(&f, "one", &["one.md"]);
    write(&f.vault, "one.md", "second\n");
    record(&f, "two", &["one.md"]);
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "three", &["one.md"]);

    let carried = carried(&f.repo, tip, None).expect("the objects are counted");
    let unique: std::collections::BTreeSet<_> = carried.iter().collect();

    assert_eq!(unique.len(), carried.len(), "an object was carried twice");
}

/// A remote can advertise a commit this repository has never seen — that is
/// what a diverged remote looks like — and a walk cannot hide behind an object
/// it cannot reach.
#[test]
fn a_remote_tip_we_have_never_seen_is_not_fatal() {
    let f = fixture("push-carry-unknown");
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);
    let elsewhere = fixture("push-carry-unknown-other");
    write(&elsewhere.vault, "theirs.md", "not ours\n");
    let unknown = record(&elsewhere, "theirs", &["theirs.md"]);

    let carried = carried(&f.repo, tip, Some(unknown)).expect("the objects are counted");

    assert_eq!(carried.len(), 3, "carried: {carried:?}");
}

// ---------------------------------------------------------------------------
// The exchange
// ---------------------------------------------------------------------------

#[test]
fn a_push_into_an_empty_remote_lands_the_whole_history() {
    let f = fixture("push-empty");
    let remote = remote("push-empty");
    write(&f.vault, "one.md", "first\n");
    record(&f, "one", &["one.md"]);
    write(&f.vault, "journal/two.md", "second\n");
    let tip = record(&f, "two", &["journal/two.md"]);

    let sent = send(&f.repo, &link(&remote), BRANCH, tip).expect("the push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(
        remote_tip(&remote, BRANCH),
        Some(tip),
        "the remote's branch did not move"
    );
    assert_eq!(
        readable_objects(&remote, tip),
        7,
        "the remote cannot read everything we sent it"
    );
}

#[test]
fn a_second_push_sends_only_what_changed() {
    let f = fixture("push-second");
    let remote = remote("push-second");
    write(&f.vault, "one.md", "first\n");
    let first = record(&f, "one", &["one.md"]);
    send(&f.repo, &link(&remote), BRANCH, first).expect("the first push succeeds");

    write(&f.vault, "two.md", "second\n");
    let second = record(&f, "two", &["two.md"]);
    let sent = send(&f.repo, &link(&remote), BRANCH, second).expect("the second push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(
        sent.objects, 3,
        "the second push resent objects the remote had"
    );
    assert_eq!(remote_tip(&remote, BRANCH), Some(second));
}

#[test]
fn a_push_with_nothing_to_add_is_not_an_error() {
    let f = fixture("push-idempotent");
    let remote = remote("push-idempotent");
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);
    send(&f.repo, &link(&remote), BRANCH, tip).expect("the first push succeeds");

    let sent =
        send(&f.repo, &link(&remote), BRANCH, tip).expect("pushing the same tip again succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(sent.objects, 0);
}

/// Someone else pushed between our fetch and our push. That is not a fault to
/// report — it is the remote telling us to catch up, and the caller has to be
/// able to tell it apart from a broken connection to know to try again.
#[test]
fn a_push_whose_remote_moved_underneath_it_is_refused() {
    let f = fixture("push-stale");
    let remote = remote("push-stale");
    write(&f.vault, "one.md", "first\n");
    let shared = record(&f, "one", &["one.md"]);
    send(&f.repo, &link(&remote), BRANCH, shared).expect("the first push succeeds");

    // The other device's work, built on what we both had, and already landed.
    write(&f.vault, "theirs.md", "from the other device\n");
    let theirs = record(&f, "theirs", &["theirs.md"]);
    send(&f.repo, &link(&remote), BRANCH, theirs).expect("the other device's push succeeds");

    // Ours, built on the same shared commit and knowing nothing of theirs. What
    // it holds does not matter; that it does not descend from theirs does.
    let ours = commit(&f, "ours", tree_of(&f.repo, shared), &[shared]);
    let sent =
        send(&f.repo, &link(&remote), BRANCH, ours).expect("a refusal is an answer, not a failure");

    assert!(
        matches!(sent.landed, Landed::Refused { .. }),
        "the stale push was not refused: {:?}",
        sent.landed
    );
    assert_eq!(sent.objects, 0, "a refused push sent notes anyway");
    assert_eq!(
        remote_tip(&remote, BRANCH),
        Some(theirs),
        "a refused push moved the remote anyway"
    );
}

/// Every other push test adds notes. A note someone *edited* takes the other
/// arm of the diff, and an arm nothing exercises is an arm that can be wrong.
#[test]
fn an_edited_note_arrives_as_its_new_wording() {
    let f = fixture("push-edit");
    let remote = remote("push-edit");
    write(&f.vault, "one.md", "first\n");
    let first = record(&f, "one", &["one.md"]);
    send(&f.repo, &link(&remote), BRANCH, first).expect("the first push succeeds");

    write(&f.vault, "one.md", "rewritten\n");
    let second = record(&f, "one again", &["one.md"]);
    let sent = send(&f.repo, &link(&remote), BRANCH, second).expect("the second push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(note_at(&remote, second, "one.md"), "rewritten\n");
}

/// A note that went away needs nothing sent for it, and must not take the
/// history that mentions it down with it.
#[test]
fn a_deleted_note_pushes_without_sending_anything_for_it() {
    let f = fixture("push-delete");
    let remote = remote("push-delete");
    write(&f.vault, "one.md", "first\n");
    write(&f.vault, "two.md", "second\n");
    let first = record(&f, "both", &["one.md", "two.md"]);
    send(&f.repo, &link(&remote), BRANCH, first).expect("the first push succeeds");

    fs::remove_file(f.vault.join("two.md")).expect("the note is deleted");
    let second = record(&f, "one gone", &["two.md"]);
    let sent = send(&f.repo, &link(&remote), BRANCH, second).expect("the second push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    // The commit and its new root tree, and nothing standing in for the note.
    assert_eq!(
        sent.objects, 2,
        "something was sent for a note that went away"
    );
    assert_eq!(note_at(&remote, second, "one.md"), "first\n");
}

/// What the remote can actually read at `path`, as of `commit`.
fn note_at(remote: &Path, commit: gix::ObjectId, path: &str) -> String {
    let repo = gix::open(remote).expect("the remote opens");
    let blob = repo
        .find_commit(commit)
        .expect("the commit is readable")
        .tree()
        .expect("the tree is readable")
        .peel_to_entry_by_path(path)
        .expect("the tree can be searched")
        .expect("the note is in the tree")
        .object()
        .expect("the note's contents are readable");
    String::from_utf8(blob.data.clone()).expect("the note is text")
}

/// A server can refuse for reasons no local check can predict: a protected
/// branch, a hook, a repository with that branch checked out. Our own
/// fast-forward check catches none of those, so without this the whole
/// report-reading path is unproved — and reading a refusal as success would
/// tell someone their writing is safe somewhere it never arrived.
#[test]
fn a_refusal_from_the_far_side_is_not_read_as_success() {
    let f = fixture("push-refused-there");
    let path = make_temp_test_dir("push-refused-there-remote", "push", true);
    let there = gix::init(&path).expect("the remote repository is created");
    let checked_out = there
        .head_name()
        .expect("HEAD is readable")
        .expect("HEAD names a branch")
        .as_bstr()
        .to_string();
    // A working copy is on that branch, so git will not let anyone move it.
    fs::write(
        path.join(".git/config"),
        format!(
            "{}\n[receive]\n\tdenyCurrentBranch = refuse\n",
            fs::read_to_string(path.join(".git/config")).expect("the remote has a config")
        ),
    )
    .expect("the remote is configured");

    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);

    let sent = send(&f.repo, &link(&path), &checked_out, tip).expect("a refusal is an answer");

    assert!(
        matches!(sent.landed, Landed::Refused { .. }),
        "the far side refused and we called it a success: {:?}",
        sent.landed
    );
}

#[test]
fn a_remote_that_requests_credentials_is_not_called_unreachable() {
    let error = handshake_failure(gix::protocol::handshake::Error::EmptyCredentials);

    assert_eq!(error.code, "sync.auth_required");
}

#[test]
fn http_auth_statuses_are_not_called_unreachable() {
    for status in [401, 403] {
        let transport = transport::client::Error::Io(std::io::Error::other(format!(
            "Received HTTP status {status}"
        )));
        let error = handshake_failure(gix::protocol::handshake::Error::Transport(transport));

        assert_eq!(error.code, "sync.auth_required", "status {status}");
    }
}

/// Merges are where an incomplete object set hides: the second parent's
/// objects are not in any first-parent diff, so a history with a merge in it
/// is the case that proves the walk, not the diff, decides what goes.
#[test]
fn a_history_with_a_merge_pushes_completely() {
    let f = fixture("push-merge");
    let remote = remote("push-merge");
    write(&f.vault, "one.md", "first\n");
    let base = record(&f, "one", &["one.md"]);

    // A second line of work, recorded but never on the branch.
    write(&f.vault, "side.md", "on the side\n");
    let side = record(&f, "side", &["side.md"]);

    write(&f.vault, "main.md", "on the branch\n");
    let mainline = commit(
        &f,
        "mainline",
        tree_of(&f.repo, record(&f, "main", &["main.md"])),
        &[base],
    );
    let merged = commit(&f, "merged", tree_of(&f.repo, side), &[mainline, side]);

    let sent = send(&f.repo, &link(&remote), BRANCH, merged).expect("the push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(remote_tip(&remote, BRANCH), Some(merged));
    // Proves every object is readable on the far side, merge parent included.
    readable_objects(&remote, merged);
}

/// Writes a commit with any number of parents, which `snapshot` cannot: it
/// only ever records a single line of history.
fn commit(
    f: &Fixture,
    message: &str,
    tree: gix::ObjectId,
    parents: &[gix::ObjectId],
) -> gix::ObjectId {
    let who = gix::actor::Signature {
        name: "ThinkBrain Notes".into(),
        email: "sync@thinkbrain.notes".into(),
        time: gix::date::Time::now_utc(),
    };
    // Written as an object and left off the branch: `commit_as` would insist
    // the branch already points at the first parent, and a merge's does not.
    f.repo
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
        .detach()
}

fn tree_of(repo: &gix::Repository, commit: gix::ObjectId) -> gix::ObjectId {
    repo.find_commit(commit)
        .expect("the commit is readable")
        .tree_id()
        .expect("a commit names a tree")
        .detach()
}

/// A folder inside the vault with its own `.git` is recorded by git as a
/// gitlink: an entry whose id names a commit in *someone else's* repository,
/// which this one has never had and cannot send. Real git skips these when it
/// works out what a pack must carry, and so must we — otherwise one such entry
/// anywhere in the history makes every push from then on fail outright.
#[test]
fn a_folder_with_its_own_repository_does_not_break_the_push() {
    let f = fixture("push-gitlink");
    let remote = remote("push-gitlink");
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);

    // A commit id from somewhere else entirely; nothing here can resolve it.
    let elsewhere = fixture("push-gitlink-other");
    write(&elsewhere.vault, "theirs.md", "not ours\n");
    let foreign = record(&elsewhere, "theirs", &["theirs.md"]);

    let mut editor = f
        .repo
        .edit_tree(tree_of(&f.repo, tip))
        .expect("the tree opens for editing");
    editor
        .upsert("reference", gix::object::tree::EntryKind::Commit, foreign)
        .expect("the gitlink entry is added");
    let tree = editor.write().expect("the tree is written").detach();
    let with_gitlink = commit(&f, "a folder of its own", tree, &[tip]);

    let sent = send(&f.repo, &link(&remote), BRANCH, with_gitlink).expect("the push succeeds");

    assert_eq!(sent.landed, Landed::Moved);
    assert_eq!(remote_tip(&remote, BRANCH), Some(with_gitlink));
}

/// The restore points are ours. They are not a branch, and a push that swept
/// them up would put someone's undo history on a server they never chose.
#[test]
fn the_checkpoint_ref_is_never_sent() {
    let f = fixture("push-checkpoint");
    let remote = remote("push-checkpoint");
    write(&f.vault, "one.md", "first\n");
    let tip = record(&f, "one", &["one.md"]);
    snapshot::checkpoint(
        &f.repo,
        &[PathBuf::from("one.md")],
        snapshot::Reason::VersionRestored,
    )
    .expect("the checkpoint is written");

    send(&f.repo, &link(&remote), BRANCH, tip).expect("the push succeeds");

    let there = gix::open(&remote).expect("the remote opens");
    assert!(
        there
            .try_find_reference("refs/thinkbrain/checkpoints")
            .expect("the remote's refs are readable")
            .is_none(),
        "the checkpoint ref was pushed"
    );
}
