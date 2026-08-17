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
    /// Whether the sweeper thread is running. It outlives individual engines
    /// and simply idles when the map is empty.
    sweeping: bool,
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
    let mut guard = registry();
    let state = guard.get_or_insert_with(Registry::default);

    if !state.engines.contains_key(key) {
        match bootstrap(app_data_dir, root)? {
            Managed::HasOwnGit => return Ok(false),
            Managed::Yes(workspace) => {
                state
                    .engines
                    .insert(key.to_string(), Arc::new(Engine::new(workspace.repo)));
            }
        }
    }

    state.interest.acquire(key, label);
    if !state.sweeping {
        state.sweeping = true;
        spawn_sweeper();
    }
    Ok(true)
}

/// Releases one window's interest in `key`, dropping the engine with the last.
pub fn detach(key: &str, label: &str) {
    let mut guard = registry();
    let Some(state) = guard.as_mut() else { return };
    if state.interest.release(key, label) {
        state.engines.remove(key);
    }
}

/// Releases everything a window held, for windows the OS destroys.
pub fn release_window(label: &str) {
    let mut guard = registry();
    let Some(state) = guard.as_mut() else { return };
    for key in state.interest.release_window(label) {
        state.engines.remove(&key);
    }
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
