//! When an automatic round trip is allowed to start.
//!
//! One rule: a vault syncs once it has been quiet for `quiet_secs` and its
//! last attempted round trip is older than `interval_secs`. Both numbers come
//! from settings; the second is measured on a wall clock.
//!
//! The wall clock is the point. Android freezes a process rather than stopping
//! its monotonic clock, so `Instant` arithmetic across a freeze measures time
//! that passed for the world and not for the app — which is how a vault that
//! synced moments before going into a pocket came out looking an hour stale.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::lock_or_recover;

/// Composed settings keys: module `sync`, declared in
/// `packages/core/src/settings/modules/sync.ts`. Spelled out here rather than
/// derived because this side answers the question before any window is
/// listening. Changing a key there means changing it here.
const AUTOMATICALLY: &str = "sync.automatically";
const INTERVAL_SECONDS: &str = "sync.intervalSeconds";
const QUIET_SECONDS: &str = "sync.quietSeconds";
const ON_OPEN: &str = "sync.onOpen";
const ON_LEAVE: &str = "sync.onLeave";

/// Mirrored from the `DEFAULT_SYNC_*` exports in that same module.
pub const DEFAULT_AUTOMATICALLY: bool = true;
pub const DEFAULT_INTERVAL_SECS: u64 = 60;
pub const DEFAULT_QUIET_SECS: u64 = 30;
pub const DEFAULT_ON_OPEN: bool = true;
pub const DEFAULT_ON_LEAVE: bool = true;

/// Mirrored from the `SYNC_*_MIN`/`_MAX` exports in that same module.
///
/// Enforced again here because the settings screen is not the only way a value
/// reaches the file: it can be hand-edited, and an interval of zero read
/// literally is a git fetch on every tick.
pub const MIN_INTERVAL_SECS: u64 = 30;
pub const MAX_INTERVAL_SECS: u64 = 3600;
pub const MIN_QUIET_SECS: u64 = 5;
pub const MAX_QUIET_SECS: u64 = 300;

/// How long a round trip may hold the sync claim before a later one may take
/// it over.
///
/// Generous on purpose. `round::sync` takes the workspace lane before it
/// touches the claim, so a trip that takes over does not run alongside the one
/// it replaced — it waits behind it. The bound only has to exceed a plausible
/// sync, not every conceivable one.
pub const ORPHAN_AFTER_SECS: u64 = 600;

/// What the user has asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Schedule {
    pub automatically: bool,
    pub interval_secs: u64,
    pub quiet_secs: u64,
    pub on_open: bool,
    pub on_leave: bool,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            automatically: DEFAULT_AUTOMATICALLY,
            interval_secs: DEFAULT_INTERVAL_SECS,
            quiet_secs: DEFAULT_QUIET_SECS,
            on_open: DEFAULT_ON_OPEN,
            on_leave: DEFAULT_ON_LEAVE,
        }
    }
}

impl Schedule {
    /// The quiet window, for the monotonic side of the gate.
    pub fn quiet(&self) -> Duration {
        Duration::from_secs(self.quiet_secs)
    }
}

/// Whether at least `threshold_secs` have passed, on a clock worth believing.
///
/// A timestamp in the future is not evidence of freshness; it is evidence the
/// clock is untrustworthy, and the safe reading of an untrustworthy clock is
/// "do the work". A `saturating_sub` here would floor to zero and leave a
/// vault permanently fresh after any backwards jump.
pub fn elapsed_at_least(last_secs: u64, now_secs: u64, threshold_secs: u64) -> bool {
    if now_secs < last_secs {
        return true;
    }
    now_secs - last_secs >= threshold_secs
}

/// How long a resolved schedule is trusted before the file is read again.
///
/// The sweeper asks every tick. Five seconds keeps that to one read per five
/// seconds however many vaults are open, and is short enough that changing a
/// setting takes effect while the user is still looking at the screen.
const CACHE_FOR: Duration = Duration::from_secs(5);

static CACHE: Mutex<Option<(Instant, Schedule)>> = Mutex::new(None);

/// The schedule in force, from the app settings file.
pub fn resolved() -> Schedule {
    let mut cache = lock_or_recover(&CACHE);
    if let Some((read_at, schedule)) = *cache {
        // A freeze inflates this elapsed time and expires the cache early,
        // which is the harmless direction: a re-read, not a stale answer.
        if read_at.elapsed() < CACHE_FOR {
            return schedule;
        }
    }
    let schedule = resolved_in(super::settle::settings_home().as_deref());
    *cache = Some((Instant::now(), schedule));
    schedule
}

/// Drops the cached schedule, so the next `resolved` reads the file.
pub fn forget_cached() {
    *lock_or_recover(&CACHE) = None;
}

/// The same, told where to look and never cached, so a test can hold a real
/// file rather than a location the whole process shares. `None` also occurs in
/// production, before `remember_settings_home` has been called.
pub fn resolved_in(app_data_dir: Option<&Path>) -> Schedule {
    let Some(app_data_dir) = app_data_dir else {
        return Schedule::default();
    };
    let path = crate::commands::settings::app_settings_path(app_data_dir);
    let Ok(contents) = crate::commands::settings::read_settings_file(&path) else {
        return Schedule::default();
    };
    let record = crate::commands::settings::parse_app_settings_record(contents.as_deref());
    // Absent, mistyped and unparseable all land on the declared default. An
    // unreadable preference must never be read as "stop syncing".
    let flag = |key: &str, fallback: bool| {
        record
            .get(key)
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(fallback)
    };
    let secs = |key: &str, fallback: u64, min: u64, max: u64| {
        record
            .get(key)
            // `as_f64` rather than `as_u64` so a number someone typed with a
            // decimal point is rounded into range instead of failing to parse
            // and silently falling back — which showed them one interval and
            // gave them another.
            .and_then(serde_json::Value::as_f64)
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map_or(fallback, |value| (value.round() as u64).clamp(min, max))
    };
    Schedule {
        automatically: flag(AUTOMATICALLY, DEFAULT_AUTOMATICALLY),
        interval_secs: secs(
            INTERVAL_SECONDS,
            DEFAULT_INTERVAL_SECS,
            MIN_INTERVAL_SECS,
            MAX_INTERVAL_SECS,
        ),
        quiet_secs: secs(
            QUIET_SECONDS,
            DEFAULT_QUIET_SECS,
            MIN_QUIET_SECS,
            MAX_QUIET_SECS,
        ),
        on_open: flag(ON_OPEN, DEFAULT_ON_OPEN),
        on_leave: flag(ON_LEAVE, DEFAULT_ON_LEAVE),
    }
}

/// Whether opening a workspace should start a round trip.
///
/// Gated on the interval rather than unconditional, because "open" is not
/// always a deliberate act: on Android it is also what happens every time the
/// system killed the app while it sat in a pocket. A vault that has never
/// synced is always due — the first open should fetch, not wait a minute to
/// decide it is allowed to.
pub fn should_sync_on_open(schedule: Schedule, last_synced: Option<u64>, now_secs: u64) -> bool {
    if !schedule.automatically || !schedule.on_open {
        return false;
    }
    match last_synced {
        None => true,
        Some(last) => elapsed_at_least(last, now_secs, schedule.interval_secs),
    }
}

/// Whether leaving the app should record what is pending and push it.
///
/// Best effort by nature: Android may cut the push short, and its outcome is
/// not observable. Acceptable because the interval brings the next attempt
/// round on its own, so nothing depends on this landing.
pub fn should_flush_on_leave(schedule: Schedule) -> bool {
    schedule.automatically && schedule.on_leave
}

const LAST_SYNCED: &str = "sync.lastSyncedAt";

pub fn now_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

/// Records the result of a round trip, in wall-clock time.
///
/// Only success moves the timestamp. A failed sync that refreshed it would
/// make a vault look fresh at exactly the moment it is not, and the next
/// return to the app would skip the retry that would have fixed it. The
/// outcome is a parameter rather than an `if` at the call site so that the
/// rule lives here, where a test can hold it.
pub fn record_round_trip(app_data_dir: &Path, root: &Path, succeeded: bool) {
    if !succeeded {
        return;
    }
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = match crate::commands::settings::read_settings_file(&path) {
        Ok(contents) => contents,
        Err(error) => {
            // Never write on top of a file we could not read. `parse_app_settings_record`
            // would hand back an empty map, and the write would drop `sync.destination` —
            // unlinking the vault because it synced. Missing is `Ok(None)`, which is fine
            // and lands below; this arm is a real I/O failure.
            eprintln!("[sync] could not read settings to record the last sync time: {error:?}");
            return;
        }
    };
    let mut record = crate::commands::settings::parse_app_settings_record(contents.as_deref());
    record.insert(
        LAST_SYNCED.to_string(),
        serde_json::Value::from(now_epoch_secs()),
    );
    match crate::commands::settings::serialize_app_settings_record(record) {
        Ok(written) => {
            if let Err(error) = crate::commands::workspace::write_file_atomically(&path, written) {
                eprintln!("[sync] could not record the last sync time: {error:?}");
            }
        }
        Err(error) => eprintln!("[sync] could not serialize the last sync time: {error:?}"),
    }
}

/// When this vault last synced successfully, if it ever has.
pub fn last_synced_at(app_data_dir: &Path, root: &Path) -> Option<u64> {
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = crate::commands::settings::read_settings_file(&path).ok()?;
    crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(LAST_SYNCED)
        .and_then(serde_json::Value::as_u64)
}

#[cfg(test)]
#[path = "schedule_tests.rs"]
mod tests;
