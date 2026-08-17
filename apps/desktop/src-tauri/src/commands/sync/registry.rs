//! The live engines, and the sweeper that gets their work committed.
//!
//! Engines are shared per workspace and kept alive by window interest, exactly
//! like the file watchers in [`crate::commands::watcher`] — the same lifecycle,
//! because it *is* the same lifecycle. Two windows on one vault share one
//! engine, and the last one to close releases it.
//!
//! One sweeper thread serves every workspace. A thread per engine would spend
//! almost all of its life asleep, and the work it wakes up to do is a few
//! milliseconds of hashing.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::commands::watcher::{WatchInterest, WorkspaceChange, WorkspaceChangeKind};
use crate::NativeError;

use super::bootstrap::{bootstrap, Managed};
use super::conflict;
use super::engine::Engine;

/// How often the sweeper looks for settled changes.
///
/// Well under the settle window, so a note is recorded promptly once it goes
/// quiet rather than up to a full window late.
const TICK: Duration = Duration::from_millis(500);

#[derive(Default)]
struct Registry {
    interest: WatchInterest,
    engines: HashMap<String, Arc<Engine>>,
    /// One lock per workspace, held while that workspace is being bootstrapped.
    ///
    /// Bootstrapping walks and hashes the whole vault, so it must not happen
    /// under the global lock — every other workspace's open, close and sweep
    /// would wait behind it. But two windows opening the *same* vault at once
    /// must not both create its repository, so they queue here instead.
    lanes: HashMap<String, Arc<Mutex<()>>>,
    /// Whether the sweeper thread is running. It outlives individual engines
    /// and simply idles when the map is empty.
    sweeping: bool,
}

impl Registry {
    /// The queue for bootstrapping `key`, created on first use.
    fn lane(&mut self, key: &str) -> Arc<Mutex<()>> {
        Arc::clone(self.lanes.entry(key.to_string()).or_default())
    }

    /// Registers one window's interest, reporting whether an engine was there.
    fn hold(&mut self, key: &str, label: &str) -> bool {
        if !self.engines.contains_key(key) {
            return false;
        }
        self.interest.acquire(key, label);
        true
    }

    /// Takes on `engine` for `key`, unless someone got there first.
    ///
    /// Two windows opening one vault can both come back from the lane with an
    /// engine. Keeping the first means keeping the one that may already have
    /// changes noted against it; the second is dropped having recorded nothing.
    fn adopt(&mut self, key: &str, label: &str, engine: Arc<Engine>) {
        self.engines.entry(key.to_string()).or_insert(engine);
        self.interest.acquire(key, label);
    }

    /// Releases one window's interest, yielding the engine nobody wants now.
    fn release(&mut self, key: &str, label: &str) -> Option<Arc<Engine>> {
        self.interest
            .release(key, label)
            .then(|| self.engines.remove(key))
            .flatten()
    }

    /// Releases everything `label` held, yielding the engines left over.
    fn release_window(&mut self, label: &str) -> Vec<Arc<Engine>> {
        self.interest
            .release_window(label)
            .into_iter()
            .filter_map(|key| self.engines.remove(&key))
            .collect()
    }
}

static ENGINES: Mutex<Option<Registry>> = Mutex::new(None);

fn registry() -> std::sync::MutexGuard<'static, Option<Registry>> {
    ENGINES.lock().unwrap_or_else(|error| error.into_inner())
}

/// Starts recording `root` on behalf of a window, if it is ours to record.
///
/// Returns whether Auto Sync is keeping history — `false` means the vault has
/// its own git repository and is being left alone, which the settings page
/// says out loud rather than leaving as silence.
pub fn attach(
    app_data_dir: &Path,
    root: &Path,
    key: &str,
    label: &str,
) -> Result<bool, NativeError> {
    let lane = {
        let mut guard = registry();
        let state = guard.get_or_insert_with(Registry::default);
        if state.hold(key, label) {
            start_sweeping(state);
            return Ok(true);
        }
        state.lane(key)
    };

    // Outside the global lock: bootstrapping an existing vault walks and hashes
    // every note in it, and holding the registry through that would stall every
    // other window's open and close, and the sweeper with them.
    let _lane = lane.lock().unwrap_or_else(|error| error.into_inner());
    let managed = bootstrap(app_data_dir, root)?;

    let mut guard = registry();
    let state = guard.get_or_insert_with(Registry::default);
    match managed {
        // Interest is deliberately not taken: there is no engine to keep alive,
        // and holding it would leave the registry claiming to look after a vault
        // it has promised not to touch.
        Managed::HasOwnGit => return Ok(false),
        Managed::Yes(workspace) => {
            let engine = Arc::new(Engine::new(workspace.repo));
            // Conflicts appear while the app is closed. Someone back from a
            // week away should not have to open each note to discover the
            // app noticed nothing.
            engine.note_conflicts(conflict::scan(root));
            state.adopt(key, label, engine);
        }
    }
    start_sweeping(state);
    Ok(true)
}

fn start_sweeping(state: &mut Registry) {
    if !state.sweeping {
        state.sweeping = true;
        spawn_sweeper();
    }
}

/// Releases one window's interest in `key`, dropping the engine with the last.
pub fn detach(key: &str, label: &str) {
    let engine = {
        let mut guard = registry();
        let Some(state) = guard.as_mut() else { return };
        state.release(key, label)
    };
    if let Some(engine) = engine {
        flush(key, &engine);
    }
}

/// Releases everything a window held, for windows the OS destroys.
pub fn release_window(label: &str) {
    let engines = {
        let mut guard = registry();
        let Some(state) = guard.as_mut() else { return };
        state.release_window(label)
    };
    for engine in engines {
        flush(label, &engine);
    }
}

/// Records what the closing workspace never got the chance to settle.
///
/// Outside the registry lock, because it hashes and writes. There is nobody
/// left to show a failure to, so it is logged like the sweeper's — story 5's
/// status surface is where a recording failure becomes visible.
fn flush(key: &str, engine: &Engine) {
    if let Err(error) = engine.flush() {
        eprintln!("[sync] could not record the last changes to {key}: {error:?}");
    }
}

/// The engine recording `key`, if Auto Sync is keeping history for it.
///
/// A vault with its own git repository has no engine, which is what makes
/// "resolve this conflict" refuse rather than write something it cannot undo.
pub fn engine(key: &str) -> Option<Arc<Engine>> {
    let guard = registry();
    guard.as_ref()?.engines.get(key).map(Arc::clone)
}

/// Feeds watcher changes to the engine for `key`, if there is one.
pub fn note_changes(key: &str, root: &Path, changes: &[WorkspaceChange]) {
    let engine = {
        let guard = registry();
        let Some(state) = guard.as_ref() else { return };
        let Some(engine) = state.engines.get(key) else { return };
        Arc::clone(engine)
    };

    let paths = if changes
        .iter()
        .any(|change| change.kind == WorkspaceChangeKind::Rescan)
    {
        // A rescan means the event stream cannot be trusted to say what moved,
        // so the vault is re-read. That is the same walk the first snapshot
        // does, and recording still writes nothing for the notes that did not
        // actually change.
        match super::bootstrap::recordable_notes(root) {
            Ok(paths) => paths,
            Err(error) => {
                eprintln!("[sync] could not re-read the workspace after a rescan: {error:?}");
                return;
            }
        }
    } else {
        changed_paths(changes)
    };

    engine.note_conflicts(
        paths
            .iter()
            // A copy that is no longer there is not a conflict to answer. This
            // matters because resolving one *deletes* it, and the watcher
            // reports that deletion — without this the conflict the user just
            // settled would be raised again a second later.
            .filter(|path| root.join(path).is_file())
            .filter_map(|path| {
                conflict::pair(&conflict::relative_str(path), |original| {
                    root.join(original).is_file()
                })
            })
            .collect::<Vec<_>>(),
    );
    engine.note_changes(paths, Instant::now());
}

/// The vault-relative paths a batch of changes touches.
///
/// A rename touches two: leaving the old path out would keep the note in
/// history under a name the vault no longer has.
fn changed_paths(changes: &[WorkspaceChange]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for change in changes {
        if change.kind == WorkspaceChangeKind::Rescan {
            continue;
        }
        if !change.path.is_empty() {
            paths.push(PathBuf::from(&change.path));
        }
        if let Some(old) = &change.old_path {
            if !old.is_empty() {
                paths.push(PathBuf::from(old));
            }
        }
    }
    paths
}

/// Records settled changes for every live engine, forever.
///
/// Errors are logged and the sweep continues. One workspace whose folder has
/// been unplugged must not stop another from being recorded, and there is
/// nobody to show an error to from here — the status surface in story 5 is
/// where a failure becomes visible.
fn spawn_sweeper() {
    std::thread::Builder::new()
        .name("thinkbrain-sync".into())
        .spawn(|| loop {
            std::thread::sleep(TICK);

            let engines: Vec<(String, Arc<Engine>)> = {
                let guard = registry();
                let Some(state) = guard.as_ref() else { continue };
                state
                    .engines
                    .iter()
                    .map(|(key, engine)| (key.clone(), Arc::clone(engine)))
                    .collect()
            };

            // Outside the lock: recording hashes and writes files, and holding
            // the registry through that would block every window opening or
            // closing a workspace.
            let now = Instant::now();
            for (key, engine) in engines {
                if let Err(error) = engine.record_settled(now) {
                    eprintln!("[sync] could not record changes for {key}: {error:?}");
                }
            }
        })
        .expect("the sync sweeper thread starts");
}

#[cfg(test)]
mod tests {
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
}
