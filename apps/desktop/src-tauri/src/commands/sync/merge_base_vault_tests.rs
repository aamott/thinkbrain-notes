//! A daemon's copy against a real vault: which recorded version it is merged
//! against, and that the answer survives a restart and a sibling's resolution.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::super::bootstrap::bootstrap;
use super::super::engine::Engine;
use super::super::resolve::{self, Resolution};
use super::super::snapshot;
use super::*;
use crate::tests::make_temp_test_dir;

const NOTE: &str = "note.md";
const COPY: &str = "note.sync-conflict-20260816-093100-K3SDFHG.md";
const SECOND_COPY: &str = "note.sync-conflict-20260816-094500-ZZ7QWER.md";

const BASELINE: &str = "one\ntwo\nthree\n";

struct Vault {
    app_data: PathBuf,
    root: PathBuf,
    engine: Engine,
}

fn vault(name: &str) -> Vault {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let root = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    let engine = open_engine(&app_data, &root);
    Vault {
        app_data,
        root,
        engine,
    }
}

fn open_engine(app_data: &Path, root: &Path) -> Engine {
    let managed = bootstrap(app_data, root, false).expect("bootstrap succeeds");
    Engine::new(managed.repo, managed.has_own_git, managed.git_import_paused)
}

impl Vault {
    /// Writes the note and records it, the way the sweeper would.
    fn record(&self, contents: &str) -> i64 {
        std::fs::write(self.root.join(NOTE), contents).expect("the note is written");
        self.engine
            .note_changes([PathBuf::from(NOTE)], Instant::now());
        self.engine.flush().expect("the change is recorded");
        head_seconds(&self.engine)
    }

    /// A daemon delivering another device's version, last modified `at`.
    fn arrive(&self, copy: &str, contents: &str, at: SystemTime) {
        let path = self.root.join(copy);
        std::fs::write(&path, contents).expect("the copy is written");
        std::fs::File::options()
            .write(true)
            .open(&path)
            .and_then(|file| file.set_modified(at))
            .expect("the copy's time is set");
    }

    fn base(&self, copy: &str) -> Option<MergeBase> {
        resolve::view(Some(&self.engine), &self.root, copy, None)
            .expect("the conflict is readable")
            .base
    }

    fn read(&self, relative: &str) -> String {
        std::fs::read_to_string(self.root.join(relative)).expect("the file is readable")
    }
}

fn head_seconds(engine: &Engine) -> i64 {
    let repo = engine.repository();
    let head = snapshot::head_commit(&repo)
        .expect("the history is readable")
        .expect("something was recorded");
    let commit = repo.find_commit(head).expect("the commit is readable");
    commit.time().expect("the commit has a time").seconds
}

fn at_second(seconds: i64) -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(u64::try_from(seconds).expect("after the epoch"))
}

/// Long after anything this test records.
fn much_later() -> SystemTime {
    SystemTime::now() + Duration::from_secs(3_600)
}

/// Waits for the wall clock to pass `seconds`, so whatever is recorded next is
/// strictly later than it.
fn after_second(seconds: i64) {
    while SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("after the epoch")
        .as_secs() as i64
        <= seconds
    {
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn blob(contents: &str) -> String {
    gix::objs::compute_hash(
        gix::hash::Kind::Sha1,
        gix::object::Kind::Blob,
        contents.as_bytes(),
    )
    .expect("hashable")
    .to_string()
}

/// Two devices start from one baseline and each edit offline. The version they
/// shared is the base, not this device's newer one that already holds our edit.
#[test]
fn two_devices_from_a_shared_baseline_merge_against_that_baseline() {
    let v = vault("base-shared");
    v.record(BASELINE);
    v.record("ONE\ntwo\nthree\n");
    v.arrive(COPY, "one\ntwo\nTHREE\n", much_later());

    let base = v.base(COPY).expect("a base is named");

    assert_eq!(base.id, blob(BASELINE));
    assert_eq!(base.source, BaseSource::Recorded);
    assert_eq!(base.confidence, Confidence::Ambiguous);
    assert_eq!(base.risky_hunks, 1);
}

/// Offline additions on the other device delete nothing from the baseline, so
/// merging against it cannot lose a line of ours.
#[test]
fn offline_additions_against_the_baseline_are_proven_safe() {
    let v = vault("base-offline-adds");
    v.record(BASELINE);
    v.record("ONE\ntwo\nthree\n");
    v.arrive(COPY, "one\ntwo\nthree\nfour\n", much_later());

    let base = v.base(COPY).expect("a base is named");

    assert_eq!(base.id, blob(BASELINE));
    assert_eq!(base.confidence, Confidence::Proven);
}

/// The daemon writes its winner over the note when the pair arrives, and the
/// sweeper records it. That snapshot is not a version both sides grew from,
/// however well it would score.
#[test]
fn a_version_recorded_after_the_copy_arrived_is_never_the_base() {
    let v = vault("base-polluted");
    let baseline_at = v.record(BASELINE);
    after_second(baseline_at);
    let theirs = "one\ntwo\nTHREE\n";
    let polluted_at = v.record(theirs);
    v.record("ONE\ntwo\nTHREE\n");
    v.arrive(COPY, theirs, at_second(polluted_at));

    let base = v.base(COPY).expect("a base is named");

    assert_eq!(base.id, blob(BASELINE), "a post-arrival snapshot was used");
}

/// Nothing recorded before the copy arrived: there is no base to name, and
/// opening the conflict leaves both versions exactly as they were.
#[test]
fn without_a_recorded_version_there_is_no_base_and_nothing_moves() {
    let v = vault("base-missing");
    v.record("ONE\ntwo\nthree\n");
    v.arrive(COPY, "one\ntwo\nTHREE\n", at_second(1_000));

    assert_eq!(v.base(COPY), None);
    assert_eq!(v.read(NOTE), "ONE\ntwo\nthree\n");
    assert_eq!(v.read(COPY), "one\ntwo\nTHREE\n");
}

/// A base that could still drop our text somewhere is named, but flagged so
/// both versions go to a person rather than through an automatic merge.
#[test]
fn an_ambiguous_base_leaves_both_versions_for_review() {
    let v = vault("base-ambiguous");
    v.record(BASELINE);
    v.record("one\ntwo\n");
    v.arrive(COPY, "one\nTWO\nthree\n", much_later());

    let base = v.base(COPY).expect("a base is named");

    assert_eq!(base.confidence, Confidence::Ambiguous);
    assert_eq!(v.read(NOTE), "one\ntwo\n");
    assert_eq!(v.read(COPY), "one\nTWO\nthree\n");
}

/// Nothing pins the answer: a restarted app, with an empty conflict list and a
/// fresh engine, derives the same base from the same recorded chain.
#[test]
fn a_conflict_found_after_a_restart_gets_the_same_base() {
    let v = vault("base-restart");
    v.record(BASELINE);
    v.record("ONE\ntwo\nthree\n");
    v.arrive(COPY, "one\ntwo\nTHREE\n", much_later());
    let before = v.base(COPY);

    let restarted = open_engine(&v.app_data, &v.root);
    restarted.note_conflicts(super::super::conflict::scan(&v.root).expect("the vault scans"));
    let after = resolve::view(Some(&restarted), &v.root, COPY, None)
        .expect("the conflict is readable")
        .base;

    assert!(before.is_some());
    assert_eq!(after, before);
}

/// Two other devices each left a copy of one note. Resolving the first changes
/// our side, and the second's base is worked out again against it — never from
/// the snapshot that resolution produced.
#[test]
fn resolving_one_of_several_copies_re_derives_the_next_base() {
    let v = vault("base-several");
    v.record(BASELINE);
    let ours_at = v.record("ONE\ntwo\nthree\n");
    after_second(ours_at);
    let arrived = SystemTime::now();
    v.arrive(COPY, "one\nTWO\nTHREE\n", arrived);
    v.arrive(SECOND_COPY, "one\ntwo\nTHREE\n", arrived);

    let before = v.base(SECOND_COPY).expect("a base is named");
    assert_eq!(before.id, blob(BASELINE));
    assert_eq!(before.confidence, Confidence::Ambiguous);

    let seen = resolve::view(Some(&v.engine), &v.root, COPY, None).expect("readable");
    resolve::resolve(
        &v.engine,
        &v.root,
        COPY,
        &Resolution::Merged {
            contents: "ONE\nTWO\nTHREE\n".to_string(),
        },
        &seen.summary.ours.fingerprint,
        &seen.summary.theirs.fingerprint,
    )
    .expect("the first copy resolves");
    v.record("ONE\nTWO\nTHREE\n");

    let after = v.base(SECOND_COPY).expect("a base is still named");
    assert_eq!(after.id, blob(BASELINE));
    assert_eq!(after.risky_hunks, 0);
    assert_eq!(after.confidence, Confidence::Proven);
}

/// A pull noted its copy with the base its merge computed. Opening the
/// conflict uses that, even where no recorded version predates the copy.
#[test]
fn a_base_noted_by_a_pull_is_used_when_the_conflict_opens() {
    let v = vault("base-noted");
    v.record(BASELINE);
    v.record("ONE\ntwo\nthree\n");
    let copy = "note (from another device).md";
    v.arrive(copy, "one\ntwo\nTHREE\n", at_second(1_000));
    let mut pulled = super::super::conflict::pair(copy, |_| true).expect("a git copy");
    pulled.base = Some(gix::ObjectId::from_hex(blob(BASELINE).as_bytes()).expect("hex"));
    v.engine.note_conflicts([pulled]);

    let base = v.base(copy).expect("the noted base is used");

    assert_eq!(base.id, blob(BASELINE));
    assert_eq!(base.source, BaseSource::Merge);
}
