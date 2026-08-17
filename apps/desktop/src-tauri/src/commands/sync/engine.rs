//! One sync engine per workspace, shared by every window showing it.
//!
//! The engine holds what has changed and not yet been recorded, and turns that
//! into commits once the changes settle. It is deliberately ignorant of where
//! changes come from: the watcher feeds it, and its own tests feed it the same
//! way, so the recording logic is testable without a window or an event loop.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::NativeError;

use super::conflict::ConflictCopy;
use super::pending::{commit_message, PendingChanges};
use super::snapshot;

/// How long a note must be still before it is recorded.
///
/// Long enough that a sentence being typed is one commit rather than ten, short
/// enough that a user who edits and immediately closes the app does not lose
/// the record of it. It also has to outlast a cloud daemon's write of a
/// moderately sized attachment, since the same window is what keeps a
/// half-downloaded file out of history.
pub const SETTLE: Duration = Duration::from_secs(3);

/// A workspace Auto Sync is recording.
pub struct Engine {
    /// Held across threads, so the repository is the thread-safe kind and each
    /// use makes its own thread-local handle.
    repo: gix::ThreadSafeRepository,
    pending: Mutex<PendingChanges>,
    /// Unresolved conflict copies, keyed by the copy's path.
    ///
    /// Keyed rather than listed because the same copy arrives twice: once from
    /// the scan when the workspace opens, and again from the watcher if the
    /// daemon writes it while the app is running. The user should be told about
    /// one conflict, not two.
    conflicts: Mutex<BTreeMap<String, ConflictCopy>>,
    /// Held for the whole of a commit, so only one is ever in flight.
    ///
    /// Recording reads the branch, builds a tree on it and moves the ref, and
    /// gix refuses the move if the ref changed underneath — so two at once do
    /// not corrupt history, they make one of them fail for no reason the user
    /// could act on. Separate from `pending` so notes can keep arriving while a
    /// commit is being written.
    recording: Mutex<()>,
}

impl Engine {
    pub fn new(repo: gix::Repository) -> Self {
        Self {
            repo: repo.into_sync(),
            pending: Mutex::new(PendingChanges::default()),
            conflicts: Mutex::new(BTreeMap::new()),
            recording: Mutex::new(()),
        }
    }

    /// Notes that `paths` changed, restarting each one's wait.
    pub fn note_changes(&self, paths: impl IntoIterator<Item = PathBuf>, at: Instant) {
        let mut pending = self.pending.lock().unwrap_or_else(|error| error.into_inner());
        for path in paths {
            pending.note(path, at);
        }
    }

    /// Adds conflict copies to the set awaiting resolution, reporting whether
    /// any of them is news.
    ///
    /// The same copy arrives more than once — from the scan and again from the
    /// watcher — and only the first time is worth telling anyone about.
    pub fn note_conflicts(&self, found: impl IntoIterator<Item = ConflictCopy>) -> bool {
        let mut conflicts = self.conflicts.lock().unwrap_or_else(|error| error.into_inner());
        found
            .into_iter()
            .filter(|copy| conflicts.insert(copy.copy.clone(), copy.clone()).is_none())
            .count()
            > 0
    }

    /// The conflicts this workspace is waiting on someone to resolve.
    #[allow(dead_code, reason = "story 4's conflict panel is the reader")]
    pub fn conflicts(&self) -> Vec<ConflictCopy> {
        let conflicts = self.conflicts.lock().unwrap_or_else(|error| error.into_inner());
        conflicts.values().cloned().collect()
    }

    /// Drops a conflict from the set, because it has been answered.
    pub fn forget_conflict(&self, copy: &str) {
        let mut conflicts = self.conflicts.lock().unwrap_or_else(|error| error.into_inner());
        conflicts.remove(copy);
    }

    /// A thread-local handle on the hidden repository, for tests that check
    /// what actually landed in history.
    #[cfg(test)]
    pub fn repository(&self) -> gix::Repository {
        self.repo.to_thread_local()
    }

    /// Records whatever has settled, returning the commit if there was one.
    ///
    /// A settled batch that turns out to change nothing — a save that rewrote a
    /// file with identical contents, or an edit the user undid — records
    /// nothing, because `record` refuses an empty commit.
    pub fn record_settled(&self, now: Instant) -> Result<Option<gix::ObjectId>, NativeError> {
        self.record(now, SETTLE)
    }

    /// Records everything outstanding, settled or not.
    ///
    /// For the moment a workspace closes. The settle window exists to batch a
    /// burst of typing into one commit, not to cancel it, so the last few
    /// seconds of edits are written rather than dropped on the way out.
    pub fn flush(&self) -> Result<Option<gix::ObjectId>, NativeError> {
        self.record(Instant::now(), Duration::ZERO)
    }

    fn record(&self, now: Instant, settle: Duration) -> Result<Option<gix::ObjectId>, NativeError> {
        let settled = {
            let mut pending = self.pending.lock().unwrap_or_else(|error| error.into_inner());
            pending.take_settled(now, settle)
        };
        // Cost, not correctness: `record` would reach the same answer, but the
        // sweeper asks this of every open workspace twice a second, and doing
        // so through three object reads to learn "nothing changed" is work
        // nobody asked for.
        if settled.is_empty() {
            return Ok(None);
        }

        let repo = self.repo.to_thread_local();

        // A conflict copy is a daemon's mess, not a version of the user's note.
        // Recording it would push it to their remote, where the other machine
        // syncs it back down. Both sides are held by a checkpoint before any
        // resolution touches them, so leaving it out of history loses nothing.
        let settled: Vec<PathBuf> = match repo.workdir() {
            Some(vault) => settled
                .into_iter()
                .filter(|path| !super::conflict::is_conflict_copy(vault, path))
                .collect(),
            None => settled,
        };
        if settled.is_empty() {
            return Ok(None);
        }

        let message = commit_message(settled.len(), gix::date::Time::now_local_or_utc());
        let _recording = self.recording.lock().unwrap_or_else(|error| error.into_inner());
        let recorded = snapshot::record(&repo, &settled, &message);

        // Taking a path out of `pending` is a promise to record it. If the
        // commit failed — a note that vanished mid-read, a folder that went
        // away with its drive — the promise is unkept, so the paths go back and
        // are tried again rather than quietly leaving history behind the vault.
        if recorded.is_err() {
            let mut pending = self.pending.lock().unwrap_or_else(|error| error.into_inner());
            for path in settled {
                pending.note(path, now);
            }
        }
        recorded
    }

    /// Takes a restore point for `paths` before anything overwrites them.
    pub fn checkpoint(&self, paths: &[PathBuf]) -> Result<gix::ObjectId, NativeError> {
        snapshot::checkpoint(&self.repo.to_thread_local(), paths)
    }
}

#[cfg(test)]
mod tests {
    use super::super::bootstrap::{bootstrap, Managed};
    use super::*;
    use crate::tests::make_temp_test_dir;
    use std::fs;
    use std::path::Path;

    struct Fixture {
        vault: PathBuf,
        engine: Engine,
    }

    fn fixture(name: &str) -> Fixture {
        let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
        let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
        let workspace = match bootstrap(&app_data, &vault).expect("bootstrap succeeds") {
            Managed::Yes(workspace) => *workspace,
            Managed::HasOwnGit => panic!("the vault was expected to be managed"),
        };
        Fixture {
            vault,
            engine: Engine::new(workspace.repo),
        }
    }

    fn write(root: &Path, relative: &str, contents: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("the folder exists");
        }
        fs::write(path, contents).expect("the file is written");
    }

    fn message_of(engine: &Engine, commit: gix::ObjectId) -> String {
        engine
            .repo
            .to_thread_local()
            .find_commit(commit)
            .expect("the commit exists")
            .message_raw_sloppy()
            .to_string()
    }

    /// A note is not recorded the instant it changes, because the user is
    /// probably still typing into it.
    #[test]
    fn an_edit_is_recorded_only_once_it_settles() {
        let f = fixture("engine-settles");
        let start = Instant::now();
        write(&f.vault, "one.md", "# One\n");
        f.engine.note_changes([PathBuf::from("one.md")], start);

        assert_eq!(
            f.engine.record_settled(start + SETTLE / 2).expect("recording succeeds"),
            None
        );
        assert!(f
            .engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds")
            .is_some());
    }

    #[test]
    fn the_message_counts_the_notes_in_the_commit() {
        let f = fixture("engine-message");
        let start = Instant::now();
        write(&f.vault, "one.md", "# One\n");
        write(&f.vault, "two.md", "# Two\n");
        f.engine
            .note_changes([PathBuf::from("one.md"), PathBuf::from("two.md")], start);

        let commit = f
            .engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds")
            .expect("a commit is made");

        assert!(
            message_of(&f.engine, commit).ends_with("— 2 notes changed"),
            "the message did not count the notes: {}",
            message_of(&f.engine, commit)
        );
    }

    #[test]
    fn an_idle_workspace_records_nothing() {
        let f = fixture("engine-idle");

        assert_eq!(
            f.engine.record_settled(Instant::now()).expect("recording succeeds"),
            None
        );
    }

    /// A save that rewrites a file with the same bytes is a real event the
    /// watcher reports, and it must not become a commit the user scrolls past.
    #[test]
    fn a_change_that_changed_nothing_records_nothing() {
        let f = fixture("engine-nochange");
        let start = Instant::now();
        write(&f.vault, "one.md", "# One\n");
        f.engine.note_changes([PathBuf::from("one.md")], start);
        f.engine.record_settled(start + SETTLE).expect("recording succeeds");

        write(&f.vault, "one.md", "# One\n");
        f.engine.note_changes([PathBuf::from("one.md")], start + SETTLE);

        assert_eq!(
            f.engine
                .record_settled(start + SETTLE + SETTLE)
                .expect("recording succeeds"),
            None
        );
    }

    /// The note the user edited is recorded; the copy the daemon dropped beside
    /// it is not.
    #[test]
    fn a_conflict_copy_is_not_recorded_in_history() {
        let f = fixture("engine-conflict");
        let start = Instant::now();
        write(&f.vault, "note.md", "# Mine\n");
        write(&f.vault, "note.sync-conflict-20260816-093100-K3SDFHG.md", "# Theirs\n");
        f.engine.note_changes(
            [
                PathBuf::from("note.md"),
                PathBuf::from("note.sync-conflict-20260816-093100-K3SDFHG.md"),
            ],
            start,
        );

        let commit = f
            .engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds")
            .expect("a commit is made");

        assert!(
            message_of(&f.engine, commit).ends_with("— 1 note changed"),
            "the conflict copy was counted: {}",
            message_of(&f.engine, commit)
        );
    }

    /// Nothing but a conflict copy settled, so there is nothing to record —
    /// and certainly not an empty commit.
    #[test]
    fn a_batch_of_only_conflict_copies_records_nothing() {
        let f = fixture("engine-conflict-only");
        let start = Instant::now();
        write(&f.vault, "note.md", "# Mine\n");
        write(&f.vault, "note.sync-conflict-20260816-093100-K3SDFHG.md", "# Theirs\n");

        f.engine.note_changes(
            [PathBuf::from("note.sync-conflict-20260816-093100-K3SDFHG.md")],
            start,
        );

        assert_eq!(
            f.engine.record_settled(start + SETTLE).expect("recording succeeds"),
            None
        );
    }

    /// The same copy is found twice — once by the scan when the workspace
    /// opens, once by the watcher if the daemon writes it while the app runs.
    /// The user has one conflict, so they hear about it once.
    #[test]
    fn a_conflict_found_twice_is_only_one_conflict() {
        let f = fixture("engine-conflict-dedup");
        let copy = ConflictCopy {
            copy: "note.sync-conflict-20260816-093100-K3SDFHG.md".to_string(),
            original: "note.md".to_string(),
            provider: "Syncthing",
        };

        f.engine.note_conflicts([copy.clone()]);
        f.engine.note_conflicts([copy.clone()]);

        assert_eq!(f.engine.conflicts(), [copy]);
    }

    /// Seeing the same copy again is not news, and telling every window it is
    /// would pop a notification for a conflict the user has already been shown.
    #[test]
    fn only_the_first_sighting_of_a_conflict_is_worth_announcing() {
        let f = fixture("engine-conflict-news");
        let copy = ConflictCopy {
            copy: "note.sync-conflict-20260816-093100-K3SDFHG.md".to_string(),
            original: "note.md".to_string(),
            provider: "Syncthing",
        };

        assert!(f.engine.note_conflicts([copy.clone()]), "the first sighting was silent");
        assert!(!f.engine.note_conflicts([copy]), "the same copy was announced twice");
    }

    #[test]
    fn a_deleted_note_is_recorded_when_it_settles() {
        let f = fixture("engine-delete");
        let start = Instant::now();
        write(&f.vault, "one.md", "# One\n");
        f.engine.note_changes([PathBuf::from("one.md")], start);
        f.engine.record_settled(start + SETTLE).expect("recording succeeds");

        fs::remove_file(f.vault.join("one.md")).expect("the note is deleted");
        f.engine.note_changes([PathBuf::from("one.md")], start + SETTLE);

        assert!(f
            .engine
            .record_settled(start + SETTLE + SETTLE)
            .expect("recording succeeds")
            .is_some());
    }

    /// Every commit the engine reports must be reachable from the branch it
    /// claims to have written.
    ///
    /// Recording reads HEAD, builds a tree on it, and moves the ref. Two of
    /// those interleaved both build on the *same* HEAD and both move the ref,
    /// so the loser's commit is orphaned — the engine returns an id for work
    /// that is no longer in history, and the notes in it are silently gone.
    #[test]
    fn concurrent_recording_leaves_one_unbroken_history() {
        let f = std::sync::Arc::new(fixture("engine-record-race"));
        let start = Instant::now();
        for index in 0..8 {
            write(&f.vault, &format!("note-{index}.md"), "# A note\n");
        }

        let committed: Vec<gix::ObjectId> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|index| {
                    let f = std::sync::Arc::clone(&f);
                    scope.spawn(move || {
                        f.engine
                            .note_changes([PathBuf::from(format!("note-{index}.md"))], start);
                        f.engine
                            .record_settled(start + SETTLE)
                            .expect("recording succeeds")
                    })
                })
                .collect();
            handles
                .into_iter()
                .filter_map(|handle| handle.join().expect("the thread finishes"))
                .collect()
        });

        let repo = f.engine.repo.to_thread_local();
        let head = snapshot::head_commit(&repo)
            .expect("reading the branch succeeds")
            .expect("something was committed");
        let ancestry: Vec<gix::ObjectId> = repo
            .find_commit(head)
            .expect("the commit exists")
            .ancestors()
            .all()
            .expect("the history walks")
            .map(|info| info.expect("the walk succeeds").id)
            .collect();

        for commit in &committed {
            assert!(
                ancestry.contains(commit),
                "a commit the engine reported is not in history — it forked: \
                 {commit} is not among {ancestry:?}"
            );
        }
    }

    /// Closing a window must not throw away what the user just typed. The
    /// settle window exists to batch a burst of edits, not to cancel them.
    #[test]
    fn flushing_records_edits_that_have_not_settled_yet() {
        let f = fixture("engine-flush");
        write(&f.vault, "one.md", "# One\n");
        f.engine.note_changes([PathBuf::from("one.md")], Instant::now());

        assert_eq!(
            f.engine.record_settled(Instant::now()).expect("recording succeeds"),
            None,
            "the edit should not have settled yet"
        );
        assert!(
            f.engine.flush().expect("flushing succeeds").is_some(),
            "the unsettled edit was dropped instead of recorded"
        );
    }

    /// Taking a path out of the pending set is a promise to record it. If the
    /// commit fails the promise is unkept, so the path has to come back — a
    /// note dropped here is a note history never hears about again.
    #[test]
    fn a_batch_that_could_not_be_recorded_is_tried_again() {
        let f = fixture("engine-retry");
        let start = Instant::now();
        f.engine.note_changes([PathBuf::from("../outside.md")], start);

        f.engine
            .record_settled(start + SETTLE)
            .expect_err("recording a path outside the vault fails");

        f.engine
            .record_settled(start + SETTLE + SETTLE)
            .expect_err("the failed batch was dropped instead of tried again");
    }

    /// Nothing pending means nothing to write, not an empty commit.
    #[test]
    fn flushing_an_idle_workspace_records_nothing() {
        let f = fixture("engine-flush-idle");

        assert_eq!(f.engine.flush().expect("flushing succeeds"), None);
    }

    /// Two windows on one vault share one engine, so recording has to be safe
    /// from more than one thread at a time.
    #[test]
    fn an_engine_can_be_used_from_several_threads() {
        let f = std::sync::Arc::new(fixture("engine-threads"));
        let start = Instant::now();
        for index in 0..8 {
            write(&f.vault, &format!("note-{index}.md"), "# A note\n");
        }

        std::thread::scope(|scope| {
            for index in 0..8 {
                let f = std::sync::Arc::clone(&f);
                scope.spawn(move || {
                    f.engine
                        .note_changes([PathBuf::from(format!("note-{index}.md"))], start);
                });
            }
        });

        let commit = f
            .engine
            .record_settled(start + SETTLE)
            .expect("recording succeeds")
            .expect("a commit is made");

        assert!(message_of(&f.engine, commit).ends_with("— 8 notes changed"));
    }
}
