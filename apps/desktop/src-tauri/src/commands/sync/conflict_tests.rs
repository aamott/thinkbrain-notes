use super::*;
use crate::tests::make_temp_test_dir;
use std::fs;

fn always(_: &str) -> bool {
    true
}

#[test]
fn syncthing_copies_are_paired_with_their_original() {
    let found = pair("note.sync-conflict-20260816-093100-K3SDFHG.md", always)
        .expect("a Syncthing copy is recognised");

    assert_eq!(found.original, "note.md");
    assert_eq!(found.provider, "Syncthing");
}

/// The copies a pull leaves behind go through the same table as everyone
/// else's, which is the whole reason story 6 needed no conflict UI.
#[test]
fn our_own_copies_are_paired_with_their_original() {
    let found = pair("note (from another device).md", always)
        .expect("a copy we wrote ourselves is recognised");

    assert_eq!(found.original, "note.md");
    assert_eq!(found.provider, "git");
}

#[test]
fn a_keep_or_delete_marker_is_paired_with_its_note() {
    let found =
        pair("note (keep or delete).md", always).expect("a keep-or-delete marker is recognised");

    assert_eq!(found.original, "note.md");
    assert!(is_deletion_decision(&found.copy));
}

#[test]
fn a_note_merely_named_keep_or_delete_is_not_a_marker() {
    assert!(pair("note (keep or delete of mine).md", always).is_none());
}

#[test]
fn a_second_copy_of_one_note_is_still_paired() {
    let found =
        pair("note (from another device 2).md", always).expect("a numbered copy is recognised");

    assert_eq!(found.original, "note.md");
}

/// The counter is the only thing allowed after the phrase. Anything else is
/// a name someone chose, and offering to resolve it would be a nuisance.
#[test]
fn a_note_merely_named_that_way_is_not_a_copy() {
    assert!(pair("note (from another device of mine).md", always).is_none());
}

#[test]
fn a_copy_goes_beside_its_note_and_past_any_already_there() {
    assert_eq!(
        beside("note.md", |_| false),
        "note (from another device).md"
    );
    assert_eq!(
        beside("note.md", |name| name == "note (from another device).md"),
        "note (from another device 2).md"
    );
}

/// An interrupted sync leaves the unnumbered slot behind. Reusing it is
/// what stops the next attempt from stacking ` 2`, then ` 3`.
#[test]
fn an_existing_copy_of_this_conflict_is_reused_not_numbered() {
    let vault = make_temp_test_dir("conflict-reuse-slot", "sync", true);
    fs::write(vault.join("note.md"), "mine").expect("the note exists");
    fs::write(vault.join("note (from another device).md"), "theirs").expect("the leftover exists");

    assert_eq!(
        beside_in(&vault, "note.md"),
        "note (from another device).md"
    );
}

/// Numbering is for a name that cannot be this conflict's slot — a folder
/// sitting on it, not a leftover file.
#[test]
fn a_folder_on_the_slot_is_numbered_past() {
    let vault = make_temp_test_dir("conflict-slot-folder", "sync", true);
    fs::create_dir(vault.join("note (from another device).md")).expect("the slot is a folder");

    assert_eq!(
        beside_in(&vault, "note.md"),
        "note (from another device 2).md"
    );
}

/// A folder with a dot in its name must not be mistaken for an extension.
#[test]
fn a_copy_in_a_folder_keeps_the_folder() {
    assert_eq!(
        beside("my.notes/one.md", |_| false),
        "my.notes/one (from another device).md"
    );
}

#[test]
fn dropbox_copies_are_paired_with_their_original() {
    let found = pair("note (Adam's conflicted copy 2026-08-16).md", always)
        .expect("a Dropbox copy is recognised");

    assert_eq!(found.original, "note.md");
    assert_eq!(
        found.provider, "Dropbox",
        "the copy was blamed on the wrong provider"
    );
}

#[test]
fn nextcloud_copies_are_paired_with_their_original() {
    let found = pair("note (conflicted copy 2026-08-16 093100).md", always)
        .expect("a Nextcloud copy is recognised");

    assert_eq!(found.original, "note.md");
    assert_eq!(found.provider, "Nextcloud");
}

#[test]
fn a_copy_keeps_the_folder_its_original_is_in() {
    let found = pair(
        "journal/2026/08-16.sync-conflict-20260816-093100-K3SDFHG.md",
        always,
    )
    .expect("a nested copy is recognised");

    assert_eq!(found.original, "journal/2026/08-16.md");
}

/// The disambiguator that makes the risky patterns safe to have at all. A
/// name in a conflict shape whose original is gone is just a file, and
/// offering to resolve it against nothing would be worse than ignoring it.
#[test]
fn a_copy_with_no_original_is_not_a_conflict() {
    assert_eq!(
        pair("note.sync-conflict-20260816-093100-K3SDFHG.md", |_| false),
        None
    );
}

/// Carrying the marker is not enough: the tail has to be the shape
/// Syncthing actually writes, date and time and device. Matching on the
/// marker alone would claim any note whose name happened to contain it.
#[test]
fn the_syncthing_marker_alone_is_not_a_conflict() {
    for name in [
        "note.sync-conflict-draft.md",
        "note.sync-conflict-20260816-093100.md",
        "note.sync-conflict-20260816-093100-K3SDFHG-extra.md",
        "note.sync-conflict-notadate-093100-K3SDFHG.md",
        "note.sync-conflict-20260816-nottime-K3SDFHG.md",
        "note.sync-conflict-20260816--K3SDFHG.md",
    ] {
        assert_eq!(
            pair(name, always),
            None,
            "{name} was mistaken for a conflict"
        );
    }
}

/// Ordinary notes must survive contact with this table. A false positive
/// here tells the user their own file is a conflict and offers to delete
/// one side of it. The "conflicted copy" phrases without a date are the
/// ones the date anchor is there to reject.
#[test]
fn ordinary_notes_are_not_mistaken_for_conflicts() {
    for name in [
        "note.md",
        "meeting (draft).md",
        "sync-conflict.md",
        "a note about the sync-conflict-format.md",
        "notes (1).md",
        "report v2.md",
        "2026-08-16.md",
        ".hidden.md",
        "conflicted copy.md",
        "meeting (Adam's conflicted copy notes).md",
        "meeting (conflicted copy notes).md",
    ] {
        assert_eq!(
            pair(name, always),
            None,
            "{name} was mistaken for a conflict"
        );
    }
}

/// The marker without the date is not a conflict, even when the original it
/// would pair with is right there. This is the false positive the date
/// anchor exists to prevent.
#[test]
fn a_conflicted_copy_phrase_without_a_date_is_not_a_conflict() {
    let vault = make_temp_test_dir("conflict-no-date", "sync", true);
    fs::write(vault.join("meeting.md"), "mine").expect("the note exists");
    fs::write(
        vault.join("meeting (Adam's conflicted copy notes).md"),
        "theirs",
    )
    .expect("the copy exists");

    let found = scan(&vault).expect("the vault can be scanned");

    assert!(
        found.is_empty(),
        "a dateless name was treated as a conflict: {found:?}"
    );
}

/// A pathological vault with every numbered name taken still gets a unique
/// one back, and the search does not walk the whole vault to find it.
#[test]
fn beside_falls_back_when_every_numbered_name_is_taken() {
    let vault = make_temp_test_dir("conflict-beside-cap", "sync", true);
    fs::write(vault.join("note.md"), "mine").expect("the note exists");
    // Fill every numbered name the loop would try, so it has to fall back.
    for nth in 0..=BESIDE_CAP {
        let name = if nth == 0 {
            "note (from another device).md".to_string()
        } else {
            // The loop starts at 2, but cover 1 too in case that ever changes.
            let n = nth.max(2);
            format!("note (from another device {n}).md")
        };
        fs::write(vault.join(name), "taken").expect("the taken copy exists");
    }

    let free = beside("note.md", |path| vault.join(path).exists());

    assert!(
        !vault.join(&free).exists(),
        "the fallback name was not free: {free}"
    );
    assert!(
        free.starts_with("note (from another device "),
        "the fallback lost the conflict shape: {free}"
    );
}

/// One original can collect copies from several machines at once.
#[test]
fn several_copies_of_one_note_each_pair_with_it() {
    let vault = make_temp_test_dir("conflict-many", "sync", true);
    fs::write(vault.join("note.md"), "mine").expect("the note exists");
    for device in ["K3SDFHG", "P9WERTY"] {
        fs::write(
            vault.join(format!("note.sync-conflict-20260816-093100-{device}.md")),
            "theirs",
        )
        .expect("the copy exists");
    }

    let found = scan(&vault).expect("the vault can be scanned");

    assert_eq!(found.len(), 2);
    assert!(found.iter().all(|copy| copy.original == "note.md"));
}

#[test]
fn a_scan_finds_conflicts_left_while_the_app_was_closed() {
    let vault = make_temp_test_dir("conflict-scan", "sync", true);
    fs::create_dir_all(vault.join("journal")).expect("the folder exists");
    fs::write(vault.join("journal/08-16.md"), "mine").expect("the note exists");
    fs::write(
        vault.join("journal/08-16.sync-conflict-20260816-093100-K3SDFHG.md"),
        "theirs",
    )
    .expect("the copy exists");
    fs::write(vault.join("untouched.md"), "fine").expect("the note exists");

    let found = scan(&vault).expect("the vault can be scanned");

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].original, "journal/08-16.md");
    assert_eq!(
        found[0].copy,
        "journal/08-16.sync-conflict-20260816-093100-K3SDFHG.md"
    );
}

#[test]
fn a_scan_reports_when_the_vault_cannot_be_read() {
    let vault = make_temp_test_dir("conflict-scan-failure", "sync", true);
    fs::remove_dir(&vault).expect("the test vault is removed");

    let error = scan(&vault).expect_err("an unreadable vault is not conflict-free");

    assert_eq!(error.code, "sync.vault_read_failed");
}

/// Until someone has watched each daemon produce a real file, the table
/// says so. This fails the moment a row claims evidence it does not have.
///
/// One row may: the copies a pull leaves are ours, so there is no daemon to
/// wait on and [`beside`] is the fixture. It has to prove that here, by
/// being recognised as what it writes.
#[test]
fn every_pattern_records_what_is_actually_known_about_it() {
    for pattern in PATTERNS {
        if pattern.evidence == Evidence::Fixture {
            let ours = if (pattern.match_name)("note (keep or delete).md").is_some() {
                deletion_beside("note.md", |_| false)
            } else {
                beside("note.md", |_| false)
            };
            assert_eq!(
                (pattern.match_name)(&ours).as_deref(),
                Some("note.md"),
                "{} claims to have seen its own copies but does not recognise one",
                pattern.provider
            );
            continue;
        }
        assert_eq!(
            pattern.evidence,
            Evidence::Documented,
            "{} claims evidence the table has no name for",
            pattern.provider
        );
    }
}
