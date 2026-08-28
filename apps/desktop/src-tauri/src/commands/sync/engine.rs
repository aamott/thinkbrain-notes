//! One sync engine per workspace, shared by every window showing it.
//!
//! The engine holds what has changed and not yet been recorded, and turns that
//! into commits once the changes settle. It is deliberately ignorant of where
//! changes come from: the watcher feeds it, and its own tests feed it the same
//! way, so the recording logic is testable without a window or an event loop.

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::NativeError;
use crate::error::lock_or_recover;

use super::conflict::ConflictCopy;
use super::pending::{PendingChanges, commit_message};
use super::snapshot;

/// How long a note must be still before it is recorded.
///
/// Long enough that a sentence being typed is one commit rather than ten, short
/// enough that a user who edits and immediately closes the app does not lose
/// the record of it. It also has to outlast a cloud daemon's write of a
/// moderately sized attachment, since the same window is what keeps a
/// half-downloaded file out of history.
pub const SETTLE: Duration = Duration::from_secs(3);

/// A note that could not be written or recorded, with something to do about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StuckNote {
    /// Vault-relative, forward slashes.
    pub path: String,
    pub code: String,
    pub message: String,
    /// Blob to retry writing, when this was an incoming note. Recording
    /// failures have nothing to put — they retry by reading the disk again.
    #[serde(skip)]
    pub blob: Option<gix::ObjectId>,
}

/// A shortcut in the recorded tree that this device will not create.
pub const SYMLINK_SKIPPED: &str = "sync.symlink_skipped";
/// A nested repository in the recorded tree that this device will not clone.
pub const SUBMODULE_SKIPPED: &str = "sync.submodule_skipped";

/// Whether `code` is a skipped tree entry rather than a write/record failure.
pub fn is_unsupported(code: &str) -> bool {
    code == SYMLINK_SKIPPED || code == SUBMODULE_SKIPPED
}

/// Where a round trip currently is, for the footer to name without git jargon.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SyncPhase {
    /// Recording outstanding local edits before talking to the other end.
    Saving,
    /// Fetching what changed there.
    Checking,
    /// Joining the two histories.
    Combining,
    /// Sending this device's notes onward.
    Sending,
}

/// Whether a git link has ever completed a round trip from this device.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SyncHealth {
    #[default]
    Unknown,
    Healthy,
    Problem,
}

impl StuckNote {
    /// A note that could not be recorded (no blob to retry from).
    pub fn recording(path: String, error: NativeError) -> Self {
        Self {
            path,
            blob: None,
            code: error.code,
            message: error.message,
        }
    }

    /// A note that could not be written, with the blob to retry from.
    pub fn incoming(path: String, blob: gix::ObjectId, error: NativeError) -> Self {
        Self {
            path,
            blob: Some(blob),
            code: error.code,
            message: error.message,
        }
    }

    /// A tree entry this device will not create: a shortcut or a nested
    /// repository. There is nothing to retry locally.
    pub fn unsupported(path: String, code: &'static str, message: &'static str) -> Self {
        Self {
            path,
            blob: None,
            code: code.to_string(),
            message: message.to_string(),
        }
    }
}

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
    /// Notes that could not be written or recorded, keyed by path.
    ///
    /// One bad note must not stall the vault: the rest still lands, and this
    /// set is what the footer counts as needing attention until a retry works.
    stuck: Mutex<BTreeMap<String, StuckNote>>,
    /// A round trip to another device is in flight.
    syncing: AtomicBool,
    /// The named step of the in-flight round trip, if any.
    phase: Mutex<Option<SyncPhase>>,
    /// When a round trip last completed successfully, in milliseconds since the epoch.
    last_checked_at: Mutex<Option<u64>>,
    /// The last attempt to record that failed, cleared by the next that works.
    ///
    /// Vault-wide only: a single note that could not be read is [`stuck`], not
    /// this, so the rest of the vault keeps being saved.
    problem: Mutex<Option<NativeError>>,
    /// The most recent round trip that failed.
    ///
    /// Separate from `problem`: recording a later local edit must not erase a
    /// sign-in or network problem before the next round trip succeeds.
    sync_problem: Mutex<Option<NativeError>>,
    /// Held for the whole of a commit, so only one is ever in flight.
    ///
    /// Recording reads the branch, builds a tree on it and moves the ref, and
    /// gix refuses the move if the ref changed underneath — so two at once do
    /// not corrupt history, they make one of them fail for no reason the user
    /// could act on. Separate from `pending` so notes can keep arriving while a
    /// commit is being written.
    recording: Mutex<()>,
    /// The last failure to tidy private undo history. Recording ignores it.
    maintenance_problem: Mutex<Option<NativeError>>,
    /// Whether the vault is also a git repository of the user's own.
    has_own_git: bool,
    /// Last time a note changed, for the idle debounce that fires a round trip.
    last_touched: Mutex<Instant>,
    /// When a round trip was last *started*, in seconds since the epoch.
    ///
    /// Wall clock, not `Instant`: Android freezes the process and a monotonic
    /// clock keeps counting through the freeze, so a vault that synced moments
    /// before going into a pocket looked an hour unsynced when it came out.
    ///
    /// Attempts, not successes. A vault with a bad link or a missing sign-in
    /// never succeeds, and a gate driven by successes would let the sweeper
    /// retry it on every tick.
    last_attempt: Mutex<Option<u64>>,
}

impl Engine {
    pub fn new(repo: gix::Repository, has_own_git: bool) -> Self {
        Self {
            repo: repo.into_sync(),
            has_own_git,
            pending: Mutex::new(PendingChanges::default()),
            conflicts: Mutex::new(BTreeMap::new()),
            stuck: Mutex::new(BTreeMap::new()),
            syncing: AtomicBool::new(false),
            phase: Mutex::new(None),
            last_checked_at: Mutex::new(None),
            problem: Mutex::new(None),
            sync_problem: Mutex::new(None),
            recording: Mutex::new(()),
            maintenance_problem: Mutex::new(None),
            last_touched: Mutex::new(Instant::now()),
            last_attempt: Mutex::new(None),
        }
    }

    /// Notes that `paths` changed, restarting each one's wait.
    ///
    /// A path that was stuck gets another chance: the user editing it, or the
    /// folder becoming readable again, is exactly the signal that a retry is
    /// worth it — and the sweeper must not keep hammering a note that cannot
    /// be read.
    pub fn note_changes(&self, paths: impl IntoIterator<Item = PathBuf>, at: Instant) {
        let mut pending = lock_or_recover(&self.pending);
        let mut stuck = lock_or_recover(&self.stuck);
        for path in paths {
            stuck.remove(&super::conflict::relative_str(&path));
            pending.note(path, at);
        }
        *lock_or_recover(&self.last_touched) = at;
    }

    /// Adds conflict copies to the set awaiting resolution, reporting whether
    /// any of them is news.
    ///
    /// The same copy arrives more than once — from the scan and again from the
    /// watcher — and only the first time is worth telling anyone about.
    pub fn note_conflicts(&self, found: impl IntoIterator<Item = ConflictCopy>) -> bool {
        let mut conflicts = lock_or_recover(&self.conflicts);
        let mut any_new = false;
        for copy in found {
            if conflicts.insert(copy.copy.clone(), copy.clone()).is_none() {
                any_new = true;
            }
        }
        any_new
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
                .filter(|path| !super::conflict::excluded_from_history(vault, path))
                .collect(),
            None => settled,
        };
        if settled.is_empty() {
            return Ok(None);
        }

        let message = commit_message(settled.len(), gix::date::Time::now_local_or_utc());
        let _recording = lock_or_recover(&self.recording);
        let recorded = snapshot::landed(&repo, &settled, &message);

        // Taking a path out of `pending` is a promise to record it. A
        // vault-wide failure — the object store, the branch — puts every
        // path back. A single note that cannot be read is skipped instead,
        // so the rest of the vault stays in step.
        match &recorded {
            Err(error) => {
                let mut pending = lock_or_recover(&self.pending);
                for path in settled {
                    pending.note(path, now);
                }
                self.set_problem(Some(error.clone()));
            }
            Ok(landed) => {
                let mut stuck = lock_or_recover(&self.stuck);
                for (path, error) in &landed.skipped {
                    let relative = super::conflict::relative_str(path);
                    stuck.insert(
                        relative.clone(),
                        StuckNote::recording(relative, error.clone()),
                    );
                }
                self.set_problem(None);
            }
        }
        recorded.map(|landed| landed.commit)
    }

    fn set_problem(&self, problem: Option<NativeError>) {
        *lock_or_recover(&self.problem) = problem;
    }

    /// Takes a restore point for `paths` before anything overwrites them.
    pub fn checkpoint(
        &self,
        paths: &[PathBuf],
        reason: snapshot::Reason,
    ) -> Result<gix::ObjectId, NativeError> {
        let recording = lock_or_recover(&self.recording);
        self.checkpoint_while_recording(&recording, paths, reason)
    }

    #[cfg(test)]
    pub(super) fn try_checkpoint(
        &self,
        paths: &[PathBuf],
        reason: snapshot::Reason,
    ) -> Result<Option<gix::ObjectId>, NativeError> {
        let recording = match self.recording.try_lock() {
            Ok(recording) => recording,
            Err(std::sync::TryLockError::WouldBlock) => return Ok(None),
            Err(std::sync::TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
        };
        self.checkpoint_while_recording(&recording, paths, reason)
            .map(Some)
    }

    fn checkpoint_while_recording(
        &self,
        _recording: &std::sync::MutexGuard<'_, ()>,
        paths: &[PathBuf],
        reason: snapshot::Reason,
    ) -> Result<gix::ObjectId, NativeError> {
        snapshot::checkpoint(&self.repo.to_thread_local(), paths, reason)
    }

    /// The last failure to tidy private undo history, if any.
    pub fn maintenance_problem(&self) -> Option<NativeError> {
        lock_or_recover(&self.maintenance_problem).clone()
    }

    /// Records a tidy failure without stopping recording.
    pub fn set_maintenance_problem(&self, problem: Option<NativeError>) {
        *lock_or_recover(&self.maintenance_problem) = problem;
    }

    /// Whether automatic tidy is due for this vault.
    pub fn due_for_maintenance(&self) -> bool {
        super::maintain::due(&self.repository(), SystemTime::now())
    }

    /// Tidies private undo history under the recording lock.
    ///
    /// `force` is the Settings button: it runs even if a pass already happened
    /// today. Automatic paths pass `false`. A failure is remembered and
    /// returned; recording is left alone.
    pub fn maintain(&self, force: bool) -> Result<super::maintain::Cleanup, NativeError> {
        let _recording = lock_or_recover(&self.recording);
        self.maintain_locked(force)
    }

    #[cfg(test)]
    pub(super) fn maintain_after_lock(
        &self,
        force: bool,
        after_lock: impl FnOnce(),
    ) -> Result<super::maintain::Cleanup, NativeError> {
        let _recording = lock_or_recover(&self.recording);
        after_lock();
        self.maintain_locked(force)
    }

    fn maintain_locked(&self, force: bool) -> Result<super::maintain::Cleanup, NativeError> {
        let repo = self.repository();
        if !force && !super::maintain::due(&repo, SystemTime::now()) {
            return Ok(super::maintain::Cleanup {
                bytes_before: 0,
                bytes_after: 0,
                reclaimed: 0,
            });
        }
        let now = SystemTime::now();
        let seconds = now
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_secs() as i64)
            .unwrap_or(0);
        match super::maintain::cleanup(&repo, seconds, &super::maintain::Policy::default()) {
            Ok(done) => {
                if let Err(error) = super::maintain::mark_done(&repo, now) {
                    eprintln!("[sync] could not remember history maintenance: {error:?}");
                }
                self.set_maintenance_problem(None);
                if done.reclaimed > 0 {
                    eprintln!(
                        "[sync] history maintenance reclaimed {} bytes",
                        done.reclaimed
                    );
                }
                Ok(done)
            }
            Err(error) => {
                eprintln!("[sync] history maintenance failed: {error:?}");
                self.set_maintenance_problem(Some(error.clone()));
                Err(error)
            }
        }
    }

    /// Drops private restore points, then collects what that made unreachable.
    pub fn clear_undo(&self) -> Result<super::maintain::Cleanup, NativeError> {
        let _recording = lock_or_recover(&self.recording);
        let repo = self.repository();
        match super::maintain::clear_undo(&repo) {
            Ok(done) => {
                self.set_maintenance_problem(None);
                if let Err(error) = super::maintain::mark_done(&repo, SystemTime::now()) {
                    eprintln!("[sync] could not remember history maintenance: {error:?}");
                }
                eprintln!(
                    "[sync] cleared private undo history, reclaimed {} bytes",
                    done.reclaimed
                );
                Ok(done)
            }
            Err(error) => {
                eprintln!("[sync] could not clear undo history: {error:?}");
                self.set_maintenance_problem(Some(error.clone()));
                Err(error)
            }
        }
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
        lock_or_recover(&self.problem).clone()
    }

    /// The last round-trip failure, cleared only by a successful round trip.
    pub fn sync_problem(&self) -> Option<NativeError> {
        lock_or_recover(&self.sync_problem).clone()
    }

    /// Records whether the configured git link was reached successfully.
    pub fn set_sync_problem(&self, problem: Option<NativeError>) {
        let healthy = problem.is_none();
        *lock_or_recover(&self.sync_problem) = problem;
        if healthy {
            self.mark_checked();
        }
    }

    /// The named step of the in-flight round trip, if any.
    pub fn phase(&self) -> Option<SyncPhase> {
        *lock_or_recover(&self.phase)
    }

    /// Sets the named step of the in-flight round trip.
    pub fn set_phase(&self, phase: Option<SyncPhase>) {
        *lock_or_recover(&self.phase) = phase;
    }

    /// When a round trip last completed successfully.
    pub fn last_checked_at(&self) -> Option<u64> {
        *lock_or_recover(&self.last_checked_at)
    }

    /// Marks a successful round trip for the health indicator.
    pub fn mark_checked(&self) {
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(0);
        *lock_or_recover(&self.last_checked_at) = Some(at);
    }

    /// Notes that could not be written or recorded, waiting on a retry.
    pub fn stuck(&self) -> Vec<StuckNote> {
        lock_or_recover(&self.stuck).values().cloned().collect()
    }

    /// Records notes that a round trip could not write, so the next attempt
    /// retries only those paths.
    pub fn note_stuck(&self, notes: impl IntoIterator<Item = StuckNote>) {
        let mut stuck = lock_or_recover(&self.stuck);
        for note in notes {
            stuck.insert(note.path.clone(), note);
        }
    }

    /// Drops a stuck note, because a retry wrote it or the user moved it.
    pub fn forget_stuck(&self, path: &str) {
        lock_or_recover(&self.stuck).remove(path);
    }

    /// Drops skipped-entry warnings so the next trip can reconstruct them
    /// from the recorded tree. Write and record failures are left alone.
    pub fn forget_unsupported(&self) {
        lock_or_recover(&self.stuck).retain(|_, note| !is_unsupported(&note.code));
    }

    /// Whether a round trip to another device is in flight.
    pub fn syncing(&self) -> bool {
        self.syncing.load(Ordering::Relaxed)
    }

    /// Marks a round trip as started or finished.
    ///
    /// Returns whether this call changed the flag, so the caller can announce
    /// only when the footer would actually read differently.
    pub fn set_syncing(&self, on: bool) -> bool {
        if !on {
            self.set_phase(None);
        }
        self.syncing.swap(on, Ordering::Relaxed) != on
    }

    /// Marks a round trip as started, for the frequency gate.
    pub fn mark_attempt(&self, now_secs: u64) {
        *lock_or_recover(&self.last_attempt) = Some(now_secs);
    }

    /// Whether this vault has been still long enough, and it has been long
    /// enough since the last round trip, to sync without a click.
    ///
    /// Two clocks on purpose. Quiet is monotonic: it only ever measures
    /// seconds between local edits inside one run, where a user changing their
    /// clock must not count as typing. The interval is wall-clock, so a freeze
    /// cannot fake it.
    pub fn ready_to_sync(
        &self,
        quiet: Duration,
        interval_secs: u64,
        now: Instant,
        now_secs: u64,
    ) -> bool {
        if self.syncing() {
            return false;
        }
        let touched = *lock_or_recover(&self.last_touched);
        if now.saturating_duration_since(touched) < quiet {
            return false;
        }
        match *lock_or_recover(&self.last_attempt) {
            None => true,
            Some(last) => super::schedule::elapsed_at_least(last, now_secs, interval_secs),
        }
    }
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
