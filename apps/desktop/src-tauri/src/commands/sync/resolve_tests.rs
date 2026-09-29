use super::super::bootstrap::bootstrap;
use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;

const COPY: &str = "note.sync-conflict-20260816-093100-K3SDFHG.md";

struct Fixture {
    vault: PathBuf,
    engine: Engine,
}

impl Fixture {
    fn view(&self) -> ConflictView {
        view(&self.vault, COPY, None).expect("the conflict is readable")
    }

    /// Resolves with the fingerprints the panel would have been handed.
    fn resolve(&self, resolution: Resolution) -> Result<Resolved, NativeError> {
        self.resolve_as_seen(&self.view(), resolution)
    }

    /// Resolves against a view taken earlier, which is how a stale one
    /// reaches the write.
    fn resolve_as_seen(
        &self,
        seen: &ConflictView,
        resolution: Resolution,
    ) -> Result<Resolved, NativeError> {
        resolve(
            &self.engine,
            &self.vault,
            COPY,
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

/// A vault holding one note and one conflict copy of it.
fn fixture(name: &str, ours: &[u8], theirs: &[u8]) -> Fixture {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    fs::write(vault.join("note.md"), ours).expect("the note is written");
    fs::write(vault.join(COPY), theirs).expect("the copy is written");

    let workspace = bootstrap(&app_data, &vault).expect("bootstrap succeeds");
    Fixture {
        vault,
        engine: Engine::new(workspace.repo, workspace.has_own_git),
    }
}

fn text_fixture(name: &str) -> Fixture {
    fixture(name, b"# Note\nmine\nend\n", b"# Note\ntheirs\nend\n")
}

#[test]
fn a_conflict_is_presented_as_the_two_versions_and_their_texts() {
    let f = text_fixture("resolve-view");

    let seen = f.view();

    assert_eq!(seen.summary.kind, Kind::Text);
    assert_eq!(seen.summary.ours.path, "note.md");
    assert_eq!(seen.summary.ours.label, "This computer");
    assert_eq!(seen.summary.theirs.path, COPY);
    assert_eq!(seen.summary.theirs.label, "Syncthing");
    assert_eq!(
        seen.text,
        Some(ConflictText {
            incoming: "# Note\ntheirs\nend\n".into(),
            current: "# Note\nmine\nend\n".into(),
        })
    );
}

/// A file that is not half of a pair is not something to offer to resolve,
/// and a path that climbs out of the vault is not something to read at all.
///
/// The codes are asserted, not just the failure. A copy whose original is
/// gone is a file someone named that way; saying so is the difference
/// between "this is not a conflict" and a read error naming a note that has
/// not existed for a week.
#[test]
fn only_a_real_conflict_copy_can_be_opened() {
    let f = text_fixture("resolve-not-a-conflict");
    // A real file in a conflict's shape whose original is not there.
    fs::write(
        f.vault
            .join("orphan.sync-conflict-20260816-093100-K3SDFHG.md"),
        "left behind",
    )
    .expect("the orphan is written");

    for (path, code) in [
        ("note.md", "sync.not_a_conflict"),
        (
            "orphan.sync-conflict-20260816-093100-K3SDFHG.md",
            "sync.not_a_conflict",
        ),
        ("../outside.md", "workspace.invalid_path"),
    ] {
        let refused =
            view(&f.vault, path, None).expect_err(&format!("{path} was accepted as a conflict"));
        assert_eq!(
            refused.code, code,
            "{path} was refused for the wrong reason"
        );
    }
}

/// A triage card gets both versions and no comparison — it shows names,
/// sizes and dates, and the list asks this of every conflict at once.
///
/// The fingerprints have to match the opened view's, because a card offering
/// "keep this one" resolves straight from them without opening anything.
#[test]
fn a_card_gets_both_versions_without_paying_for_the_texts() {
    let f = text_fixture("resolve-summary");

    let card = summarise(&f.vault, COPY).expect("the conflict summarises");

    assert_eq!(card.kind, Kind::Text);
    assert_eq!(card.ours.path, "note.md");
    assert_eq!(card.ours.byte_size, "# Note\nmine\nend\n".len() as u64);
    assert_eq!(card.theirs.label, "Syncthing");
    assert_eq!(
        card,
        f.view().summary,
        "a card and an opened conflict disagree"
    );
}

/// The version the user is looking at is the one in their editor, not the
/// last one saved. Resolving against stale disk content would silently
/// throw away everything typed since.
#[test]
fn an_unsaved_editor_buffer_stands_in_for_this_computers_version() {
    let f = text_fixture("resolve-buffer");

    let seen = view(&f.vault, COPY, Some("# Note\nstill typing\nend\n"))
        .expect("the conflict is readable");

    assert_eq!(
        seen.text,
        Some(ConflictText {
            incoming: "# Note\ntheirs\nend\n".into(),
            current: "# Note\nstill typing\nend\n".into(),
        })
    );
}

/// The buffer is this app's own unsaved work, not another writer's — so it
/// must not become the thing the write checks against, or every resolution
/// with unsaved changes would refuse itself.
#[test]
fn the_fingerprint_follows_the_disk_even_when_a_buffer_is_shown() {
    let f = text_fixture("resolve-buffer-fingerprint");

    let with_buffer = view(&f.vault, COPY, Some("# Note\nstill typing\nend\n"))
        .expect("the conflict is readable");

    assert_eq!(
        with_buffer.summary.ours.fingerprint,
        f.view().summary.ours.fingerprint
    );
}

#[test]
fn keeping_ours_leaves_the_note_alone_and_removes_the_copy() {
    let f = text_fixture("resolve-keep-ours");

    let done = f
        .resolve(Resolution::KeepOurs)
        .expect("the resolution succeeds");

    assert_eq!(f.read("note.md"), "# Note\nmine\nend\n");
    assert!(!f.exists(COPY), "the copy was left behind");
    assert_eq!(done.kept_as, None);
}

#[test]
fn keeping_theirs_puts_their_version_in_the_note() {
    let f = text_fixture("resolve-keep-theirs");

    f.resolve(Resolution::KeepTheirs)
        .expect("the resolution succeeds");

    assert_eq!(f.read("note.md"), "# Note\ntheirs\nend\n");
    assert!(!f.exists(COPY), "the copy was left behind");
}

#[test]
fn a_merged_resolution_is_written_as_given() {
    let f = text_fixture("resolve-merged");

    f.resolve(Resolution::Merged {
        contents: "# Note\nmine\ntheirs\nend\n".into(),
    })
    .expect("the resolution succeeds");

    assert_eq!(f.read("note.md"), "# Note\nmine\ntheirs\nend\n");
    assert!(!f.exists(COPY), "the copy was left behind");
}

/// The escape hatch: the copy is renamed after whoever made it, so both
/// versions survive and the pair is never offered again.
#[test]
fn keeping_both_renames_the_copy_after_its_provider() {
    let f = text_fixture("resolve-keep-both");

    let done = f
        .resolve(Resolution::KeepBoth)
        .expect("the resolution succeeds");

    assert_eq!(done.kept_as.as_deref(), Some("note (Syncthing).md"));
    assert_eq!(f.read("note (Syncthing).md"), "# Note\ntheirs\nend\n");
    assert_eq!(f.read("note.md"), "# Note\nmine\nend\n");
    assert!(!f.exists(COPY), "the copy kept its old name too");
    assert_eq!(
        conflict::pair(done.kept_as.as_deref().expect("a name"), |_| true),
        None,
        "the kept copy still looks like a conflict, so it will be offered again"
    );
}

#[test]
fn keeping_both_twice_does_not_overwrite_the_first_one() {
    let f = text_fixture("resolve-keep-both-twice");
    fs::write(f.vault.join("note (Syncthing).md"), "an earlier one").expect("written");

    let done = f
        .resolve(Resolution::KeepBoth)
        .expect("the resolution succeeds");

    assert_eq!(done.kept_as.as_deref(), Some("note (Syncthing 2).md"));
    assert_eq!(f.read("note (Syncthing).md"), "an earlier one");
}

/// The undo the whole feature promises. Both versions have to be in the
/// checkpoint before anything is overwritten, or "you can always go back"
/// is not true.
#[test]
fn both_versions_are_checkpointed_before_the_note_is_overwritten() {
    let f = text_fixture("resolve-checkpoint");

    let done = f
        .resolve(Resolution::KeepTheirs)
        .expect("the resolution succeeds");

    let repo = f.engine.repository();
    let tree = repo
        .find_commit(gix::ObjectId::from_hex(done.checkpoint.as_bytes()).expect("an id"))
        .expect("the checkpoint exists")
        .tree()
        .expect("the tree exists");
    for (path, expected) in [
        ("note.md", "# Note\nmine\nend\n"),
        (COPY, "# Note\ntheirs\nend\n"),
    ] {
        let entry = tree
            .lookup_entry_by_path(path)
            .expect("the lookup succeeds")
            .unwrap_or_else(|| panic!("{path} is not in the checkpoint"));
        let blob = entry.object().expect("the blob exists");
        assert_eq!(
            String::from_utf8_lossy(&blob.data),
            expected,
            "{path} was checkpointed as something other than its pre-resolution content"
        );
    }
}

/// The race the whole compare-and-swap exists for: the daemon delivers a
/// newer version between the panel opening and the user clicking. Writing
/// then would overwrite content nobody has seen — from either side, since
/// the daemon is as free to rewrite the note as the copy.
#[test]
fn a_side_that_changed_since_it_was_read_aborts_the_write() {
    for (name, moved) in [
        ("resolve-moved-theirs", COPY),
        ("resolve-moved-ours", "note.md"),
    ] {
        let f = text_fixture(name);
        let seen = f.view();
        fs::write(f.vault.join(moved), "# Note\nsomeone else\nend\n").expect("rewritten");
        let before = f.read("note.md");

        let refused = f
            .resolve_as_seen(&seen, Resolution::KeepTheirs)
            .expect_err("the write should have been refused");

        assert_eq!(
            refused.code, "sync.conflict_moved",
            "{moved} moving was not noticed"
        );
        assert_eq!(f.read("note.md"), before, "the note was written anyway");
        assert!(
            f.exists(COPY),
            "the copy was removed by a refused resolution"
        );
    }
}

/// A refused resolution must leave no restore point either, or the history
/// fills with checkpoints for decisions that never happened.
#[test]
fn a_refused_resolution_takes_no_checkpoint() {
    let f = text_fixture("resolve-refused-checkpoint");
    let seen = f.view();
    fs::write(f.vault.join(COPY), "moved").expect("the copy is rewritten");

    f.resolve_as_seen(&seen, Resolution::KeepOurs)
        .expect_err("the write should have been refused");

    assert_eq!(
        super::super::snapshot::checkpoint_head(&f.engine.repository())
            .expect("reading the checkpoint ref succeeds"),
        None,
        "a checkpoint was taken for a resolution that never happened"
    );
}

/// Two images are not a thing to segment into lines, so the panel gets
/// sizes and dates and a whole-file choice.
#[test]
fn a_binary_conflict_is_offered_as_whole_files() {
    let f = fixture("resolve-binary", b"PNG\x00mine", b"PNG\x00theirs");

    let seen = f.view();

    assert_eq!(seen.summary.kind, Kind::Binary);
    assert_eq!(seen.text, None);
    assert_eq!(seen.summary.ours.byte_size, 8);
}

#[test]
fn a_binary_conflict_can_still_be_resolved_whole() {
    let f = fixture("resolve-binary-keep", b"PNG\x00mine", b"PNG\x00theirs");

    f.resolve(Resolution::KeepTheirs)
        .expect("the resolution succeeds");

    assert_eq!(
        fs::read(f.vault.join("note.md")).expect("readable"),
        b"PNG\x00theirs"
    );
}

/// Text assembled over a pair that was never text would be written
/// straight over an image.
#[test]
fn a_binary_conflict_refuses_a_merged_resolution() {
    let f = fixture("resolve-binary-merged", b"PNG\x00mine", b"PNG\x00theirs");

    let refused = f
        .resolve(Resolution::Merged {
            contents: "nonsense".into(),
        })
        .expect_err("a merge of two binaries should have been refused");

    assert_eq!(refused.code, "sync.not_mergeable");
    assert_eq!(
        fs::read(f.vault.join("note.md")).expect("readable"),
        b"PNG\x00mine"
    );
}

/// The resolution write is deliberately *not* echo-suppressed. The note's
/// content changed under an editor that is probably open on it, and the
/// copy beside it left the file list — the watcher's ordinary "someone else
/// wrote this" path is what refreshes every window showing this vault, and
/// claiming the echo would silence exactly that.
#[test]
fn a_resolution_is_announced_like_any_other_outside_write() {
    let f = text_fixture("resolve-announced");

    f.resolve(Resolution::KeepTheirs)
        .expect("the resolution succeeds");

    assert!(
        !crate::commands::watcher::take_self_write(&f.vault.join("note.md")),
        "the resolution claimed its own echo, so no open editor will reload the note"
    );
}

/// Two windows, or one impatient double-click, on the same conflict. Only
/// one of them may report success, and the vault must be left in the state
/// that one produced rather than some interleaving of all four.
///
/// This does not prove the mutation lock: removing it leaves the test
/// passing, because a resolution ends by deleting the copy and only one
/// caller can do that. The lock is there for the interleaving this cannot
/// reach — an ordinary note save landing between the read and the write,
/// which `a_note_save_cannot_land_between_the_read_and_the_write` covers.
#[test]
fn simultaneous_resolutions_of_one_conflict_land_exactly_once() {
    let f = std::sync::Arc::new(text_fixture("resolve-concurrent"));
    let seen = f.view();

    let outcomes: Vec<bool> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..4)
            .map(|_| {
                let f = std::sync::Arc::clone(&f);
                let seen = seen.clone();
                scope.spawn(move || f.resolve_as_seen(&seen, Resolution::KeepTheirs).is_ok())
            })
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().expect("the thread finishes"))
            .collect()
    });

    assert_eq!(
        outcomes.iter().filter(|landed| **landed).count(),
        1,
        "a conflict was resolved more than once"
    );
    assert_eq!(f.read("note.md"), "# Note\ntheirs\nend\n");
    assert!(!f.exists(COPY));
}

/// The interleaving the mutation lock exists for, and the one the test
/// above cannot reach: an ordinary note save landing after the resolution
/// has checked the fingerprints and before it replaces the contents.
/// Without the lock the save is written and then overwritten, and the
/// resolution reports success over the top of it.
///
/// The seam parks the resolution exactly in that window. The bounded wait
/// is the one timing element left, and it only fails in the sound
/// direction: a save that *completes* while the resolution is parked means
/// the lock is not being held, which is the defect. A slow save cannot fail
/// this test, only pass it for a weaker reason.
#[test]
fn a_note_save_cannot_land_between_the_read_and_the_write() {
    use std::sync::mpsc;
    use std::time::Duration;

    let f = text_fixture("resolve-lock-window");
    let seen = f.view();
    let before = f.read("note.md");
    let root = f
        .vault
        .to_str()
        .expect("the vault path is utf-8")
        .to_owned();

    let (entered_tx, entered_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let (saved_tx, saved_rx) = mpsc::channel();

    let engine = &f.engine;
    let vault = &f.vault;
    let seen = &seen;
    let root = &root;

    let saved_while_parked = std::thread::scope(|scope| {
        let resolving = scope.spawn(move || {
            resolve_after_read(
                engine,
                vault,
                COPY,
                &Resolution::KeepTheirs,
                &seen.summary.ours.fingerprint,
                &seen.summary.theirs.fingerprint,
                || {
                    entered_tx.send(()).expect("the seam is announced");
                    release_rx.recv().expect("the resolution is released");
                },
            )
        });

        entered_rx
            .recv_timeout(Duration::from_secs(5))
            .expect("the resolution reaches the write");

        // The seam is genuinely before the write, so what follows is about
        // the window the lock covers rather than one that already closed.
        assert_eq!(
            f.read("note.md"),
            before,
            "the resolution had already written when the seam was reached"
        );

        let saving = scope.spawn(move || {
            let written = crate::commands::markdown::write_markdown_document(
                root,
                "note.md",
                "# Note\nsaved by the editor\nend\n".to_owned(),
                None,
                None,
            );
            saved_tx
                .send(())
                .expect("the save announces that it finished");
            written
        });

        // Recorded rather than asserted here: the resolution is still
        // parked, and failing before releasing it would hang the scope
        // instead of reporting what went wrong.
        let saved_while_parked = saved_rx.recv_timeout(Duration::from_millis(250)).is_ok();

        release_tx.send(()).expect("the resolution is let go");
        resolving
            .join()
            .expect("the resolving thread finishes")
            .expect("the resolution succeeds");
        saving
            .join()
            .expect("the saving thread finishes")
            .expect("the save succeeds");
        saved_while_parked
    });

    assert!(
        !saved_while_parked,
        "a note save landed between the resolution's read and its write"
    );

    // Both writes happened, one after the other rather than inside each
    // other: the save is what is on disk, and the copy the resolution
    // answered is gone.
    assert_eq!(f.read("note.md"), "# Note\nsaved by the editor\nend\n");
    assert!(!f.exists(COPY));
}

/// Once answered, the conflict is gone from the set the panel reads — the
/// user should not be asked again about a decision they already made.
#[test]
fn a_resolved_conflict_is_no_longer_outstanding() {
    let f = text_fixture("resolve-forget");
    f.engine
        .note_conflicts(conflict::scan(&f.vault).expect("the vault can be scanned"));
    assert_eq!(
        f.engine.conflicts().len(),
        1,
        "the conflict was not noticed"
    );

    f.resolve(Resolution::KeepOurs)
        .expect("the resolution succeeds");

    assert!(
        f.engine.conflicts().is_empty(),
        "the answered conflict is still listed"
    );
}
