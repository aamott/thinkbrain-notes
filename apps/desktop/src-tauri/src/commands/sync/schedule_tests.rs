fn home_with(body: &str) -> std::path::PathBuf {
    let dir = crate::tests::make_temp_test_dir("schedule", "sync", true);
    let path = crate::commands::settings::app_settings_path(&dir);
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
    std::fs::write(&path, body).expect("settings written");
    dir
}

fn a_workspace(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let app_data = crate::tests::make_temp_test_dir(&format!("{name}-appdata"), "schedule", true);
    let root = crate::tests::make_temp_test_dir(&format!("{name}-vault"), "schedule", true);
    (app_data, root)
}

#[test]
fn a_vault_that_has_never_synced_is_stale() {
    let (app_data, root) = a_workspace("never-synced");
    assert!(super::should_sync_on_open(
        super::Schedule::default(),
        super::last_synced_at(&app_data, &root),
        1_000_000
    ));
}

#[test]
fn a_recent_sync_is_not_stale_but_an_old_one_is() {
    let (app_data, root) = a_workspace("recency");
    super::record_round_trip(&app_data, &root, true);
    let now = super::now_epoch_secs();
    let schedule = super::Schedule::default();
    let last_synced = super::last_synced_at(&app_data, &root);

    assert!(!super::should_sync_on_open(
        schedule,
        last_synced,
        now + schedule.interval_secs - 1
    ));
    assert!(super::should_sync_on_open(
        schedule,
        last_synced,
        now + schedule.interval_secs + 1
    ));
}

/// The value written by one call to `record_round_trip` is read back by a
/// separate call to `last_synced_at` — nothing in between holds it in memory.
/// That matters because a monotonic `Instant` could not do this at all: it
/// only means anything compared against another `Instant` from the same
/// process, so a value like it would have nothing to be read back as.
#[test]
fn the_timestamp_survives_being_read_by_a_different_call() {
    let (app_data, root) = a_workspace("persisted");
    super::record_round_trip(&app_data, &root, true);
    assert!(!super::should_sync_on_open(
        super::Schedule::default(),
        super::last_synced_at(&app_data, &root),
        super::now_epoch_secs()
    ));
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

    super::record_round_trip(&app_data, &root, false);

    assert_eq!(super::last_synced_at(&app_data, &root), Some(1000));
}

/// A vault that has never synced at all must stay that way after a failure,
/// or the first failed sync would look like a first successful one.
#[test]
fn a_failed_first_round_trip_records_nothing_at_all() {
    let (app_data, root) = a_workspace("failed-first");
    super::record_round_trip(&app_data, &root, false);

    assert_eq!(super::last_synced_at(&app_data, &root), None);
    assert!(super::should_sync_on_open(
        super::Schedule::default(),
        super::last_synced_at(&app_data, &root),
        super::now_epoch_secs()
    ));
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

    super::record_round_trip(&app_data, &root, true);

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

    super::record_round_trip(&app_data, &root, true);

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

#[test]
fn an_absent_settings_file_gives_the_declared_defaults() {
    let schedule = super::resolved_in(None);
    assert_eq!(schedule, super::Schedule::default());
    assert!(schedule.automatically);
    assert_eq!(schedule.interval_secs, 60);
    assert_eq!(schedule.quiet_secs, 30);
}

#[test]
fn an_unreadable_setting_never_reads_as_stop_syncing() {
    let home = home_with(r#"{ "sync.automatically": "yes please" }"#);
    assert!(super::resolved_in(Some(&home)).automatically);
}

#[test]
fn an_interval_from_outside_the_bounds_is_clamped() {
    let fast = home_with(r#"{ "sync.intervalSeconds": 0 }"#);
    assert_eq!(
        super::resolved_in(Some(&fast)).interval_secs,
        super::MIN_INTERVAL_SECS
    );

    let slow = home_with(r#"{ "sync.intervalSeconds": 999999 }"#);
    assert_eq!(
        super::resolved_in(Some(&slow)).interval_secs,
        super::MAX_INTERVAL_SECS
    );
}

#[test]
fn a_timestamp_from_the_future_reads_as_due_not_fresh() {
    // saturating_sub would floor this to zero and call the vault fresh for
    // ever. A clock that moved backwards is not evidence of freshness.
    assert!(super::elapsed_at_least(9_000, 1_000, 60));
}

#[test]
fn opening_a_folder_syncs_only_when_the_interval_has_passed() {
    let schedule = super::Schedule::default();
    assert!(super::should_sync_on_open(schedule, None, 10_000));
    assert!(super::should_sync_on_open(schedule, Some(1_000), 10_000));
    assert!(!super::should_sync_on_open(schedule, Some(9_990), 10_000));
}

#[test]
fn nothing_automatic_happens_with_the_toggle_off() {
    let off = super::Schedule {
        automatically: false,
        ..super::Schedule::default()
    };
    assert!(!super::should_sync_on_open(off, None, 10_000));
    assert!(!super::should_flush_on_leave(off));
}

#[test]
fn leaving_can_be_turned_off_on_its_own() {
    let schedule = super::Schedule {
        on_leave: false,
        ..super::Schedule::default()
    };
    assert!(!super::should_flush_on_leave(schedule));
    assert!(super::should_sync_on_open(schedule, None, 10_000));
}
