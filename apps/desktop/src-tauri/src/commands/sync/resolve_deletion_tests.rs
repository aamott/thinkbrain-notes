use super::super::bootstrap::bootstrap;
use super::super::conflict;
use super::super::history;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;
use std::path::PathBuf;

const MARKER: &str = "note (keep or delete).md";

struct Fixture {
    vault: PathBuf,
    engine: Engine,
}

impl Fixture {
    fn view(&self) -> ConflictView {
        view(&self.vault, MARKER, None).expect("the decision is readable")
    }

    fn resolve(&self, resolution: Resolution) -> Result<Resolved, NativeError> {
        let seen = self.view();
        resolve(
            &self.engine,
            &self.vault,
            MARKER,
            &resolution,
            &seen.summary.ours.fingerprint,
            &seen.summary.theirs.fingerprint,
        )
    }

    fn read(&self, relative: &str) -> String {
        fs::read_to_string(self.vault.join(relative)).expect("the file is readable")
    }

    fn exists(&self, relative: &str) -> bool {
        self.vault.join(relative).exists()
    }
}

fn fixture(name: &str, note: &[u8]) -> Fixture {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    fs::write(vault.join("note.md"), note).expect("the note is written");
    fs::write(vault.join(MARKER), b"").expect("the marker is written");

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    Fixture {
        vault,
        engine: Engine::new(workspace.repo, workspace.has_own_git),
    }
}

fn fixture_with_other(name: &str, note: &[u8]) -> Fixture {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    fs::write(vault.join("other.md"), "untouched\n").expect("the other note is written");
    fs::write(vault.join("note.md"), note).expect("the note is written");
    fs::write(vault.join(MARKER), b"").expect("the marker is written");

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    Fixture {
        vault,
        engine: Engine::new(workspace.repo, workspace.has_own_git),
    }
}

#[test]
fn a_keep_or_delete_marker_is_presented_as_that_decision() {
    let f = fixture("resolve-del-view", b"changed text\n");

    let seen = f.view();

    assert_eq!(seen.summary.decision, Decision::KeepOrDelete);
    assert_eq!(seen.summary.ours.path, "note.md");
    assert_eq!(seen.summary.theirs.path, MARKER);
}

#[test]
fn keeping_the_note_leaves_it_and_removes_the_marker() {
    let f = fixture("resolve-del-keep", b"changed text\n");

    f.resolve(Resolution::KeepNote)
        .expect("the resolution succeeds");

    assert_eq!(f.read("note.md"), "changed text\n");
    assert!(!f.exists(MARKER));
}

#[test]
fn deleting_the_note_removes_it_after_a_checkpoint() {
    let f = fixture("resolve-del-delete", b"changed text\n");

    let done = f
        .resolve(Resolution::DeleteNote)
        .expect("the resolution succeeds");

    assert!(!f.exists("note.md"));
    assert!(!f.exists(MARKER));

    history::restore(&f.engine, "note.md", &done.checkpoint)
        .expect("the checkpoint can be restored");
    assert_eq!(f.read("note.md"), "changed text\n");
}

#[test]
fn a_keep_or_delete_decision_refuses_a_two_version_resolution() {
    let f = fixture("resolve-del-wrong", b"changed text\n");

    let refused = f
        .resolve(Resolution::KeepBoth)
        .expect_err("keep both is not a keep-or-delete action");

    assert_eq!(refused.code, "sync.not_a_conflict");
    assert!(f.exists("note.md"));
    assert!(f.exists(MARKER));
}

/// While the marker is outstanding, recording the note would send a keep
/// before anyone decided.
#[test]
fn a_pending_keep_or_delete_note_is_not_recorded() {
    let f = fixture_with_other("resolve-del-unrecorded", b"changed text\n");
    f.engine
        .note_changes([PathBuf::from("note.md")], std::time::Instant::now());
    f.engine.flush().expect("flush succeeds");

    let repo = f.engine.repository();
    let tree = repo
        .find_commit(
            super::super::snapshot::head_commit(&repo)
                .expect("head is readable")
                .expect("a first snapshot exists"),
        )
        .expect("the commit exists")
        .tree()
        .expect("the tree exists");
    assert!(
        tree.lookup_entry_by_path("note.md")
            .expect("lookup")
            .is_none(),
        "the pending note was recorded before anyone decided"
    );
    assert!(
        tree.lookup_entry_by_path(MARKER).expect("lookup").is_none(),
        "the marker was recorded and would be pushed"
    );
}

#[test]
fn keeping_the_note_records_it_afterwards() {
    let f = fixture("resolve-del-keep-record", b"changed text\n");

    f.resolve(Resolution::KeepNote)
        .expect("the resolution succeeds");

    let repo = f.engine.repository();
    let tree = repo
        .find_commit(
            super::super::snapshot::head_commit(&repo)
                .expect("head is readable")
                .expect("history exists"),
        )
        .expect("the commit exists")
        .tree()
        .expect("the tree exists");
    let entry = tree
        .lookup_entry_by_path("note.md")
        .expect("lookup")
        .expect("the kept note is in history");
    let blob = entry.object().expect("the blob exists");
    assert_eq!(String::from_utf8_lossy(&blob.data), "changed text\n");
}

#[test]
fn a_keep_or_delete_marker_survives_a_scan_after_restart() {
    let f = fixture("resolve-del-scan", b"changed text\n");

    let found = conflict::scan(&f.vault).expect("the vault can be scanned");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].original, "note.md");
    assert_eq!(found[0].copy, MARKER);
    assert!(conflict::is_deletion_decision(&found[0].copy));
}
