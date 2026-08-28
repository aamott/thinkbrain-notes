use super::{
    STALE_AFTER_SECS, Trigger, is_stale, last_synced_at, now_epoch_secs, record_round_trip,
    resolved_in,
};
use crate::tests::make_temp_test_dir;

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

fn a_workspace(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let app_data = crate::tests::make_temp_test_dir(&format!("{name}-appdata"), "trigger", true);
    let root = crate::tests::make_temp_test_dir(&format!("{name}-vault"), "trigger", true);
    (app_data, root)
}

#[test]
fn a_vault_that_has_never_synced_is_stale() {
    let (app_data, root) = a_workspace("never-synced");
    assert!(is_stale(&app_data, &root, 1_000_000));
}

#[test]
fn a_recent_sync_is_not_stale_but_an_old_one_is() {
    let (app_data, root) = a_workspace("recency");
    record_round_trip(&app_data, &root, true);
    let now = now_epoch_secs();

    assert!(!is_stale(&app_data, &root, now + STALE_AFTER_SECS - 1));
    assert!(is_stale(&app_data, &root, now + STALE_AFTER_SECS + 1));
}

/// Wall clock, not a monotonic instant: the whole point is surviving a
/// restart, and a process that has just started has no earlier `Instant` to
/// compare against.
#[test]
fn the_timestamp_survives_being_read_by_a_different_call() {
    let (app_data, root) = a_workspace("persisted");
    record_round_trip(&app_data, &root, true);
    assert!(!is_stale(&app_data, &root, now_epoch_secs()));
}

/// The spec's sharpest requirement about this timestamp: it records success,
/// not attempts. A failed sync that refreshed it would make a vault look fresh
/// at exactly the moment it is not, and the next return to the app would skip
/// the retry that would have fixed it.
#[test]
fn a_failed_round_trip_does_not_refresh_the_timestamp() {
    let (app_data, root) = a_workspace("only-on-success");
    record_round_trip(&app_data, &root, true);
    let after_success = last_synced_at(&app_data, &root);
    assert!(
        after_success.is_some(),
        "a successful round trip recorded nothing"
    );

    record_round_trip(&app_data, &root, false);

    assert_eq!(last_synced_at(&app_data, &root), after_success);
}

/// A vault that has never synced at all must stay that way after a failure,
/// or the first failed sync would look like a first successful one.
#[test]
fn a_failed_first_round_trip_records_nothing_at_all() {
    let (app_data, root) = a_workspace("failed-first");
    record_round_trip(&app_data, &root, false);

    assert_eq!(last_synced_at(&app_data, &root), None);
    assert!(is_stale(&app_data, &root, now_epoch_secs()));
}

/// `record_round_trip` rewrites the whole workspace settings file, so it has
/// to merge rather than replace. Clobbering `sync.destination` would leave the
/// vault pointing nowhere — a sync that breaks syncing.
#[test]
fn recording_a_sync_keeps_the_rest_of_the_workspace_settings() {
    let (app_data, root) = a_workspace("merges");
    let path = crate::commands::settings::workspace_settings_path(&app_data, &root);
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
    std::fs::write(
        &path,
        r#"{"sync.destination":"https://example.test/notes.git"}"#,
    )
    .expect("settings written");

    record_round_trip(&app_data, &root, true);

    let contents = crate::commands::settings::read_settings_file(&path)
        .expect("the settings are readable")
        .expect("the settings are present");
    let record = crate::commands::settings::parse_app_settings_record(Some(&contents));
    assert_eq!(
        record
            .get("sync.destination")
            .and_then(serde_json::Value::as_str),
        Some("https://example.test/notes.git"),
        "recording the sync time discarded the destination"
    );
    assert!(record.contains_key("sync.lastSyncedAt"));
}
