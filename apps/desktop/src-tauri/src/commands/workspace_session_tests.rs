use std::time::Duration;

use notify_debouncer_full::new_debouncer;
use rusqlite::Connection;

use super::*;
use crate::tests::make_temp_test_dir;

/// A watcher that watches nothing: what the table holds, not what it hears.
fn idle_watcher() -> Result<WorkspaceDebouncer, NativeError> {
    Ok(new_debouncer(Duration::from_millis(100), None, |_| {}).expect("debouncer starts"))
}

fn index() -> Connection {
    Connection::open_in_memory().expect("an in-memory index opens")
}

/// Exercises the same two-phase watch the public entry point runs across
/// the global lock: join a live watcher, else spawn one and adopt it.
fn watch_into(
    sessions: &mut WorkspaceSessions,
    root: &str,
    label: &str,
    start: impl FnOnce() -> Result<WorkspaceDebouncer, NativeError>,
) -> Result<(), NativeError> {
    if sessions.acquire_watch(root, label) {
        return Ok(());
    }
    sessions.adopt_watcher(root, label, start()?);
    Ok(())
}

/// Two windows on one vault share its watcher, and it goes with the last.
#[test]
fn a_watcher_lives_while_any_window_wants_it() {
    let mut sessions = WorkspaceSessions::default();
    let mut started = 0;
    for label in ["main", "second"] {
        watch_into(&mut sessions, "/vault", label, || {
            started += 1;
            idle_watcher()
        })
        .expect("watching succeeds");
    }
    assert_eq!(started, 1, "the second window started a second watcher");

    assert!(sessions.unwatch("/vault", "main").is_none());
    let retired = sessions
        .unwatch("/vault", "second")
        .expect("the last window retires the watcher");
    assert!(retired.watcher.is_some());
    assert!(!sessions.holds("/vault"));
}

/// The pooled index connection is the vault's, so it closes with the vault
/// rather than staying open for the rest of the process.
#[test]
fn the_search_connection_goes_with_the_last_window() {
    let mut sessions = WorkspaceSessions::default();
    watch_into(&mut sessions, "/vault", "main", idle_watcher).expect("watching succeeds");
    let pooled = sessions.pool_search("/vault", index());
    assert!(Arc::ptr_eq(
        &pooled,
        &sessions.search("/vault").expect("the connection is pooled")
    ));

    let retired = sessions
        .unwatch("/vault", "main")
        .expect("the last window retires the session");
    assert!(
        retired.search.is_some(),
        "the connection outlived the vault"
    );
    assert!(sessions.search("/vault").is_none());
}

/// A second open of the same index keeps the one already in use.
#[test]
fn a_second_search_connection_for_one_vault_is_turned_away() {
    let mut sessions = WorkspaceSessions::default();
    let first = sessions.pool_search("/vault", index());
    let second = sessions.pool_search("/vault", index());
    assert!(Arc::ptr_eq(&first, &second));
}

/// "Release everything for this root" is one call, and touches no other root.
#[test]
fn releasing_a_workspace_drops_everything_it_held_at_once() {
    let mut sessions = WorkspaceSessions::default();
    for label in ["main", "second", "second"] {
        watch_into(&mut sessions, "/vault", label, idle_watcher).expect("watching succeeds");
    }
    sessions.pool_search("/vault", index());
    sessions.register_launch("second", "/vault");
    watch_into(&mut sessions, "/other", "main", idle_watcher).expect("watching succeeds");

    let (holders, released) = sessions.release_workspace("/vault");

    let released = released.expect("the vault had a session");
    assert!(released.watcher.is_some() && released.search.is_some());
    assert_eq!(holders.get("main"), Some(&1));
    assert_eq!(holders.get("second"), Some(&2), "every request is returned");
    assert!(!sessions.holds("/vault"));
    assert_eq!(sessions.launched_root("second"), None);
    assert!(
        sessions.holds("/other"),
        "another vault was released with it"
    );
}

/// A window the OS destroys never runs its teardown: its watches and the root
/// it was launched onto all have to go from here.
#[test]
fn a_destroyed_window_releases_its_watches_and_its_launch() {
    let mut sessions = WorkspaceSessions::default();
    sessions.register_launch("doomed", "/mine");
    watch_into(&mut sessions, "/mine", "doomed", idle_watcher).expect("watching succeeds");
    watch_into(&mut sessions, "/shared", "doomed", idle_watcher).expect("watching succeeds");
    watch_into(&mut sessions, "/shared", "main", idle_watcher).expect("watching succeeds");

    let retired = sessions.release_window("doomed");

    let watchers = retired
        .iter()
        .filter(|session| session.watcher.is_some())
        .count();
    assert_eq!(
        watchers, 1,
        "only the vault nobody else has open stops being watched"
    );
    assert!(!sessions.holds("/mine"));
    assert_eq!(sessions.launched_root("doomed"), None);
    assert!(sessions.holds("/shared"), "main still has it open");
}

/// A launched window answers with its root before it watches anything, and
/// after it stops watching too — a reload asks again.
#[test]
fn a_launch_is_remembered_independently_of_watching() {
    let mut sessions = WorkspaceSessions::default();
    sessions.register_launch("window-a", "/vault");
    assert_eq!(
        sessions.launched_root("window-a").as_deref(),
        Some("/vault")
    );

    watch_into(&mut sessions, "/vault", "window-a", idle_watcher).expect("watching succeeds");
    sessions.unwatch("/vault", "window-a");
    assert_eq!(
        sessions.launched_root("window-a").as_deref(),
        Some("/vault")
    );

    sessions.unregister_launch("window-a");
    assert_eq!(sessions.launched_root("window-a"), None);
    assert!(!sessions.holds("/vault"));
}

/// Two first watchers racing both spawn; the first to adopt wins and the
/// loser's is handed back to be dropped.
#[test]
fn a_watcher_that_loses_the_first_watch_race_is_dropped() {
    let mut sessions = WorkspaceSessions::default();
    assert!(
        sessions
            .adopt_watcher("/vault", "main", idle_watcher().expect("watcher starts"))
            .is_none(),
        "the first watcher is kept"
    );
    assert!(
        sessions
            .adopt_watcher("/vault", "second", idle_watcher().expect("watcher starts"))
            .is_some(),
        "the losing spawn is handed back"
    );
}

/// A watcher that fails to start leaves nothing claiming it exists.
#[test]
fn a_watcher_that_fails_to_start_registers_no_interest() {
    let mut sessions = WorkspaceSessions::default();
    let error = watch_into(&mut sessions, "/vault", "main", || {
        Err(NativeError::new("watcher.start_failed", "no"))
    })
    .expect_err("the failure is reported");
    assert_eq!(error.code, "watcher.start_failed");
    assert!(!sessions.holds("/vault"));
}

/// The process-wide entry point releases the sync engine too: one call takes
/// the watcher, the index connection and the engine for a root.
#[test]
fn release_workspace_also_detaches_the_sync_engine() {
    let app_data = make_temp_test_dir("session-release-appdata", "session", true);
    let vault = make_temp_test_dir("session-release-vault", "session", true);
    let key = vault.to_string_lossy().to_string();

    watch(&key, "session-window", idle_watcher).expect("watching succeeds");
    crate::commands::sync::registry::attach(&app_data, &vault, &key, "session-window")
        .expect("attaching succeeds");
    search_connection(&key, || Ok(index())).expect("the index opens");
    assert!(crate::commands::sync::registry::engine(&key).is_some());

    release_workspace(&key);

    assert!(
        crate::commands::sync::registry::engine(&key).is_none(),
        "the engine survived its workspace"
    );
    assert!(!holds(&key));
}

/// Destroying a window goes through the same table: its engine and its watch
/// both go.
#[test]
fn release_window_also_detaches_the_sync_engine() {
    let app_data = make_temp_test_dir("session-window-appdata", "session", true);
    let vault = make_temp_test_dir("session-window-vault", "session", true);
    let key = vault.to_string_lossy().to_string();

    register_launch("session-destroyed".into(), key.clone());
    watch(&key, "session-destroyed", idle_watcher).expect("watching succeeds");
    crate::commands::sync::registry::attach(&app_data, &vault, &key, "session-destroyed")
        .expect("attaching succeeds");

    release_window("session-destroyed");

    assert!(crate::commands::sync::registry::engine(&key).is_none());
    assert_eq!(launched_root("session-destroyed"), None);
    assert!(!holds(&key));
}
