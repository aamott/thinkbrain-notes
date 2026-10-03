//! The paged, graph-aware history reader: merge ancestry, deduplication,
//! revert survival, provenance, and the stateless cursor contract.
//!
//! These build commits directly on the hidden repository's refs so ordering,
//! parents, and timestamps are fully controlled; `commit_onto` from the ingest
//! tests writes loose refs the reader then walks.

use super::super::history_ingest::{
    self,
    tests::{commit_at, commit_onto, dir_contents, git_repo},
};
use super::super::history_page::page;
use super::super::{
    history_source, snapshot,
    test_support::{engine_fixture, repo_fixture},
};
use super::*;
use gix::refs::transaction::PreviousValue;
use std::path::PathBuf;

/// Churn `n` alternating versions of `note.md` on `main` directly. Each
/// commit shares the tree except one blob, which keeps thousands of commits
/// cheap enough for the >5000-row page test.
fn churn(repo: &gix::Repository, n: usize) {
    let mut parent = None;
    for i in 0..n {
        let text: &[u8] = if i % 2 == 0 { b"even\n" } else { b"odd\n" };
        let parents = parent.into_iter().collect::<Vec<_>>();
        parent = Some(commit_onto(
            repo,
            "refs/heads/main",
            &[("note.md", text)],
            &parents,
            "turn",
        ));
    }
}

fn read_all(
    repo: &gix::Repository,
    workspace: &str,
    note: Option<&str>,
    limit: usize,
) -> Vec<Recorded> {
    let mut changes = Vec::new();
    let mut cursor = None;
    loop {
        let page =
            super::super::history_page::page(repo, workspace, note, limit, cursor.as_deref())
                .unwrap();
        assert!(!page.changes.is_empty(), "empty page with a live cursor");
        cursor = page.next_cursor;
        changes.extend(page.changes);
        if cursor.is_none() {
            return changes;
        }
    }
}

fn read_text(repo: &gix::Repository, change: &Recorded) -> String {
    let id = gix::ObjectId::from_hex(change.id.as_bytes()).unwrap();
    let mut tree = repo.find_commit(id).unwrap().tree().unwrap();
    let entry = tree.peel_to_entry_by_path("note.md").unwrap().unwrap();
    let blob = repo.find_object(entry.object_id()).unwrap();
    String::from_utf8(blob.data.clone()).unwrap()
}

#[test]
fn the_history_pages_every_version_without_duplicates() {
    let fixture = repo_fixture("pages", "history_page");
    churn(&fixture.repo, 210);
    let ws = fixture.vault.to_string_lossy().to_string();

    let mut seen = std::collections::BTreeSet::new();
    let mut cursor = None;
    let mut pages = 0;
    loop {
        let page = page(&fixture.repo, &ws, Some("note.md"), 60, cursor.as_deref()).unwrap();
        pages += 1;
        assert!(!page.changes.is_empty());
        for change in &page.changes {
            assert!(seen.insert(change.id.clone()), "a duplicated row");
        }
        match page.next_cursor {
            Some(next) => cursor = Some(next),
            None => break,
        }
    }
    assert_eq!(seen.len(), 210, "every version arrived exactly once");
    assert_eq!(pages, 4);
}

#[test]
fn the_history_passes_five_thousand_commits() {
    let fixture = repo_fixture("deep", "history_page");
    churn(&fixture.repo, 5_100);
    let ws = fixture.vault.to_string_lossy().to_string();

    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 500);
    assert_eq!(changes.len(), 5_100, "no scan cap truncates the list");
}

#[test]
fn new_commits_do_not_shift_an_existing_page() {
    let fixture = repo_fixture("stable", "history_page");
    churn(&fixture.repo, 10);
    let ws = fixture.vault.to_string_lossy().to_string();
    let first =
        super::super::history_page::page(&fixture.repo, &ws, Some("note.md"), 4, None).unwrap();

    // More recording after the cursor was minted.
    let mut tip = snapshot::head_commit(&fixture.repo).unwrap().unwrap();
    for _ in 0..3 {
        tip = commit_onto(
            &fixture.repo,
            "refs/heads/main",
            &[("note.md", b"new\n")],
            &[tip],
            "extra",
        );
    }

    let second = page(
        &fixture.repo,
        &ws,
        Some("note.md"),
        4,
        first.next_cursor.as_deref(),
    )
    .unwrap();
    let fresh: Vec<_> = read_all(&fixture.repo, &ws, Some("note.md"), 500)
        .iter()
        .map(|c| c.id.clone())
        .collect();
    // The cursor replayed the original roots: the three new commits collapse
    // to one event (equal consecutive content), so a fresh read leads with one
    // extra row and page two still starts exactly where page one ended.
    let expected: Vec<_> = fresh.iter().skip(1 + 4).take(4).cloned().collect();
    assert_eq!(
        second
            .changes
            .iter()
            .map(|c| c.id.clone())
            .collect::<Vec<_>>(),
        expected
    );
}

#[test]
fn a_cursor_survives_reopening_the_repository() {
    let fixture = repo_fixture("reopen", "history_page");
    churn(&fixture.repo, 8);
    let ws = fixture.vault.to_string_lossy().to_string();
    let git_dir = fixture.repo.git_dir().to_path_buf();
    let first =
        super::super::history_page::page(&fixture.repo, &ws, Some("note.md"), 3, None).unwrap();
    let cursor = first.next_cursor.unwrap();
    drop(fixture.repo);

    let repo = gix::open(&git_dir).unwrap();
    let second =
        super::super::history_page::page(&repo, &ws, Some("note.md"), 3, Some(&cursor)).unwrap();
    assert_eq!(second.changes.len(), 3);
    assert_ne!(second.changes[0].id, first.changes[0].id);
}

#[test]
fn cursors_refuse_other_workspaces_notes_and_forged_cursors() {
    let fixture = repo_fixture("scope", "history_page");
    churn(&fixture.repo, 6);
    let ws = fixture.vault.to_string_lossy().to_string();
    let cursor = super::super::history_page::page(&fixture.repo, &ws, Some("note.md"), 2, None)
        .unwrap()
        .next_cursor
        .unwrap();

    // A different workspace must not replay our timeline.
    let other = repo_fixture("scope2", "history_page");
    let other_ws = other.vault.to_string_lossy().to_string();
    assert_eq!(
        super::super::history_page::page(&other.repo, &other_ws, Some("note.md"), 2, Some(&cursor))
            .unwrap_err()
            .code,
        "sync.history_cursor_invalid"
    );
    // A different note scope in the same workspace must not either.
    assert_eq!(
        super::super::history_page::page(&fixture.repo, &ws, Some("other.md"), 2, Some(&cursor))
            .unwrap_err()
            .code,
        "sync.history_cursor_invalid"
    );
    assert_eq!(
        super::super::history_page::page(
            &fixture.repo,
            &ws,
            Some("note.md"),
            2,
            Some("not-a-cursor")
        )
        .unwrap_err()
        .code,
        "sync.history_cursor_invalid"
    );
}

#[test]
fn a_cursor_over_a_removed_checkpoint_reports_expired() {
    let fixture = repo_fixture("expire", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    std::fs::write(fixture.vault.join("note.md"), b"one\n").unwrap();
    snapshot::record(&fixture.repo, &[PathBuf::from("note.md")], "one").unwrap();
    std::fs::write(fixture.vault.join("note.md"), b"two\n").unwrap();
    snapshot::record(&fixture.repo, &[PathBuf::from("note.md")], "two").unwrap();
    // A checkpoint whose content differs from every recorded version, so the
    // per-note list has more than one row and a cursor exists.
    std::fs::write(fixture.vault.join("note.md"), b"held\n").unwrap();
    snapshot::checkpoint(
        &fixture.repo,
        &[PathBuf::from("note.md")],
        snapshot::Reason::VersionRestored,
    )
    .unwrap();

    let cursor = super::super::history_page::page(&fixture.repo, &ws, Some("note.md"), 1, None)
        .unwrap()
        .next_cursor
        .unwrap();
    fixture
        .repo
        .edit_reference(gix::refs::transaction::RefEdit {
            change: gix::refs::transaction::Change::Delete {
                expected: gix::refs::transaction::PreviousValue::Any,
                log: gix::refs::transaction::RefLog::AndReference,
            },
            name: snapshot::CHECKPOINT_REF.try_into().unwrap(),
            deref: false,
        })
        .unwrap();
    let error =
        super::super::history_page::page(&fixture.repo, &ws, Some("note.md"), 1, Some(&cursor))
            .unwrap_err();
    assert_eq!(error.code, "sync.history_cursor_expired");
}

#[test]
fn merge_commits_visit_shared_ancestry_once() {
    let fixture = repo_fixture("merge", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let base = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"base\n")],
        &[],
        "base",
    );
    let left = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"left\n")],
        &[base],
        "left",
    );
    // The second parent is its own version of the note -- reachable only
    // through the merge's second edge.
    let right = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"right\n")],
        &[base],
        "right",
    );
    commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"merged\n")],
        &[left, right],
        "merge",
    );

    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    let texts: Vec<_> = changes
        .iter()
        .map(|c| read_text(&fixture.repo, c))
        .collect();
    // The merge and base are fixed ends; the same-second parents order
    // deterministically by commit id.
    assert_eq!(texts.first().map(String::as_str), Some("merged\n"));
    assert_eq!(texts.last().map(String::as_str), Some("base\n"));
    let mut middle = texts[1..3].to_vec();
    middle.sort();
    assert_eq!(middle, vec!["left\n", "right\n"]);
    let ids: std::collections::BTreeSet<_> = changes.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids.len(), 4, "the shared base arrived once");
}

#[test]
fn a_merge_that_keeps_a_parents_text_is_not_a_new_version() {
    let fixture = repo_fixture("inherit", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let base = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"base\n")],
        &[],
        "base",
    );
    let left = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"left\n")],
        &[base],
        "left",
    );
    let right = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("o.md", b"r\n")],
        &[base],
        "right",
    );
    // Merge picks left's text for the note; nothing new was authored.
    commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"left\n"), ("o.md", b"r\n")],
        &[left, right],
        "merge",
    );

    let texts: Vec<_> = read_all(&fixture.repo, &ws, Some("note.md"), 20)
        .iter()
        .map(|c| read_text(&fixture.repo, c))
        .collect();
    assert_eq!(texts, vec!["left\n", "base\n"]);
}

#[test]
fn a_reverted_text_is_its_own_version_again() {
    let fixture = repo_fixture("revert", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let a = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"A\n")],
        &[],
        "a",
    );
    let b = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"B\n")],
        &[a],
        "b",
    );
    commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"A\n")],
        &[b],
        "back to a",
    );

    let texts: Vec<_> = read_all(&fixture.repo, &ws, Some("note.md"), 20)
        .iter()
        .map(|c| read_text(&fixture.repo, c))
        .collect();
    // A -> B -> A: identical blobs are never globally deduplicated.
    assert_eq!(texts, vec!["A\n", "B\n", "A\n"]);
}

#[test]
fn a_deleted_and_recreated_note_keeps_both_versions() {
    let fixture = repo_fixture("recreate", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let a = commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"one\n")],
        &[],
        "create",
    );
    // A genuine tree deletion -- the path is gone, not merely unwritten.
    let deleted = super::super::history_ingest::tests::commit_removing(
        &fixture.repo,
        &["note.md"],
        a,
        "remove",
    );
    // Recreated with the *same* bytes: the deletion between them is what
    // makes this a new version rather than dedupe fodder.
    commit_onto(
        &fixture.repo,
        "refs/heads/main",
        &[("note.md", b"one\n")],
        &[deleted],
        "recreate",
    );

    let texts: Vec<_> = read_all(&fixture.repo, &ws, Some("note.md"), 20)
        .iter()
        .map(|c| read_text(&fixture.repo, c))
        .collect();
    assert_eq!(texts, vec!["one\n", "one\n"], "delete/recreate survives");
}

#[test]
fn imported_history_is_marked_git_and_ours_local() {
    let (source_path, source) = git_repo("imported-src", false);
    commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"imported\n")],
        &[],
        "imported",
    );
    let fixture = repo_fixture("mixed", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();

    // Ingest expects the vault to contain `.git`; point it at the source.
    history_ingest::ingest_workspace_git(&fixture.repo, &source_path)
        .unwrap()
        .expect("the source was imported");
    history_source::activate(&fixture.repo, history_ingest::WORKSPACE_SOURCE_REF).unwrap();

    std::fs::write(fixture.vault.join("note.md"), b"local\n").unwrap();
    snapshot::record(&fixture.repo, &[PathBuf::from("note.md")], "local").unwrap();

    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    let sources: Vec<_> = changes.iter().map(|c| c.source).collect();
    assert_eq!(sources, vec![Source::Local, Source::Git]);
}

#[test]
fn timestamps_and_messages_survive_skew() {
    let fixture = repo_fixture("skew", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let a = commit_at(
        &fixture.repo,
        &[("note.md", b"one\n")],
        None,
        "first",
        1_700_000_100,
    );
    // A child written with an earlier clock: original time, not arrival order.
    commit_at(
        &fixture.repo,
        &[("note.md", b"two\n")],
        Some(a),
        "second with an older clock",
        1_700_000_050,
    );
    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    assert_eq!(changes.len(), 2);
    // Original commit times order the list; both messages survive verbatim.
    assert_eq!(changes[0].message, "first");
    assert_eq!(changes[1].message, "second with an older clock");
    assert!(changes.iter().all(|c| c.at.is_some()));
}

#[test]
fn an_imported_version_still_reads_after_reopen() {
    let (source_path, source) = git_repo("reopen-src", false);
    let old = commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"old\n")],
        &[],
        "old",
    );
    commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"new\n")],
        &[old],
        "new",
    );
    let fixture = repo_fixture("reopen-imp", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    history_ingest::ingest_workspace_git(&fixture.repo, &source_path)
        .unwrap()
        .expect("the source was imported");
    history_source::activate(&fixture.repo, history_ingest::WORKSPACE_SOURCE_REF).unwrap();

    let versions = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    assert_eq!(versions.len(), 2);
    let git_dir = fixture.repo.git_dir().to_path_buf();
    let oldest = versions[1].id.clone();
    drop(fixture.repo);

    // After reopen the opaque handle still names the same bytes.
    let repo = gix::open(&git_dir).unwrap();
    let bytes = version_at(&repo, Path::new("note.md"), &oldest).unwrap();
    assert_eq!(bytes, b"old\n");
}

#[test]
fn provenance_is_pinned_when_the_source_ref_advances() {
    let (source_path, source) = git_repo("pin-src", false);
    let first = commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"one\n")],
        &[],
        "one",
    );
    commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"two\n")],
        &[first],
        "two",
    );
    let fixture = repo_fixture("pin", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    history_ingest::ingest_workspace_git(&fixture.repo, &source_path)
        .unwrap()
        .expect("imported");
    history_source::activate(&fixture.repo, history_ingest::WORKSPACE_SOURCE_REF).unwrap();

    let first_page = page(&fixture.repo, &ws, Some("note.md"), 1, None).unwrap();
    assert_eq!(first_page.changes[0].source, Source::Git);

    // The source ref fast-forwards -- correctly without retaining the old
    // tip -- between page one and page two. The captured imported root must
    // keep the remaining rows `git` anyway.
    let tip =
        super::super::snapshot::try_head_of(&fixture.repo, history_ingest::WORKSPACE_SOURCE_REF)
            .unwrap()
            .unwrap();
    commit_onto(
        &fixture.repo,
        history_ingest::WORKSPACE_SOURCE_REF,
        &[("note.md", b"three\n")],
        &[tip],
        "three",
    );

    let second = page(
        &fixture.repo,
        &ws,
        Some("note.md"),
        10,
        first_page.next_cursor.as_deref(),
    )
    .unwrap();
    assert_eq!(second.changes.len(), 1);
    assert_eq!(
        second.changes[0].source,
        Source::Git,
        "the pinned root keeps provenance"
    );
    assert_eq!(second.changes[0].message, "one");
}

#[test]
fn forged_and_malformed_cursors_are_rejected() {
    let fixture = repo_fixture("forge", "history_page");
    churn(&fixture.repo, 4);
    let ws = fixture.vault.to_string_lossy().to_string();
    let main = snapshot::head_commit(&fixture.repo)
        .unwrap()
        .unwrap()
        .to_string();

    let encode = |json: serde_json::Value| -> String {
        serde_json::to_vec(&json)
            .unwrap()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    };
    let expect_invalid = |cursor: String| {
        assert_eq!(
            page(&fixture.repo, &ws, Some("note.md"), 2, Some(&cursor))
                .unwrap_err()
                .code,
            "sync.history_cursor_invalid"
        );
    };

    // Oversized input is refused before it is decoded.
    expect_invalid("ab".repeat(70 * 1024));
    // Odd-length and non-hex encodings.
    expect_invalid("abc".to_string());
    // An offset beyond what the captured roots can produce is not a page.
    expect_invalid(encode(serde_json::json!({
        "v": 1, "ws": ws, "note": "note.md",
        "roots": {"main": main.clone()},
        "next": 9999
    })));
    // Unknown fields and wrong root payloads fail strict decoding.
    expect_invalid(encode(serde_json::json!({
        "v": 1, "ws": ws, "note": "note.md",
        "roots": {"main": main, "surprise": "x"},
        "next": 0
    })));
    expect_invalid(encode(serde_json::json!({
        "v": 1, "ws": ws, "note": "note.md",
        "roots": {"main": "not-a-hex-id"},
        "next": 0
    })));
    // Wrong version.
    expect_invalid(encode(serde_json::json!({
        "v": 99, "ws": ws, "note": "note.md",
        "roots": {},
        "next": 0
    })));
}

#[test]
fn unrepresentable_and_negative_times_read_as_null_not_panic() {
    let fixture = repo_fixture("extreme", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let huge = commit_at(
        &fixture.repo,
        &[("note.md", b"huge\n")],
        None,
        "from the far future",
        i64::MAX,
    );
    commit_at(
        &fixture.repo,
        &[("note.md", b"old\n")],
        Some(huge),
        "before the epoch",
        -5,
    );

    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    assert_eq!(changes.len(), 2);
    assert_eq!(changes[0].message, "from the far future");
    assert_eq!(changes[0].at, None, "i64::MAX seconds overflows millis");
    assert_eq!(changes[1].message, "before the epoch");
    assert_eq!(changes[1].at, None, "negative seconds cannot be millis");
    // The same math is shared by the ledger.
    let ledger = read_all(&fixture.repo, &ws, None, 20);
    assert!(ledger.iter().all(|c| c.at.is_none()));
    assert_eq!(ledger[0].message, "from the far future");
}

#[test]
fn imported_versions_compare_and_restore_after_reopen_and_removal() {
    let (source_path, source) = git_repo("restore-src", false);
    let old = commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"old\n")],
        &[],
        "old",
    );
    commit_onto(
        &source,
        "refs/heads/main",
        &[("note.md", b"new\n")],
        &[old],
        "new",
    );
    let fixture = engine_fixture("restore-imp");
    let before = dir_contents(&source_path.join(".git"));
    history_ingest::ingest_workspace_git(&fixture.engine.repository(), &source_path)
        .unwrap()
        .expect("imported");
    history_source::activate(
        &fixture.engine.repository(),
        history_ingest::WORKSPACE_SOURCE_REF,
    )
    .unwrap();

    // Reopen: a fresh repository handle and a fresh engine over it.
    let repo = gix::open(fixture.engine.repository().git_dir()).unwrap();
    let engine = super::super::engine::Engine::new(repo, true);
    let ws = fixture.vault.to_string_lossy().to_string();
    let versions = read_all(&engine.repository(), &ws, Some("note.md"), 20);
    assert_eq!(versions.len(), 2);
    assert!(versions.iter().all(|v| v.source == Source::Git));

    // Compare against the imported version, then change disk and restore.
    std::fs::write(fixture.vault.join("note.md"), b"current\n").unwrap();
    let diff = super::diff_version(&engine, "note.md", &versions[1].id, None).unwrap();
    assert_eq!(diff.text.expect("a text diff").recorded, "old\n");
    let restored = super::restore(&engine, "note.md", &versions[1].id).unwrap();
    assert_eq!(
        std::fs::read(fixture.vault.join("note.md")).unwrap(),
        b"old\n"
    );
    // The restore checkpoint holds what disk had before the write.
    let held = version_at(
        &engine.repository(),
        Path::new("note.md"),
        &restored.checkpoint,
    )
    .unwrap();
    assert_eq!(held, b"current\n");

    // The source repository was never written, and its disappearance cannot
    // take the imported versions with it.
    assert_eq!(dir_contents(&source_path.join(".git")), before);
    std::fs::rename(source_path.join(".git"), source_path.join(".git-moved")).unwrap();
    let still = read_all(&engine.repository(), &ws, Some("note.md"), 20);
    assert_eq!(
        still.iter().filter(|v| v.source == Source::Git).count(),
        2,
        "a vanished source keeps its versions"
    );
}

#[test]
fn successive_updates_to_one_note_are_all_in_the_ledger() {
    let fixture = repo_fixture("ledger", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();
    let mut parent = None;
    for i in 0..5 {
        let contents: &[u8] = match i {
            0 => b"v0\n",
            1 => b"v1\n",
            2 => b"v2\n",
            3 => b"v3\n",
            _ => b"v4\n",
        };
        let parents = parent.into_iter().collect::<Vec<_>>();
        parent = Some(commit_onto(
            &fixture.repo,
            "refs/heads/main",
            &[("note.md", contents)],
            &parents,
            "edit",
        ));
    }

    let ledger = read_all(&fixture.repo, &ws, None, 20);
    // Five distinct edits on the same path are five rows, not one collapsed
    // Updated: commit-id dedup is the only dedup the ledger does.
    assert_eq!(ledger.len(), 5);
    assert!(ledger.iter().all(|c| c.message == "edit"));
    let ids: std::collections::BTreeSet<_> = ledger.iter().map(|c| c.id.clone()).collect();
    assert_eq!(ids.len(), 5);
}

/// A checkpoint's tree is partial -- it only holds what was being protected,
/// so `note.md` missing from one is not a deletion. If it were read as one,
/// it would reset dedupe between two identical versions and the imported
/// `A` below would surface as a second row.
#[test]
fn a_partial_checkpoints_absence_is_not_a_deletion() {
    let fixture = repo_fixture("partial", "history_page");
    let ws = fixture.vault.to_string_lossy().to_string();

    // Three disjoint roots, timestamped so the walk orders them our `A`,
    // the checkpoint (which never held `note.md`), the imported `A`.
    // `commit_at` publishes `refs/heads/main` every time, so the imported
    // and checkpoint commits are handed to their own refs afterwards and
    // main is put back.
    let main = commit_at(
        &fixture.repo,
        &[("note.md", b"A\n")],
        None,
        "ours",
        1_700_000_002,
    );
    let imported = commit_at(
        &fixture.repo,
        &[("note.md", b"A\n")],
        None,
        "imported",
        1_700_000_000,
    );
    let partial = commit_at(
        &fixture.repo,
        &[("other.md", b"held\n")],
        None,
        "checkpoint",
        1_700_000_001,
    );
    let repoint = |reference: &str, id: gix::ObjectId| {
        fixture
            .repo
            .reference(reference, id, PreviousValue::Any, "test")
            .expect("the ref moves");
    };
    repoint(history_ingest::WORKSPACE_SOURCE_REF, imported);
    repoint(snapshot::CHECKPOINT_REF, partial);
    repoint(snapshot::HISTORY_REF, main);

    // With no link configured the workspace-git ref is the selected source.
    // The two equal `A` versions sit on either side of the partial
    // checkpoint, which collapses to exactly one row rather than two.
    let changes = read_all(&fixture.repo, &ws, Some("note.md"), 20);
    assert_eq!(
        changes.len(),
        1,
        "absence in a partial checkpoint was read as a deletion"
    );
    assert_eq!(changes[0].id, main.to_string());
    assert_eq!(changes[0].source, Source::Local);
    assert_eq!(read_text(&fixture.repo, &changes[0]), "A\n");
}
