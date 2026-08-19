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

use crate::error::lock_or_recover;
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
    /// The last attempt to record that failed, cleared by the next that works.
    problem: Mutex<Option<NativeError>>,
    /// Held for the whole of a commit, so only one is ever in flight.
    ///
    /// Recording reads the branch, builds a tree on it and moves the ref, and
    /// gix refuses the move if the ref changed underneath — so two at once do
    /// not corrupt history, they make one of them fail for no reason the user
    /// could act on. Separate from `pending` so notes can keep arriving while a
    /// commit is being written.
    recording: Mutex<()>,
    /// Whether the vault is also a git repository of the user's own.
    has_own_git: bool,
}

impl Engine {
    pub fn new(repo: gix::Repository, has_own_git: bool) -> Self {
        Self {
            repo: repo.into_sync(),
            has_own_git,
            pending: Mutex::new(PendingChanges::default()),
            conflicts: Mutex::new(BTreeMap::new()),
            problem: Mutex::new(None),
            recording: Mutex::new(()),
        }
    }

    /// Notes that `paths` changed, restarting each one's wait.
    pub fn note_changes(&self, paths: impl IntoIterator<Item = PathBuf>, at: Instant) {
        let mut pending = lock_or_recover(&self.pending);
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
        let mut conflicts = lock_or_recover(&self.conflicts);
        found
            .into_iter()
            .filter(|copy| conflicts.insert(copy.copy.clone(), copy.clone()).is_none())
            .count()
            > 0
    }

    /// The conflicts this workspace is waiting on someone to resolve.
    pub fn conflicts(&self) -> Vec<ConflictCopy> {
        let conflicts = lock_or_recover(&self.conflicts);
        conflicts.values().cloned().collect()
    }

    /// Whether this vault is also a git repository of the user's own.
    ///
    /// Nothing acts on this — it exists so a window can say that two histories
    /// are being kept here, rather than letting someone discover the second one
    /// by accident.
    pub fn alongside_own_git(&self) -> bool {
        self.has_own_git
    }

    /// Drops a conflict from the set, because it has been answered.
    pub fn forget_conflict(&self, copy: &str) {
        let mut conflicts = lock_or_recover(&self.conflicts);
        conflicts.remove(copy);
    }

    /// A thread-local handle on the hidden repository.
    ///
    /// The history and restore surfaces read through this rather than reopening
    /// the repository by path: the engine already knows where it is, and a
    /// second handle would be a second answer to "where does this vault's
    /// history live".
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
            let mut pending = lock_or_recover(&self.pending);
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
        let _recording = lock_or_recover(&self.recording);
        let recorded = snapshot::record(&repo, &settled, &message);

        // Taking a path out of `pending` is a promise to record it. If the
        // commit failed — a note that vanished mid-read, a folder that went
        // away with its drive — the promise is unkept, so the paths go back and
        // are tried again rather than quietly leaving history behind the vault.
        if recorded.is_err() {
            let mut pending = lock_or_recover(&self.pending);
            for path in settled {
                pending.note(path, now);
            }
        }
        self.remember(&recorded);
        recorded
    }

    /// Keeps a failure to record, and lets the next success clear it.
    ///
    /// The sweeper has nobody to show an error to, so until now one went to
    /// stderr and the app went on looking healthy. Holding the last one here is
    /// what lets a window say "recording stopped, and here is what to do".
    fn remember(&self, outcome: &Result<Option<gix::ObjectId>, NativeError>) {
        let mut problem = lock_or_recover(&self.problem);
        *problem = outcome.as_ref().err().cloned();
    }

    /// Takes a restore point for `paths` before anything overwrites them.
    pub fn checkpoint(
        &self,
        paths: &[PathBuf],
        reason: snapshot::Reason,
    ) -> Result<gix::ObjectId, NativeError> {
        snapshot::checkpoint(&self.repo.to_thread_local(), paths, reason)
    }

    /// How many changes are waiting to be recorded.
    ///
    /// What the status pill turns into "Saving…". Zero is the resting state and
    /// the only one anybody should see for long.
    pub fn waiting(&self) -> usize {
        let pending = lock_or_recover(&self.pending);
        pending.len()
    }

    /// The last failure to record, if the one after it has not cleared it.
    ///
    /// Until now a failure went to stderr, where nobody has ever looked. This
    /// is the field that turns "your notes silently stopped being recorded"
    /// into something a window can say out loud.
    pub fn problem(&self) -> Option<NativeError> {
        let problem = lock_or_recover(&self.problem);
        problem.clone()
    }
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
