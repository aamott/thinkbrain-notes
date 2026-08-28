//! When an automatic round trip is allowed to start.
//!
//! Idle time is an inference about what someone is doing, drawn from a clock.
//! On Android that clock stops during a freeze and jumps on resume, so the
//! inference fires against time that never passed. This module replaces the
//! inference with a stated policy, so the sweeper asks what the user wants
//! rather than guessing from a timer.

use std::path::Path;

/// The composed settings key: module `sync`, setting `trigger`, declared in
/// `packages/core/src/settings/modules/sync.ts`. Spelled out here rather than
/// derived because this side answers the question before any window is
/// listening. Changing the key there means changing it here.
const SETTING: &str = "sync.trigger";

/// What starts an automatic round trip.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// Once the vault has been still. The sweeper's original behaviour.
    Idle,
    /// On workspace open, and on return to the app when the last successful
    /// sync is old enough to be worth repeating.
    Foreground,
    /// Never on its own.
    Manual,
}

/// The one place in the sync code that asks what platform it is running on.
///
/// A phone is glanced at far more often than a desktop is focused, and its
/// process is frozen in between; a desktop keeps running and its clock keeps
/// meaning something. Those are different enough to deserve different
/// defaults, and `auto` is how a user says "whichever suits this device".
fn platform_default() -> Trigger {
    if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    }
}

/// The policy in force, read from the app settings file.
pub fn resolved() -> Trigger {
    resolved_in(super::settle::settings_home().as_deref())
}

/// The same, told where to look, so it can be tested against a real file
/// rather than against a location the whole process shares. `None` also
/// occurs in production, before `remember_settings_home` has been called.
pub fn resolved_in(app_data_dir: Option<&Path>) -> Trigger {
    let Some(app_data_dir) = app_data_dir else {
        return platform_default();
    };
    let path = crate::commands::settings::app_settings_path(app_data_dir);
    let Ok(contents) = crate::commands::settings::read_settings_file(&path) else {
        return platform_default();
    };
    match crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(SETTING)
        .and_then(serde_json::Value::as_str)
    {
        Some("idle") => Trigger::Idle,
        Some("foreground") => Trigger::Foreground,
        Some("manual") => Trigger::Manual,
        // "auto", anything unrecognised, and absent all mean the same thing.
        // An unreadable preference must never be read as "stop syncing".
        _ => platform_default(),
    }
}

/// Whether the sweeper's idle timer may start a round trip under this policy.
pub(super) fn idle_start_allowed(trigger: Trigger) -> bool {
    matches!(trigger, Trigger::Idle)
}

/// How old a successful sync must be before returning to the app repeats it.
///
/// Long enough that flicking to another app and back does not resync; short
/// enough that coming back after a meeting gets fresh notes. A constant rather
/// than a setting: one less thing to explain, and easy to move if it is wrong.
pub const STALE_AFTER_SECS: u64 = 180;

const LAST_SYNCED: &str = "sync.lastSyncedAt";

pub(super) fn now_epoch_secs() -> u64 {
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
pub(super) fn last_synced_at(app_data_dir: &Path, root: &Path) -> Option<u64> {
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = crate::commands::settings::read_settings_file(&path).ok()?;
    crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(LAST_SYNCED)
        .and_then(serde_json::Value::as_u64)
}

/// Whether a vault's last successful sync is old enough to repeat.
///
/// A vault that has never synced is stale: the first return to the app should
/// fetch, not wait three minutes to decide it is allowed to.
pub fn is_stale(app_data_dir: &Path, root: &Path, now_secs: u64) -> bool {
    match last_synced_at(app_data_dir, root) {
        Some(last) => now_secs.saturating_sub(last) >= STALE_AFTER_SECS,
        None => true,
    }
}

#[cfg(test)]
#[path = "trigger_tests.rs"]
mod tests;
