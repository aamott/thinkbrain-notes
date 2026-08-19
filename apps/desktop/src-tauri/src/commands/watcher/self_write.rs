//! Records the disk writes this app performed, so their echoes can be ignored.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::lock_or_recover;

/// How long an unclaimed self-write record keeps suppressing.
///
/// Comfortably longer than the debounce window, so a real echo is always still
/// expected when it arrives, and short enough that a missing echo stops
/// mattering quickly.
pub const SELF_WRITE_TTL: Duration = Duration::from_secs(5);

/// Records the disk writes this app performed, so their echoes can be ignored.
pub struct SelfWriteLog {
    expected: Mutex<Option<HashMap<PathBuf, Vec<Instant>>>>,
}

impl SelfWriteLog {
    pub const fn new() -> Self {
        Self {
            expected: Mutex::new(None),
        }
    }

    /// Notes that the app just wrote `path` and expects one echo for it.
    pub fn record_at(&self, path: &Path, at: Instant) {
        let mut guard = lock_or_recover(&self.expected);
        let entries = guard.get_or_insert_with(HashMap::new);
        // Sweep here, because a query only ever prunes the one path it asks
        // about and some records are never queried at all: a folder delete
        // becomes a rescan before the log is consulted, a rename's old path is
        // never looked up, and a write that fails records an echo that cannot
        // happen. Left alone the map would grow for the life of the process.
        entries.retain(|_, times| {
            times.retain(|recorded| at.duration_since(*recorded) <= SELF_WRITE_TTL);
            !times.is_empty()
        });
        entries.entry(path.to_path_buf()).or_default().push(at);
    }

    /// Claims the outstanding echoes for `path`, returning whether any were ours.
    ///
    /// One arriving event settles *every* write we are still expecting for that
    /// path, because the debouncer has already coalesced the burst: two rapid
    /// saves reach us as one event. Claiming them one at a time would strand a
    /// record, and a stranded record swallows the next edit — which is exactly
    /// the external change this feature exists to catch. Erring the other way
    /// costs at most one redundant reindex when the OS does *not* coalesce.
    ///
    /// Expired records are dropped rather than claimed, so a write whose echo
    /// never arrived cannot silently swallow a later external edit either.
    pub fn take_at(&self, path: &Path, now: Instant) -> bool {
        let mut guard = lock_or_recover(&self.expected);
        let Some(entries) = guard.as_mut() else {
            return false;
        };
        let Some(times) = entries.get_mut(path) else {
            return false;
        };
        times.retain(|recorded| now.duration_since(*recorded) <= SELF_WRITE_TTL);
        let claimed = !times.is_empty();
        entries.remove(path);
        claimed
    }
}

impl Default for SelfWriteLog {
    fn default() -> Self {
        Self::new()
    }
}

static SELF_WRITES: SelfWriteLog = SelfWriteLog::new();

/// Records that the app itself just wrote `path`.
///
/// Called by every command that changes a file on disk. A path the app never
/// wrote is never suppressed, so forgetting a call site costs a redundant
/// reindex, never a missed external edit.
pub fn record_self_write(path: &Path) {
    SELF_WRITES.record_at(path, Instant::now());
}

pub(crate) fn take_self_write(path: &Path) -> bool {
    SELF_WRITES.take_at(path, Instant::now())
}
