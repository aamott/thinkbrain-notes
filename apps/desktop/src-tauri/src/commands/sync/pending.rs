//! Deciding when a burst of edits has finished, and what to call it.
//!
//! One window does two jobs here, which is why there is only one number to
//! tune. Waiting for a note to stop changing keeps history readable — a commit
//! per keystroke would be a keystroke log, not a history someone can restore
//! from. The same wait keeps history *correct*: a cloud daemon writing a large
//! attachment produces events all the way down, and recording one mid-download
//! stores a truncated file as a version the user could later restore to.

// The engine wiring is the last piece of story 1; until it lands these are
// exercised only by their own tests. See
// plans/auto-sync/pending-gix_engine_hidden_repo-high-hard.md.
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Vault changes seen but not yet recorded.
#[derive(Default)]
pub struct PendingChanges {
    /// Where a change was seen, and when it was last seen.
    seen: HashMap<PathBuf, Instant>,
}

impl PendingChanges {
    /// Notes that `path` changed at `at`, restarting its wait.
    pub fn note(&mut self, path: PathBuf, at: Instant) {
        self.seen.insert(path, at);
    }

    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }

    /// Removes and returns the paths that have been still for `settle`.
    ///
    /// Per path, not per batch: one large attachment still arriving must not
    /// hold an evening of note edits out of history.
    pub fn take_settled(&mut self, now: Instant, settle: Duration) -> Vec<PathBuf> {
        let mut settled: Vec<PathBuf> = self
            .seen
            .iter()
            .filter(|(_, last_seen)| now.duration_since(**last_seen) >= settle)
            .map(|(path, _)| path.clone())
            .collect();

        // Sorted so a commit's file list, and the count in its message, do not
        // depend on hash iteration order.
        settled.sort();
        for path in &settled {
            self.seen.remove(path);
        }
        settled
    }
}

/// What the user reads in their history.
///
/// This is the whole of what a nontechnical person sees of git, so it says when
/// and how much and never says "commit". The timestamp is local: "09:31" means
/// the 09:31 they remember working at.
pub fn commit_message(changed: usize, at: gix::date::Time) -> String {
    const WHEN: &str = "%Y-%m-%d %H:%M";
    let when = at.format_or_unix(gix::date::time::CustomFormat::new(WHEN));
    let notes = if changed == 1 { "note" } else { "notes" };
    format!("Sync {when} — {changed} {notes} changed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{Duration, Instant};

    const SETTLE: Duration = Duration::from_secs(2);

    fn path(name: &str) -> PathBuf {
        PathBuf::from(name)
    }

    /// Typing produces a change event every few keystrokes. Committing each one
    /// would turn history into a keystroke log, so nothing is recorded until the
    /// file has been still for a moment.
    #[test]
    fn a_note_still_being_edited_is_not_recorded_yet() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("one.md"), start);

        assert!(pending.take_settled(start + SETTLE / 2, SETTLE).is_empty());
    }

    #[test]
    fn a_note_that_has_stopped_changing_is_recorded() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("one.md"), start);

        assert_eq!(pending.take_settled(start + SETTLE, SETTLE), [path("one.md")]);
    }

    /// The same window that keeps history readable also keeps it correct. A
    /// cloud daemon writing a large attachment produces events the whole way
    /// down; recording one mid-download stores a truncated file as a version
    /// the user could later restore.
    #[test]
    fn a_file_still_arriving_keeps_resetting_its_wait() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("big.png"), start);
        pending.note(path("big.png"), start + SETTLE / 2);

        assert!(
            pending.take_settled(start + SETTLE, SETTLE).is_empty(),
            "a file that was still being written was recorded"
        );
        assert_eq!(
            pending.take_settled(start + SETTLE / 2 + SETTLE, SETTLE),
            [path("big.png")]
        );
    }

    #[test]
    fn a_recorded_note_leaves_the_batch() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("one.md"), start);

        pending.take_settled(start + SETTLE, SETTLE);

        assert!(pending.is_empty());
    }

    /// One slow file must not hold up the rest. Otherwise a single large
    /// attachment still downloading would keep an evening's worth of note edits
    /// out of history.
    #[test]
    fn a_settled_note_does_not_wait_for_an_unsettled_one() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("one.md"), start);
        pending.note(path("big.png"), start + SETTLE);

        assert_eq!(pending.take_settled(start + SETTLE, SETTLE), [path("one.md")]);
        assert!(!pending.is_empty(), "the unsettled file was dropped");
        assert_eq!(
            pending.take_settled(start + SETTLE + SETTLE, SETTLE),
            [path("big.png")]
        );
    }

    #[test]
    fn a_note_changed_twice_is_recorded_once() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        pending.note(path("one.md"), start);
        pending.note(path("one.md"), start);

        assert_eq!(pending.take_settled(start + SETTLE, SETTLE), [path("one.md")]);
    }

    /// Settled paths come out in a stable order so a commit's file list, and
    /// the message that counts it, do not depend on hash iteration order.
    #[test]
    fn settled_notes_come_out_in_a_stable_order() {
        let start = Instant::now();
        let mut pending = PendingChanges::default();
        for name in ["c.md", "a.md", "b.md"] {
            pending.note(path(name), start);
        }

        assert_eq!(
            pending.take_settled(start + SETTLE, SETTLE),
            [path("a.md"), path("b.md"), path("c.md")]
        );
    }

    /// The message is the whole of what a nontechnical user sees of git. It
    /// says when and how much, and never says "commit".
    #[test]
    fn the_message_says_when_and_how_much() {
        let at = gix::date::Time::new(1_786_872_660, 0);

        assert_eq!(commit_message(3, at), "Sync 2026-08-16 09:31 — 3 notes changed");
    }

    #[test]
    fn the_message_counts_a_single_note_in_the_singular() {
        let at = gix::date::Time::new(1_786_872_660, 0);

        assert_eq!(commit_message(1, at), "Sync 2026-08-16 09:31 — 1 note changed");
    }
}
