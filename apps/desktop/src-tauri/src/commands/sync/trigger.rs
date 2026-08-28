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
/// rather than against a location the whole process shares.
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

#[cfg(test)]
#[path = "trigger_tests.rs"]
mod tests;
