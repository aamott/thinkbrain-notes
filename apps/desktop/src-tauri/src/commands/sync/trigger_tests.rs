use super::{Trigger, resolved_in};
use crate::tests::make_temp_test_dir;

/// The sweeper's idle rule is one policy among three, not a law. Only `Idle`
/// may start a round trip from a timer; the others wait to be told.
#[test]
fn only_the_idle_policy_starts_a_round_trip_from_a_timer() {
    use super::{Trigger, idle_start_allowed};

    assert!(idle_start_allowed(Trigger::Idle));
    assert!(!idle_start_allowed(Trigger::Foreground));
    assert!(!idle_start_allowed(Trigger::Manual));
}

/// Opening a workspace is deliberate, so every policy but `Manual` syncs —
/// `idle` because that is today's behaviour, `foreground` because opening is
/// when a stale vault is most visible.
#[test]
fn opening_a_workspace_syncs_under_every_policy_except_manual() {
    use super::{Trigger, open_start_allowed};

    assert!(open_start_allowed(Trigger::Idle));
    assert!(open_start_allowed(Trigger::Foreground));
    assert!(!open_start_allowed(Trigger::Manual));
}

fn home_with(setting: Option<&str>) -> std::path::PathBuf {
    let dir = make_temp_test_dir("trigger", "sync", true);
    if let Some(json) = setting {
        let path = crate::commands::settings::app_settings_path(&dir);
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
        std::fs::write(&path, json).expect("settings written");
    }
    dir
}

#[test]
fn an_explicit_policy_is_honoured() {
    let home = home_with(Some(r#"{"sync.trigger":"manual"}"#));
    assert_eq!(resolved_in(Some(&home)), Trigger::Manual);
}

/// `auto` is the default, and it is the only place the platform is consulted.
#[test]
fn auto_resolves_to_this_platforms_default() {
    let home = home_with(Some(r#"{"sync.trigger":"auto"}"#));
    let expected = if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    };
    assert_eq!(resolved_in(Some(&home)), expected);
}

/// A preference nobody can read is not an instruction to behave differently.
#[test]
fn an_unreadable_or_absent_setting_falls_back_to_auto() {
    let home = home_with(None);
    let expected = if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    };
    assert_eq!(resolved_in(Some(&home)), expected);
    assert_eq!(resolved_in(None), expected);
}

#[test]
fn an_unknown_value_falls_back_rather_than_disabling_sync() {
    let home = home_with(Some(r#"{"sync.trigger":"whenever"}"#));
    let expected = if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    };
    assert_eq!(resolved_in(Some(&home)), expected);
}

/// Returning to the app syncs only under `Foreground`, and only when the last
/// successful round trip is old enough to be worth repeating.
#[test]
fn returning_to_the_app_syncs_only_when_the_policy_says_so_and_it_is_stale() {
    use super::{Trigger, should_sync_on_foreground};

    assert!(should_sync_on_foreground(Trigger::Foreground, true));
    assert!(!should_sync_on_foreground(Trigger::Foreground, false));
    assert!(!should_sync_on_foreground(Trigger::Idle, true));
    assert!(!should_sync_on_foreground(Trigger::Manual, true));
}

/// Backgrounding flushes and pushes under `Foreground` only. A desktop user
/// who never touches the setting sees no new behaviour at all from this work.
#[test]
fn leaving_the_app_flushes_only_under_the_foreground_policy() {
    use super::{Trigger, should_flush_on_background};

    assert!(should_flush_on_background(Trigger::Foreground));
    assert!(!should_flush_on_background(Trigger::Idle));
    assert!(!should_flush_on_background(Trigger::Manual));
}
