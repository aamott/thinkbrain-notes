//! The scoring, with nothing but bytes: which base a merge can trust.

use super::*;

const BASE: &[u8] = b"one\ntwo\nthree\n";
const OURS: &[u8] = b"ONE\ntwo\nthree\n";
const THEIRS: &[u8] = b"one\ntwo\nTHREE\n";

fn risky_hunks(ours: &[u8], base: &[u8], theirs: &[u8]) -> usize {
    judge(ours, base, theirs).1
}

fn deletes_nothing(base: &[u8], theirs: &[u8]) -> bool {
    // Ours equal to the base makes every hunk of theirs risky, so only the
    // insertion rule can still call the merge proven.
    judge(base, base, theirs).0 == Confidence::Proven
}

/// Against the version both sides grew from, the only risky hunk is the one
/// they changed where we did not — which is a genuine edit of theirs.
#[test]
fn a_true_base_counts_only_their_edits_where_ours_did_not_move() {
    assert_eq!(risky_hunks(OURS, BASE, THEIRS), 1);
}

/// A base that already holds our edit makes that edit look like theirs to
/// undo. That is the silent loss the count exists to catch.
#[test]
fn a_base_newer_than_theirs_marks_our_edit_as_risky() {
    assert_eq!(risky_hunks(OURS, OURS, THEIRS), 2);
}

/// Where both sides changed the same lines, ours differs from the base, so the
/// merge has to ask rather than pick — not risky.
#[test]
fn a_place_both_sides_changed_is_not_risky() {
    assert_eq!(
        risky_hunks(b"one\nTWO\nthree\n", BASE, b"one\n2\nthree\n"),
        0
    );
}

/// A line they added where we changed nothing still counts: the shape is the
/// same as a line we deleted after a base that was too new.
#[test]
fn an_insertion_beside_untouched_text_counts() {
    assert_eq!(risky_hunks(BASE, BASE, b"one\ntwo\nthree\nfour\n"), 1);
}

/// Their side equal to the base offers the merge nothing to take.
#[test]
fn nothing_is_risky_when_theirs_is_the_base() {
    assert_eq!(risky_hunks(OURS, BASE, BASE), 0);
}

#[test]
fn a_side_that_only_adds_lines_deletes_nothing() {
    assert!(deletes_nothing(BASE, b"zero\none\ntwo\nthree\nfour\n"));
    assert!(deletes_nothing(BASE, BASE));
    assert!(!deletes_nothing(BASE, b"one\nthree\n"));
    assert!(!deletes_nothing(BASE, b"one\n2\nthree\n"));
}

/// Zero risky hunks is proof; so is a theirs that only adds, whatever the
/// count, because taking insertions cannot remove a line of ours.
#[test]
fn confidence_follows_what_the_merge_could_drop() {
    assert_eq!(judge(OURS, BASE, BASE), (Confidence::Proven, 0));
    assert_eq!(
        judge(OURS, BASE, b"one\ntwo\nthree\nfour\n"),
        (Confidence::Proven, 1)
    );
    assert_eq!(judge(OURS, BASE, THEIRS), (Confidence::Ambiguous, 1));
}

/// The baseline beats the newer version that already holds our edit.
#[test]
fn the_candidate_with_the_fewest_risky_hunks_is_chosen() {
    let candidates: [&[u8]; 2] = [BASE, OURS];

    assert_eq!(
        select(OURS, THEIRS, &candidates),
        Some(Choice {
            index: 0,
            confidence: Confidence::Ambiguous,
            risky: 1,
        })
    );
}

/// Two candidates scoring the same: the older one wins, because a base that is
/// too old only adds questions while one too new can hide our edits.
#[test]
fn a_tie_goes_to_the_older_candidate() {
    let shifted: &[u8] = b"zero\none\ntwo\nthree\n";
    assert_eq!(risky_hunks(OURS, BASE, THEIRS), 1);
    assert_eq!(risky_hunks(OURS, shifted, THEIRS), 1);

    for order in [[BASE, shifted], [shifted, BASE]] {
        let chosen = select(OURS, THEIRS, &order).expect("a candidate is chosen");
        assert_eq!(chosen.index, 0, "the older candidate lost a tie");
    }
}

#[test]
fn no_candidates_is_no_base() {
    assert_eq!(select(OURS, THEIRS, &[]), None);
}
