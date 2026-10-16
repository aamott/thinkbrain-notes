//! One record per open workspace, keyed by canonical root.
//!
//! The host keeps several things alive for a vault: the windows that want it
//! watched, its file watcher, its pooled search connection, the windows that
//! were launched onto it, and its Auto Sync engine. Each used to live in its
//! own table with its own key and lifetime, so every release path had to
//! remember all of them — and the managed-vault delete remembered only the
//! search connection. Here they hang off one [`WorkspaceSession`] per root,
//! and every release goes through this module:
//!
//! - [`release_watch`] — one window stops watching one root;
//! - [`release_window`] — a window is destroyed;
//! - [`release_workspace`] — everything held for a root goes at once.
//!
//! The sync engine stays in the sync registry, which owns its bootstrap lanes
//! and sweeper, but it is keyed by the same root and released only from here.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use crate::commands::sync::registry;
use crate::commands::watcher::{WatchInterest, WorkspaceDebouncer};
use crate::error::{NativeError, lock_or_recover};

/// Everything the host holds for one canonical root.
#[derive(Default)]
pub struct WorkspaceSession {
    /// Windows created for this root, which `window_workspace_root` answers.
    launched: HashSet<String>,
    watcher: Option<WorkspaceDebouncer>,
    search: Option<Arc<Mutex<Connection>>>,
}

/// Every workspace session, plus who wants each root watched.
#[derive(Default)]
pub struct WorkspaceSessions {
    interest: WatchInterest,
    sessions: HashMap<String, WorkspaceSession>,
}

impl WorkspaceSessions {
    /// Records `label`'s request when `root` is watched already, reporting
    /// whether it joined. Checked and recorded together: a request must not
    /// land on a watcher the last release just retired.
    fn acquire_watch(&mut self, root: &str, label: &str) -> bool {
        if !self.interest.is_watched(root) {
            return false;
        }
        self.interest.acquire(root, label);
        true
    }

    /// Records `label`'s request and stores `watcher` for `root`. When a
    /// racing caller placed a watcher first, this one is handed back for the
    /// caller to drop outside the lock.
    fn adopt_watcher(
        &mut self,
        root: &str,
        label: &str,
        watcher: WorkspaceDebouncer,
    ) -> Option<WorkspaceDebouncer> {
        self.interest.acquire(root, label);
        let session = self.sessions.entry(root.to_string()).or_default();
        if session.watcher.is_some() {
            Some(watcher)
        } else {
            session.watcher = Some(watcher);
            None
        }
    }

    /// Drops one request, yielding what the last request was keeping alive.
    fn unwatch(&mut self, root: &str, label: &str) -> Option<WorkspaceSession> {
        if !self.interest.release(root, label) {
            return None;
        }
        self.retire(root)
    }

    /// Takes the watcher and search connection from a root nobody watches
    /// now. The record itself stays while a window was launched onto it.
    fn retire(&mut self, root: &str) -> Option<WorkspaceSession> {
        let session = self.sessions.get_mut(root)?;
        let retired = WorkspaceSession {
            launched: HashSet::new(),
            watcher: session.watcher.take(),
            search: session.search.take(),
        };
        if session.launched.is_empty() {
            self.sessions.remove(root);
        }
        Some(retired)
    }

    /// Drops everything `label` held — its watch requests and its launch.
    fn release_window(&mut self, label: &str) -> Vec<WorkspaceSession> {
        let mut retired: Vec<WorkspaceSession> = self
            .interest
            .release_window(label)
            .iter()
            .filter_map(|root| self.retire(root))
            .collect();
        retired.extend(self.forget_launch(label));
        retired
    }

    /// Drops everything held for `root`, naming the windows that held it and
    /// how many requests each had outstanding.
    fn release_workspace(
        &mut self,
        root: &str,
    ) -> (HashMap<String, u32>, Option<WorkspaceSession>) {
        (self.interest.release_root(root), self.sessions.remove(root))
    }

    fn search(&self, root: &str) -> Option<Arc<Mutex<Connection>>> {
        self.sessions.get(root)?.search.clone()
    }

    /// Pools `connection` for `root`, unless another caller got there first —
    /// then theirs is kept and this one is dropped.
    fn pool_search(&mut self, root: &str, connection: Connection) -> Arc<Mutex<Connection>> {
        Arc::clone(
            self.sessions
                .entry(root.to_string())
                .or_default()
                .search
                .get_or_insert_with(|| Arc::new(Mutex::new(connection))),
        )
    }

    fn register_launch(&mut self, label: &str, root: &str) {
        self.sessions
            .entry(root.to_string())
            .or_default()
            .launched
            .insert(label.to_string());
    }

    fn launched_root(&self, label: &str) -> Option<String> {
        self.sessions
            .iter()
            .find(|(_, session)| session.launched.contains(label))
            .map(|(root, _)| root.clone())
    }

    fn unregister_launch(&mut self, label: &str) -> Vec<WorkspaceSession> {
        self.forget_launch(label)
    }

    /// Removes `label` as a launcher, dropping records it alone kept alive.
    fn forget_launch(&mut self, label: &str) -> Vec<WorkspaceSession> {
        let mut emptied = Vec::new();
        for (root, session) in self.sessions.iter_mut() {
            if session.launched.remove(label)
                && session.launched.is_empty()
                && !self.interest.is_watched(root)
            {
                emptied.push(root.clone());
            }
        }
        emptied
            .iter()
            .filter_map(|root| self.sessions.remove(root))
            .collect()
    }

    /// Whether anything at all is held for `root`.
    #[cfg(test)]
    fn holds(&self, root: &str) -> bool {
        self.interest.is_watched(root) || self.sessions.contains_key(root)
    }
}

static SESSIONS: Mutex<Option<WorkspaceSessions>> = Mutex::new(None);

/// Runs `f` against the process-wide table. Whatever `f` returns is dropped
/// by the caller after the lock is released — a watcher or connection being
/// closed never holds up another window's open or close.
fn with_sessions<T>(f: impl FnOnce(&mut WorkspaceSessions) -> T) -> T {
    let mut guard = lock_or_recover(&SESSIONS);
    f(guard.get_or_insert_with(WorkspaceSessions::default))
}

/// Registers one request from `label` to watch `root`, starting the watcher
/// if nobody was watching it yet.
///
/// The watcher is spawned outside the lock — creating it registers an OS
/// watch and starts a debouncer thread, and every window's open and close
/// waits on this table, the same reason `search_connection` opens outside
/// it. Two first watchers racing both spawn; the first to adopt wins and the
/// other's is dropped.
///
/// Interest is registered only once a watcher exists, so a failure to start
/// leaves nothing claiming a watcher that does not exist.
pub fn watch<F>(root: &str, label: &str, start: F) -> Result<(), NativeError>
where
    F: FnOnce() -> Result<WorkspaceDebouncer, NativeError>,
{
    if with_sessions(|sessions| sessions.acquire_watch(root, label)) {
        return Ok(());
    }
    let watcher = start()?;
    drop(with_sessions(|sessions| {
        sessions.adopt_watcher(root, label, watcher)
    }));
    Ok(())
}

/// Releases one of `label`'s requests to watch `root`, closing the watcher,
/// the search connection and the sync engine with the last one.
pub fn release_watch(root: &str, label: &str) {
    // Flush while the watcher is still live. Dropping the watcher first would
    // leave a gap where a vault edit is seen by neither the flush nor the
    // watcher.
    registry::detach(root, label);
    drop(with_sessions(|sessions| sessions.unwatch(root, label)));
}

/// Releases everything a destroyed window held.
///
/// A window the OS destroys never runs the frontend teardown, so without this
/// its watchers, engines and launch record would outlive it.
pub fn release_window(label: &str) {
    // Same ordering as `release_watch`: flush before the watcher is gone.
    registry::release_window(label);
    drop(with_sessions(|sessions| sessions.release_window(label)));
}

/// Releases everything held for `root` at once, whichever windows hold it:
/// watch interest, watcher, sync engine, search connection, launch records.
pub fn release_workspace(root: &str) {
    let (holders, session) = with_sessions(|sessions| sessions.release_workspace(root));
    // The engine's interest mirrors the watch requests one for one, so it is
    // released request by request — while `session` still keeps the watcher
    // live for the flush.
    for (label, count) in holders {
        for _ in 0..count {
            registry::detach(root, &label);
        }
    }
    drop(session);
}

/// The pooled index connection for `root`, opened with `open` on first use.
///
/// Opened outside the lock — creating an index can take a moment, and every
/// window's open and close waits on this table. Two first uses racing both
/// open; the first to pool wins and the other connection is dropped.
pub fn search_connection<F>(root: &str, open: F) -> Result<Arc<Mutex<Connection>>, NativeError>
where
    F: FnOnce() -> Result<Connection, NativeError>,
{
    if let Some(connection) = with_sessions(|sessions| sessions.search(root)) {
        return Ok(connection);
    }
    let connection = open()?;
    Ok(with_sessions(|sessions| {
        sessions.pool_search(root, connection)
    }))
}

/// Records that window `label` was created to show `root`.
pub fn register_launch(label: String, root: String) {
    with_sessions(|sessions| sessions.register_launch(&label, &root));
}

/// The root window `label` was created for, if it was created for one.
pub fn launched_root(label: &str) -> Option<String> {
    with_sessions(|sessions| sessions.launched_root(label))
}

/// Forgets the launch record of a window that never came up.
pub fn unregister_launch(label: &str) {
    drop(with_sessions(|sessions| sessions.unregister_launch(label)));
}

/// Whether anything at all is held for `root`.
#[cfg(test)]
pub fn holds(root: &str) -> bool {
    with_sessions(|sessions| sessions.holds(root))
}

#[cfg(test)]
#[path = "workspace_session_tests.rs"]
mod tests;
