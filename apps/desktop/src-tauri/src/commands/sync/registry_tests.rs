use super::*;
use crate::tests::make_temp_test_dir;

/// A registry of its own, so lifecycle tests do not fight each other or the
/// live sweeper over the process-wide one.
fn engine_for(name: &str) -> Arc<Engine> {
    let app_data = make_temp_test_dir(&format!("{name}-appdata"), "sync", true);
    let vault = make_temp_test_dir(&format!("{name}-vault"), "sync", true);
    match bootstrap(&app_data, &vault).expect("bootstrap succeeds") {
        Managed::Yes(workspace) => Arc::new(Engine::new(workspace.repo)),
        Managed::HasOwnGit => panic!("the vault was expected to be managed"),
    }
}

/// Two windows on one vault share one engine, and it survives until the
/// second one goes.
#[test]
fn an_engine_outlives_every_window_but_the_last() {
    let mut state = Registry::default();
    state.adopt("vault", "window-1", engine_for("registry-shared"));
    assert!(state.hold("vault", "window-2"), "the second window shares it");

    assert!(
        state.release("vault", "window-1").is_none(),
        "the engine was dropped while a window still had the vault open"
    );
    assert!(
        state.release("vault", "window-2").is_some(),
        "the last window closing did not yield the engine to be flushed"
    );
    assert!(state.engines.is_empty());
}

/// A window the OS destroyed never runs its teardown, so everything it held
/// has to come back at once — and come back, so it can be flushed.
#[test]
fn a_destroyed_window_yields_every_engine_it_held() {
    let mut state = Registry::default();
    state.adopt("one", "window-1", engine_for("registry-destroy-one"));
    state.adopt("two", "window-1", engine_for("registry-destroy-two"));
    state.adopt("two", "window-2", engine_for("registry-destroy-two-b"));

    let released = state.release_window("window-1");

    assert_eq!(released.len(), 1, "only the vault nobody else has open");
    assert!(state.engines.contains_key("two"), "window-2 still has it open");
}

/// Bootstrapping happens outside the lock, so two windows opening one vault
/// can both arrive holding an engine. The first is the one that may already
/// have changes noted against it.
#[test]
fn a_second_engine_for_one_vault_is_turned_away() {
    let mut state = Registry::default();
    let first = engine_for("registry-adopt-first");
    state.adopt("vault", "window-1", Arc::clone(&first));

    state.adopt("vault", "window-2", engine_for("registry-adopt-second"));

    assert!(
        Arc::ptr_eq(&state.engines["vault"], &first),
        "the engine that was already being used was replaced"
    );
}

/// A vault with its own git repository gets no engine, so nothing may claim
/// to be looking after it either.
#[test]
fn a_vault_with_no_engine_is_not_held() {
    let mut state = Registry::default();

    assert!(!state.hold("vault", "window-1"));
    assert!(!state.interest.is_watched("vault"));
}

/// The whole point of flushing on the way out: a note typed and the window
/// closed a second later is still in history.
///
/// This goes through the real `attach`/`detach`, because the bug it guards
/// against is the wiring between them. The sweeper cannot be what records
/// the note — it only takes what has been still for `SETTLE`, and this
/// closes the workspace immediately.
#[test]
fn closing_the_last_window_records_what_never_settled() {
    let app_data = make_temp_test_dir("registry-flush-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-flush-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "window-1").expect("attaching succeeds"));
    std::fs::write(vault.join("one.md"), "# One\n").expect("the note is written");
    note_changes(
        &key,
        &vault,
        &[change(WorkspaceChangeKind::Created, "one.md")],
    );
    detach(&key, "window-1");

    // Opened directly rather than through `bootstrap`, which would take a
    // first snapshot of the vault and so manufacture the very commit this
    // is looking for.
    let git_dir = crate::commands::sync::bootstrap::hidden_repo_path(&app_data, &key);
    let reopened = crate::commands::sync::hidden_repo::open_or_create(&git_dir, &vault)
        .expect("the hidden repository opens");
    assert!(
        super::super::snapshot::head_commit(&reopened)
            .expect("reading the branch succeeds")
            .is_some(),
        "the note was lost when the window closed"
    );
}

/// The engine is gone with the last window, so a later open must bootstrap
/// again rather than finding a leftover.
#[test]
fn attach_then_detach_removes_the_engine() {
    let app_data = make_temp_test_dir("registry-reattach-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-reattach-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "reattach-1").expect("attaching succeeds"));
    assert!(engine(&key).is_some());
    detach(&key, "reattach-1");
    assert!(engine(&key).is_none(), "detach left the engine behind");

    assert!(attach(&app_data, &vault, &key, "reattach-2").expect("reattaching succeeds"));
    assert!(engine(&key).is_some(), "a second attach did not bring the engine back");
    detach(&key, "reattach-2");
}

/// Two windows on one vault share the live engine, not a second copy.
#[test]
fn two_attaches_share_one_engine() {
    let app_data = make_temp_test_dir("registry-two-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-two-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "share-1").expect("first attach succeeds"));
    let first = engine(&key).expect("the first window has an engine");
    assert!(attach(&app_data, &vault, &key, "share-2").expect("second attach succeeds"));
    let second = engine(&key).expect("the second window has an engine");
    assert!(
        Arc::ptr_eq(&first, &second),
        "two windows on one vault each got their own engine"
    );

    detach(&key, "share-1");
    assert!(engine(&key).is_some(), "the first detach dropped a shared engine");
    detach(&key, "share-2");
    assert!(engine(&key).is_none(), "the last detach left the engine behind");
}

/// A destroyed window never runs teardown, so everything it held has to
/// go at once through the public entry point.
#[test]
fn release_window_drops_that_windows_interest() {
    let app_data = make_temp_test_dir("registry-release-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-release-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "gone-window").expect("attaching succeeds"));
    release_window("gone-window");
    assert!(
        engine(&key).is_none(),
        "the destroyed window's engine is still being held"
    );
}

/// Watcher events after the last window closed have nobody to tell.
#[test]
fn note_changes_after_detach_is_a_noop() {
    let app_data = make_temp_test_dir("registry-noop-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-noop-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "noop-1").expect("attaching succeeds"));
    detach(&key, "noop-1");

    assert!(
        !note_changes(
            &key,
            &vault,
            &[change(WorkspaceChangeKind::Created, "late.md")],
        ),
        "a change after detach was treated as news"
    );
    assert!(engine(&key).is_none());
}

/// The sweeper, not a flush, is what records a note that was left open
/// long enough to settle.
#[test]
fn the_sweeper_records_a_settled_change() {
    let app_data = make_temp_test_dir("registry-sweep-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-sweep-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();

    assert!(attach(&app_data, &vault, &key, "sweep-1").expect("attaching succeeds"));
    std::fs::write(vault.join("one.md"), "# One\n").expect("the note is written");
    note_changes(
        &key,
        &vault,
        &[change(WorkspaceChangeKind::Created, "one.md")],
    );
    std::thread::sleep(TICK + super::super::engine::SETTLE + TICK);

    let git_dir = crate::commands::sync::bootstrap::hidden_repo_path(&app_data, &key);
    let reopened = crate::commands::sync::hidden_repo::open_or_create(&git_dir, &vault)
        .expect("the hidden repository opens");
    assert!(
        super::super::snapshot::head_commit(&reopened)
            .expect("reading the branch succeeds")
            .is_some(),
        "the sweeper never recorded the settled note"
    );
    detach(&key, "sweep-1");
}

/// Resolving a conflict deletes the copy, and the watcher reports that
/// deletion like any other. Pairing it again would raise the conflict the
/// user just answered, seconds after they answered it.
#[test]
fn a_conflict_copy_that_has_been_removed_is_not_raised_again() {
    let app_data = make_temp_test_dir("registry-resolved-appdata", "sync", true);
    let vault = make_temp_test_dir("registry-resolved-vault", "sync", true);
    let key = vault.to_string_lossy().to_string();
    let copy = "note.sync-conflict-20260816-093100-K3SDFHG.md";
    std::fs::write(vault.join("note.md"), "# Mine\n").expect("the note is written");

    assert!(attach(&app_data, &vault, &key, "window-1").expect("attaching succeeds"));
    note_changes(&key, &vault, &[change(WorkspaceChangeKind::Deleted, copy)]);

    let engine = engine(&key).expect("the vault has an engine");
    assert!(
        engine.conflicts().is_empty(),
        "a conflict copy that is no longer there was raised as a conflict"
    );
    detach(&key, "window-1");
}

fn change(kind: WorkspaceChangeKind, path: &str) -> WorkspaceChange {
    WorkspaceChange {
        kind,
        path: path.to_string(),
        old_path: None,
    }
}

#[test]
fn every_changed_note_is_collected() {
    let changes = [
        change(WorkspaceChangeKind::Created, "one.md"),
        change(WorkspaceChangeKind::Modified, "two.md"),
        change(WorkspaceChangeKind::Deleted, "three.md"),
    ];

    assert_eq!(
        changed_paths(&changes),
        [
            PathBuf::from("one.md"),
            PathBuf::from("two.md"),
            PathBuf::from("three.md")
        ]
    );
}

/// Both halves of a rename, or the note stays in history under a name the
/// vault no longer has.
#[test]
fn a_rename_touches_the_name_it_left_as_well() {
    let changes = [WorkspaceChange {
        kind: WorkspaceChangeKind::Renamed,
        path: "new.md".to_string(),
        old_path: Some("old.md".to_string()),
    }];

    assert_eq!(
        changed_paths(&changes),
        [PathBuf::from("new.md"), PathBuf::from("old.md")]
    );
}

/// A rescan means "the event stream cannot say what moved". It is answered
/// by re-reading the vault, so whatever it happens to carry in `path` is
/// not a note that changed — today that is always empty, and this holds the
/// rule rather than the coincidence.
#[test]
fn a_rescan_names_no_paths_whatever_it_carries() {
    assert!(changed_paths(&[change(WorkspaceChangeKind::Rescan, "")]).is_empty());
    assert!(changed_paths(&[change(WorkspaceChangeKind::Rescan, "one.md")]).is_empty());
}
