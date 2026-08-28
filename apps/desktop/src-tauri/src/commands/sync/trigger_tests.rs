use super::{
    STALE_AFTER_SECS, Trigger, is_stale, last_synced_at, now_epoch_secs, record_round_trip,
    resolved_in,
};
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

/// The value written by one call to `record_round_trip` is read back by a
/// separate call to `is_stale` — nothing in between holds it in memory. That
/// matters because a monotonic `Instant` could not do this at all: it only
/// means anything compared against another `Instant` from the same process,
/// so a value like it would have nothing to be read back as.
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
    let path = crate::commands::settings::workspace_settings_path(&app_data, &root);
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
    // Written by hand rather than recorded, so the stored time is nowhere near
    // now. Recording a success first would land in the same epoch second as the
    // failure below, and a `record_round_trip` whose success guard had been
    // deleted would write back an identical value — this test would pass while
    // the rule it names was gone.
    std::fs::write(&path, r#"{"sync.lastSyncedAt":1000}"#).expect("settings written");

    record_round_trip(&app_data, &root, false);

    assert_eq!(last_synced_at(&app_data, &root), Some(1000));
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

/// A settings file that exists but cannot be read must not be replaced. The
/// old `.ok().flatten()` over `read_settings_file` could not tell "nothing
/// there" from "there, but unreadable" — both read as an empty record, and
/// `record_round_trip` would then write back a document holding only
/// `sync.lastSyncedAt`, discarding `sync.destination` in the same write that
/// was supposed to mark the vault as synced. Root bypasses Unix permission
/// checks, so this test is meaningless run as root; it is not run in CI as
/// root.
#[cfg(unix)]
#[test]
fn a_settings_file_that_cannot_be_read_is_left_untouched() {
    use std::os::unix::fs::PermissionsExt;

    let (app_data, root) = a_workspace("unreadable");
    let path = crate::commands::settings::workspace_settings_path(&app_data, &root);
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
    std::fs::write(
        &path,
        r#"{"sync.destination":"https://example.test/notes.git"}"#,
    )
    .expect("settings written");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000))
        .expect("settings file is made unreadable");

    record_round_trip(&app_data, &root, true);

    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
        .expect("settings file is made readable again for the assertion");
    let contents = crate::commands::settings::read_settings_file(&path)
        .expect("the settings are readable now that permissions are restored")
        .expect("the settings are present");
    let record = crate::commands::settings::parse_app_settings_record(Some(&contents));
    assert_eq!(
        record
            .get("sync.destination")
            .and_then(serde_json::Value::as_str),
        Some("https://example.test/notes.git"),
        "an unreadable settings file was overwritten, discarding the destination"
    );
    assert!(
        !record.contains_key("sync.lastSyncedAt"),
        "a write that should have been refused happened anyway"
    );
}
