use super::super::history_ingest;
use super::super::history_ingest::tests::{commit_into, commit_onto, git_repo};
use super::*;
use std::fs;

fn repo() -> (gix::Repository, std::path::PathBuf, std::path::PathBuf) {
    let fixture = super::super::test_support::repo_fixture("source", "history_source");
    let git_dir = fixture.repo.git_dir().to_path_buf();
    (fixture.repo, fixture.vault, git_dir)
}

#[test]
fn the_active_source_survives_a_disappearing_workspace_git() {
    let (repo, _vault, _git_dir) = repo();
    // No source imported yet: nothing to select.
    assert_eq!(
        selected_source(&repo, None).expect("the selection reads"),
        None
    );

    // Import something and activate it, then pretend the source went away:
    // the last active ref still names the imported history.
    let (v, source) = git_repo("hs-git", false);
    commit_into(&source, &[("n.md", b"x\n")], None, "one");
    history_ingest::ingest_workspace_git(&repo, v.as_path()).expect("import");
    activate(&repo, history_ingest::WORKSPACE_SOURCE_REF).expect("activate");
    assert_eq!(
        selected_source(&repo, None).expect("selected"),
        ref_tip(&repo, history_ingest::WORKSPACE_SOURCE_REF)
    );

    // A configured link selects only its own source: a link whose ref was
    // never fetched means *no* imported source, never a stand-in from a
    // previous link.
    assert_eq!(
        selected_source(&repo, Some("/nonexistent/remote")).expect("selected"),
        None
    );
}

#[test]
fn a_new_link_never_inherits_the_previous_links_history() {
    let (repo, _vault, _git_dir) = repo();

    // An old link's imported history exists and is active.
    let old = history_ingest::remote_source_ref("/tmp/old-remote.git");
    let tip = commit_into(&repo, &[("n.md", b"x\n")], None, "one");
    repo.reference(
        old.as_str(),
        tip,
        gix::refs::transaction::PreviousValue::Any,
        "imported",
    )
    .unwrap();
    activate(&repo, &old).expect("activate");

    // With no link configured the active source still answers; with a *new*
    // link configured, that link's own (missing) source is the whole answer.
    assert_eq!(selected_source(&repo, None).expect("selected"), Some(tip));
    assert_eq!(
        selected_source(&repo, Some("/tmp/new-remote.git")).expect("selected"),
        None
    );
}

#[test]
fn bindings_persist_across_reopen() {
    let (repo, _vault, git_dir) = repo();
    let source = history_ingest::remote_source_ref("https://example.test/notes.git");
    bind(
        &repo,
        &source,
        Some("refs/heads/notes".to_string()),
        "refs/heads/trunk",
    )
    .expect("bind");

    let reopened = gix::open(&git_dir).expect("the repository reopens");
    assert_eq!(
        bound_remote(&reopened, &source).expect("binding reads"),
        Some("refs/heads/trunk".to_string())
    );
    assert_eq!(
        bound_local(&reopened, &source).expect("binding reads"),
        Some("refs/heads/notes".to_string())
    );
}

#[test]
fn a_corrupt_metadata_file_fails_loudly() {
    let (repo, _vault, git_dir) = repo();
    fs::write(git_dir.join(FILE), b"not json").unwrap();
    assert_eq!(
        selected_source(&repo, None)
            .expect_err("corrupt metadata is an error")
            .code,
        "sync.branch_source_failed"
    );
}

#[test]
fn a_metadata_file_from_another_version_fails_loudly() {
    let (repo, _vault, git_dir) = repo();
    fs::write(
        git_dir.join(FILE),
        serde_json::to_vec_pretty(&serde_json::json!({
            "version": 99,
            "bindings": {}
        }))
        .unwrap(),
    )
    .unwrap();
    assert_eq!(
        selected_source(&repo, None)
            .expect_err("another version is an error")
            .code,
        "sync.branch_source_failed"
    );
}

#[test]
fn a_symbolic_head_off_heads_reports_as_not_on_a_branch() {
    let (path, source) = git_repo("hs-symbolic-tag", false);
    commit_into(&source, &[("a.md", b"one\n")], None, "one");
    // `git symbolic-ref HEAD refs/tags/v1` is legal: the checkout is symbolic,
    // not detached, but the referent names no branch anyone can push.
    fs::write(path.join(".git").join("HEAD"), "ref: refs/tags/v1\n").unwrap();

    assert_eq!(
        checkout_branch(&path)
            .expect_err("a tag-pointing HEAD is not a branch")
            .code,
        "sync.branch_detached"
    );
}

#[test]
fn checkout_binding_reads_the_checked_out_branch() {
    let (_path, source) = git_repo("hs-checkout", false);
    commit_into(&source, &[("a.md", b"one\n")], None, "one");
    assert_eq!(
        checkout_branch(_path.as_path()).expect("checkout reads"),
        Some("refs/heads/main".to_string())
    );

    // A clone on a non-default branch reports that branch.
    commit_onto(
        &source,
        "refs/heads/notes",
        &[("b.md", b"two\n")],
        &[ref_tip(&source, "refs/heads/main").unwrap()],
        "two",
    );
    fs::write(_path.join(".git").join("HEAD"), "ref: refs/heads/notes\n").unwrap();
    assert_eq!(
        checkout_branch(_path.as_path()).expect("checkout reads"),
        Some("refs/heads/notes".to_string())
    );
}

#[test]
fn a_detached_checkout_is_an_actionable_block_not_a_pick() {
    let (path, source) = git_repo("hs-detached", false);
    let tip = commit_into(&source, &[("a.md", b"one\n")], None, "one");
    fs::write(path.join(".git").join("HEAD"), format!("{tip}\n")).unwrap();

    assert_eq!(
        checkout_branch(&path).expect_err("detached fails").code,
        "sync.branch_detached"
    );
}

#[test]
fn the_remote_branch_honours_only_a_matching_upstream() {
    let (path, source) = git_repo("hs-upstream", false);
    commit_into(&source, &[("a.md", b"one\n")], None, "one");
    let link = "/tmp/some-remote.git";

    // No upstream configured: the remote branch carries the checkout's name.
    assert_eq!(
        remote_branch_for(&path, link).expect("remote branch"),
        "refs/heads/main"
    );

    // An upstream on a *different* destination does not retarget the link.
    let mut config = String::new();
    config.push_str("[branch \"main\"]\n\tremote = origin\n\tmerge = refs/heads/elsewhere\n");
    config.push_str("[remote \"origin\"]\n\turl = /tmp/a-different-place.git\n");
    fs::write(path.join(".git").join("config"), config).unwrap();
    assert_eq!(
        remote_branch_for(&path, link).expect("remote branch"),
        "refs/heads/main"
    );

    // An upstream on *this* link is honoured verbatim.
    let mut config = String::new();
    config.push_str("[branch \"main\"]\n\tremote = origin\n\tmerge = refs/heads/elsewhere\n");
    config.push_str(&format!("[remote \"origin\"]\n\turl = {link}\n"));
    fs::write(path.join(".git").join("config"), config).unwrap();
    assert_eq!(
        remote_branch_for(&path, link).expect("remote branch"),
        "refs/heads/elsewhere"
    );
}

fn ref_tip(repo: &gix::Repository, name: &str) -> Option<gix::ObjectId> {
    repo.try_find_reference(name)
        .ok()
        .flatten()
        .and_then(|mut found| found.peel_to_id().ok().map(|id| id.detach()))
}

#[test]
fn a_bind_with_invalid_names_writes_nothing() {
    let (repo, _vault, git_dir) = repo();
    let file = git_dir.join(FILE);
    bind(
        &repo,
        history_ingest::WORKSPACE_SOURCE_REF,
        None,
        "refs/heads/main",
    )
    .expect("a clean bind");
    let before = fs::read(&file).unwrap();

    // A tag is not a remote branch; a source outside our prefix is not a
    // source. Neither may be persisted.
    assert_eq!(
        bind(
            &repo,
            history_ingest::WORKSPACE_SOURCE_REF,
            None,
            "refs/tags/v1"
        )
        .expect_err("tag remote")
        .code,
        "sync.branch_unknown"
    );
    assert_eq!(
        bind(
            &repo,
            history_ingest::WORKSPACE_SOURCE_REF,
            Some("main".to_string()),
            "refs/heads/main",
        )
        .expect_err("short local")
        .code,
        "sync.branch_unknown"
    );
    assert_eq!(
        bind(&repo, "refs/heads/mine", None, "refs/heads/main",)
            .expect_err("foreign source")
            .code,
        "sync.branch_source_failed"
    );
    // A retained archive ref is not a bindable source either: binding to one
    // would let archived history become active again.
    assert_eq!(
        bind(
            &repo,
            "refs/thinkbrain/sources/retained/old/workspace-git",
            None,
            "refs/heads/main",
        )
        .expect_err("retained source")
        .code,
        "sync.branch_source_failed"
    );
    assert_eq!(
        activate(&repo, "refs/tags/v1")
            .expect_err("tag source")
            .code,
        "sync.branch_source_failed"
    );
    assert_eq!(fs::read(&file).unwrap(), before, "metadata was untouched");
}

#[test]
fn an_upstream_pointing_at_a_tag_is_an_error_not_a_branch() {
    let (path, source) = git_repo("hs-tag-upstream", false);
    commit_into(&source, &[("a.md", b"one\n")], None, "one");
    let link = "/tmp/some-remote.git";
    let config = format!(
        "[branch \"main\"]\n\tremote = origin\n\tmerge = refs/tags/v1\n[remote \"origin\"]\n\turl = {link}\n"
    );
    fs::write(path.join(".git").join("config"), config).unwrap();
    assert_eq!(
        remote_branch_for(&path, link)
            .expect_err("a tag upstream fails before any fetch")
            .code,
        "sync.branch_unknown"
    );
}
