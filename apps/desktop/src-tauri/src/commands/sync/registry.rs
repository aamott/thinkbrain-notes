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
use crate::error::lock_or_recover;
use crate::NativeError;

use super::bootstrap::bootstrap;
use super::conflict;
use super::engine::Engine;
use super::round;
use super::settle;

/// How often the sweeper looks for settled changes.
///
/// Well under the settle window, so a note is recorded promptly once it goes
/// quiet rather than up to a full window late.
const TICK: Duration = Duration::from_millis(500);

/// How long a vault must be still before a round trip fires without a click.
const IDLE: Duration = Duration::from_secs(30);

/// Soonest a second automatic round trip will fire after the last one finished.
const CAP: Duration = Duration::from_secs(60);

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
    /// Why a workspace has no engine, when the reason was a failure.
    ///
    /// Without this a vault that could not be set up is indistinguishable from
    /// one we deliberately left alone, and the footer says the reassuring one.
    failures: HashMap<String, NativeError>,
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
        self.failures.remove(key);
        self.interest.acquire(key, label);
        true
    }

    /// Takes on `engine` for `key`, unless someone got there first.
    ///
    /// Two windows opening one vault can both come back from the lane with an
    /// engine. Keeping the first means keeping the one that may already have
    /// changes noted against it; the second is dropped having recorded nothing.
    fn adopt(&mut self, key: &str, label: &str, engine: Arc<Engine>) {
        self.failures.remove(key);
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

    /// Releases everything `label` held, yielding the engines left over with
    /// their workspace keys, so the caller can log which vault failed to flush.
    fn release_window(&mut self, label: &str) -> Vec<(String, Arc<Engine>)> {
        self.interest
            .release_window(label)
            .into_iter()
            .filter_map(|key| self.engines.remove(&key).map(|engine| (key, engine)))
            .collect()
    }

    /// Tries to register `label`'s interest in an already-live `key`.
    ///
    /// Returns `true` when an engine was there and the interest was acquired —
    /// the caller's cue to start the sweeper (if not already running) and
    /// return `Ok(())` rather than bootstrapping the vault again.
    fn hold_and_sweep(&mut self, key: &str, label: &str) -> bool {
        if self.hold(key, label) {
            start_sweeping(self);
            true
        } else {
            false
        }
    }
}

static ENGINES: Mutex<Option<Registry>> = Mutex::new(None);

fn registry() -> std::sync::MutexGuard<'static, Option<Registry>> {
    lock_or_recover(&ENGINES)
}

/// Starts recording `root` on behalf of a window.
pub fn attach(app_data_dir: &Path, root: &Path, key: &str, label: &str) -> Result<(), NativeError> {
    // Before any lock: settling reads a preference from here, and the paths
    // that do it have no window to ask.
    super::settle::remember_settings_home(app_data_dir);

    let lane = {
        let mut guard = registry();
        let state = guard.get_or_insert_with(Registry::default);
        if state.hold_and_sweep(key, label) {
            return Ok(());
        }
        state.lane(key)
    };

    // Outside the global lock: bootstrapping an existing vault walks and hashes
    // every note in it, and holding the registry through that would stall every
    // other window's open and close, and the sweeper with them. The lane keeps
    // two windows on the *same* vault from both walking it; the one that waited
    // re-checks so it does not walk it again once the first has finished.
    let _lane = lock_or_recover(&lane);
    {
        let mut guard = registry();
        let state = guard.get_or_insert_with(Registry::default);
        if state.hold_and_sweep(key, label) {
            return Ok(());
        }
    }
    // A failure here is the one thing nobody could see: it was logged and the
    // window went on saying this folder keeps its own history, which is what a
    // deliberate choice looks like rather than a broken one.
    let managed = bootstrap(app_data_dir, root).map_err(|error| remember_failure(key, error))?;

    let engine = Arc::new(Engine::new(managed.repo, managed.has_own_git));
    // Conflicts appear while the app is closed. Someone back from a week away
    // should not have to open each note to discover the app noticed nothing —
    // nor to be handed a week of copies that turn out to say nothing.
    //
    // Outside the registry lock, like the bootstrap above and for the same
    // reason: this walks the vault, reads files and can write a commit, and
    // every other window's open and close would queue behind it. Settling also
    // reads a setting, which takes a lock of its own — under the registry's
    // that would not be slow, it would be a deadlock.
    let conflicts = conflict::scan(root).map_err(|error| remember_failure(key, error))?;
    engine.note_conflicts(super::settle::obvious(&engine, root, conflicts));

    {
        let mut guard = registry();
        let state = guard.get_or_insert_with(Registry::default);
        state.adopt(key, label, Arc::clone(&engine));
        start_sweeping(state);
    }
    // A configured destination is checked when the workspace opens. This is
    // the first useful moment to report a bad link or sign-in, rather than
    // making someone wait for the idle timer or discover a manual button.
    if let Some(destination) = round::destination(app_data_dir, root) {
        start_round(key, &engine, root.to_path_buf(), destination);
    }
    Ok(())
}

fn remember_failure(key: &str, error: NativeError) -> NativeError {
    let mut guard = registry();
    let state = guard.get_or_insert_with(Registry::default);
    state.failures.insert(key.to_string(), error.clone());
    error
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
    for (key, engine) in engines {
        flush(&key, &engine);
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

/// The queue for one workspace's slow work.
///
/// Held by anything that must not interleave with another window doing the same
/// thing to the same vault — bootstrapping, or a sync. Taken and released here
/// so the caller waits on the lane rather than on the whole registry.
pub fn lane(key: &str) -> Arc<Mutex<()>> {
    let mut guard = registry();
    guard.get_or_insert_with(Registry::default).lane(key)
}

/// The engine recording `key`, if Auto Sync is keeping history for it.
///
/// A vault with its own git repository has no engine, which is what makes
/// "resolve this conflict" refuse rather than write something it cannot undo.
pub fn engine(key: &str) -> Option<Arc<Engine>> {
    let guard = registry();
    guard.as_ref()?.engines.get(key).map(Arc::clone)
}

/// Why `key` has no engine, when the reason was a failure rather than a choice.
pub fn failure(key: &str) -> Option<NativeError> {
    let guard = registry();
    guard.as_ref()?.failures.get(key).cloned()
}

/// Feeds watcher changes to the engine for `key`, if there is one.
///
/// Reports whether the batch turned up a conflict nobody has been told about,
/// which is the caller's cue to say so — this runs on the watcher's thread,
/// which has the handle to reach the windows with.
pub fn note_changes(key: &str, root: &Path, changes: &[WorkspaceChange]) -> bool {
    let engine = {
        let guard = registry();
        let Some(state) = guard.as_ref() else {
            return false;
        };
        let Some(engine) = state.engines.get(key) else {
            return false;
        };
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
            Ok(mut paths) => {
                // The walk only sees what is still on disk. History also has
                // to be told about the notes that a folder rename or delete
                // took with it, or the old names stay recorded forever.
                match super::snapshot::recorded_blob_paths(&engine.repository()) {
                    Ok(known) => paths.extend(known),
                    Err(error) => {
                        eprintln!("[sync] could not read recorded paths after a rescan: {error:?}");
                    }
                }
                paths
            }
            Err(error) => {
                eprintln!("[sync] could not re-read the workspace after a rescan: {error:?}");
                return false;
            }
        }
    } else {
        changed_paths(changes)
    };

    let found = paths
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
        .collect::<Vec<_>>();
    let found_new = engine.note_conflicts(super::settle::obvious(&engine, root, found));
    engine.note_changes(paths, Instant::now());
    found_new
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
                let Some(state) = guard.as_ref() else {
                    continue;
                };
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
                let was_broken = engine.problem().is_some();
                let was_stuck = engine.stuck().len();
                let recorded = engine.record_settled(now);
                if let Err(error) = &recorded {
                    eprintln!("[sync] could not record changes for {key}: {error:?}");
                }
                // Only when the footer would read differently. This runs twice
                // a second against every open workspace, and almost all of
                // those ticks are the same answer as the one before.
                if matches!(recorded, Ok(Some(_)))
                    || engine.problem().is_some() != was_broken
                    || engine.stuck().len() != was_stuck
                {
                    crate::commands::watcher::announce_sync_status(&key);
                }
                maybe_sync(&key, &engine, now);
            }
        })
        .expect("the sync sweeper thread starts");
}

/// Fires a round trip when the vault has been still and it has been long
/// enough since the last one. "Sync now" does not go through here, and the
/// per-workspace lane still keeps two trips from interleaving.
fn maybe_sync(key: &str, engine: &Arc<Engine>, now: Instant) {
    if !engine.ready_to_sync(IDLE, CAP, now) {
        return;
    }
    let Some(home) = settle::settings_home() else {
        return;
    };
    let root = PathBuf::from(key);
    let Some(destination) = round::destination(&home, &root) else {
        return;
    };
    start_round(key, engine, root, destination);
}

/// Starts one round trip, if one is not already underway.
///
/// Shared by workspace open and idle scheduling so both paths show the same
/// status, hold the same lane, and report the same failures.
fn start_round(key: &str, engine: &Arc<Engine>, root: PathBuf, destination: String) {
    if !engine.set_syncing(true) {
        return;
    }
    crate::commands::watcher::announce_sync_status(key);
    let worker = Arc::clone(engine);
    let worker_key = key.to_string();
    if std::thread::Builder::new()
        .name("thinkbrain-auto-sync".into())
        .spawn(move || {
            let _ = round::sync(&worker, &worker_key, &root, &destination);
            crate::commands::watcher::announce_sync_status(&worker_key);
        })
        .is_err()
    {
        engine.set_syncing(false);
        crate::commands::watcher::announce_sync_status(key);
    }
}

#[cfg(test)]
#[path = "registry_tests.rs"]
mod tests;
