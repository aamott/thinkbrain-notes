//! A pull's own copies: the base the merge computed travels with them, and is
//! derived again from the recorded chain once a restart has forgotten it.

use std::fs;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::super::conflict::ConflictCopy;
use super::super::round::{self, Synced};
use super::super::{snapshot, test_support};
use super::*;
use crate::tests::make_temp_test_dir;

const NOTE: &str = "note.md";
const COPY: &str = "note (from another device).md";

struct Device {
    vault: PathBuf,
    repo: gix::Repository,
}

fn device(name: &str) -> Device {
    let fixture = test_support::repo_fixture(name, "base");
    Device {
        vault: fixture.vault,
        repo: fixture.repo,
    }
}

fn shared(name: &str) -> String {
    let path = make_temp_test_dir(&format!("{name}-remote"), "base", true);
    gix::init_bare(&path).expect("the destination is created");
    fs::write(path.join("HEAD"), "ref: refs/heads/main\n").expect("HEAD names main");
    path.to_string_lossy().into_owned()
}

fn write(device: &Device, contents: &str) {
    test_support::write(&device.vault, NOTE, contents);
    snapshot::record(&device.repo, &[PathBuf::from(NOTE)], "changed note.md")
        .expect("the change is recorded");
}

fn trip(device: &Device, destination: &str) -> Synced {
    round::once(&device.repo, &device.vault, destination).expect("the sync succeeds")
}

fn blob(contents: &str) -> gix::ObjectId {
    gix::objs::compute_hash(
        gix::hash::Kind::Sha1,
        gix::object::Kind::Blob,
        contents.as_bytes(),
    )
    .expect("hashable")
}

/// Waits for the next wall-clock second, so a pull that follows lands strictly
/// after everything recorded so far.
fn next_second() {
    let now = || {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("after the epoch")
            .as_secs()
    };
    let started = now();
    while now() == started {
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// Both devices start from "the line", then each rewrites it.
fn clash(name: &str) -> (Device, Synced) {
    let one = device(&format!("{name}-one"));
    let two = device(&format!("{name}-two"));
    let there = shared(name);
    write(&one, "the line\n");
    trip(&one, &there);
    trip(&two, &there);
    write(&one, "their wording\n");
    trip(&one, &there);
    write(&two, "our wording\n");
    next_second();
    let synced = trip(&two, &there);
    (two, synced)
}

fn derived(device: &Device, copy: &ConflictCopy) -> Option<MergeBase> {
    let ours = fs::read(device.vault.join(&copy.original)).expect("ours is readable");
    let theirs = fs::read(device.vault.join(&copy.copy)).expect("theirs is readable");
    derive(&device.repo, &device.vault, copy, &ours, &theirs).expect("the base derives")
}

#[test]
fn a_pulled_conflict_names_the_base_the_merge_computed() {
    let (two, synced) = clash("base-git-exact");

    let [copy] = synced.conflict_copies.as_slice() else {
        panic!("expected one copy, got {:?}", synced.conflict_copies);
    };
    assert_eq!(copy.copy, COPY);
    assert_eq!(copy.base, Some(blob("the line\n")));

    let base = derived(&two, copy).expect("a base is named");
    assert_eq!(base.id, blob("the line\n").to_string());
    assert_eq!(base.source, BaseSource::Merge);
}

/// Two devices that each already had the note share no ancestor for it. The
/// merge's honest answer is "none", and the copy says so.
#[test]
fn a_note_both_devices_added_has_no_merge_base() {
    let one = device("base-git-added-one");
    let two = device("base-git-added-two");
    let there = shared("base-git-added");
    write(&one, "written on one\n");
    trip(&one, &there);
    write(&two, "written on two\n");

    let synced = trip(&two, &there);

    let [copy] = synced.conflict_copies.as_slice() else {
        panic!("expected one copy, got {:?}", synced.conflict_copies);
    };
    assert_eq!(copy.base, None);
}

/// After a restart the scan finds the copy by its name alone. The base comes
/// back from the recorded chain — the shared line, not the merge's own record.
#[test]
fn after_a_restart_a_pulled_conflict_derives_its_base_from_history() {
    let (two, synced) = clash("base-git-restart");
    let rescanned = ConflictCopy {
        base: None,
        ..synced.conflict_copies[0].clone()
    };
    // This vault wrote the copy itself, so its time is the merge's own clock;
    // only the skew margin, kept for other devices' clocks, is set aside here.
    let merged_at = head_seconds(&two.repo);
    fs::File::options()
        .write(true)
        .open(two.vault.join(&rescanned.copy))
        .and_then(|file| file.set_modified(at_second(merged_at + ARRIVAL_SKEW_SECS)))
        .expect("the copy's time is set");

    let base = derived(&two, &rescanned).expect("a base is named");

    assert_eq!(base.id, blob("the line\n").to_string());
    assert_eq!(base.source, BaseSource::Recorded);
}

/// The watcher and the scan see the copy by name too, after the pull already
/// noted it with its base. Hearing about it again must not forget the base.
#[test]
fn seeing_a_pulled_copy_again_keeps_its_base() {
    let fixture = test_support::engine_fixture("base-git-dedup");
    let pulled = ConflictCopy {
        copy: COPY.to_string(),
        original: NOTE.to_string(),
        provider: "git",
        base: Some(blob("the line\n")),
    };
    let by_name = ConflictCopy {
        base: None,
        ..pulled.clone()
    };

    assert!(fixture.engine.note_pulled_conflicts([pulled.clone()]));
    assert!(!fixture.engine.note_conflicts([by_name]));
    fixture
        .engine
        .note_changes([PathBuf::from(NOTE)], Instant::now());

    assert_eq!(fixture.engine.conflicts(), [pulled]);
}

/// A later pull can write a new conflict into the same slot, and its merge may
/// honestly have no base. That answer replaces the old base rather than
/// leaving one that belongs to a different pair of versions.
#[test]
fn a_later_pull_into_the_same_slot_replaces_the_base() {
    let fixture = test_support::engine_fixture("base-git-repull");
    let earlier = ConflictCopy {
        copy: COPY.to_string(),
        original: NOTE.to_string(),
        provider: "git",
        base: Some(blob("the line\n")),
    };
    let later = ConflictCopy {
        base: None,
        ..earlier.clone()
    };

    fixture.engine.note_pulled_conflicts([earlier]);
    fixture.engine.note_pulled_conflicts([later.clone()]);

    assert_eq!(fixture.engine.conflicts(), [later]);
}

/// Unrecorded text on disk keeps the arriving version beside it. Both grew
/// from what this vault last recorded at the path, and the copy names that.
#[test]
fn a_version_kept_beside_unrecorded_text_names_the_recorded_one_as_base() {
    let (two, synced) = beside_unrecorded("base-git-kept", "their wording\n");

    let [copy] = synced.conflict_copies.as_slice() else {
        panic!("expected one copy, got {:?}", synced.conflict_copies);
    };
    assert_eq!(copy.copy, COPY);
    assert_eq!(copy.base, Some(blob("the line\n")));
    assert_eq!(
        fs::read_to_string(two.vault.join(NOTE)).expect("readable"),
        "still typing\n"
    );
}

/// An empty arriving version gives a merge nothing to work with line by line,
/// so it is left as a plain choice with no base.
#[test]
fn an_empty_version_kept_beside_unrecorded_text_has_no_base() {
    let (_, synced) = beside_unrecorded("base-git-kept-empty", "");

    let [copy] = synced.conflict_copies.as_slice() else {
        panic!("expected one copy, got {:?}", synced.conflict_copies);
    };
    assert_eq!(copy.base, None);
}

/// Both devices record "the line"; the other then changes it to `theirs` while
/// this one has unrecorded text on disk, and pulls.
fn beside_unrecorded(name: &str, theirs: &str) -> (Device, Synced) {
    let one = device(&format!("{name}-one"));
    let two = device(&format!("{name}-two"));
    let there = shared(name);
    write(&one, "the line\n");
    trip(&one, &there);
    trip(&two, &there);
    write(&one, theirs);
    trip(&one, &there);
    fs::write(two.vault.join(NOTE), "still typing\n").expect("the note is written");
    let synced = trip(&two, &there);
    (two, synced)
}

fn head_seconds(repo: &gix::Repository) -> i64 {
    let head = snapshot::head_commit(repo)
        .expect("the history is readable")
        .expect("something was recorded");
    let commit = repo.find_commit(head).expect("the commit is readable");
    commit.time().expect("the commit has a time").seconds
}

fn at_second(seconds: i64) -> SystemTime {
    UNIX_EPOCH + Duration::from_secs(u64::try_from(seconds).expect("after the epoch"))
}
