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

/// What a request to watch a root should do next.
enum WatchStep {
    /// The watcher is running; the caller's interest was recorded.
    Join,
    /// Nobody watches the root; the caller spawns one and adopts it.
    Spawn,
    /// The window making the request was already destroyed — joining now
    /// would register interest nobody could ever release.
    TurnedAway,
}

/// What a spawn that finished outside the lock found on its return.
enum WatchAdoption {
    /// Installed as the root's watcher.
    Kept,
    /// A racing caller installed one first — the caller still joined, so its
    /// interest stands; this spawn is handed back to drop.
    Shared(WorkspaceDebouncer),
    /// The spawn outlived its own release — a `closed` label or a pending
    /// marker a release already cleared. Nothing was registered; the caller
    /// drops the watcher and must not follow up as if it were watching.
    Rejected(WorkspaceDebouncer),
}

/// Every workspace session, plus who wants each root watched.
#[derive(Default)]
pub struct WorkspaceSessions {
    interest: WatchInterest,
    sessions: HashMap<String, WorkspaceSession>,
    /// Labels the OS destroyed. A watch or spawn that lands late for one must
    /// not resurrect holdings whose release already ran — nobody will ever
    /// release them again.
    closed: HashSet<String>,
    /// In-flight first-watch spawns, counted per `(root, label)`. Recorded
    /// when a caller is sent to spawn and cleared by every release path, so
    /// an adoption whose reservation is gone knows the request was cancelled
    /// while the OS registration was in flight.
    pending: HashMap<(String, String), u32>,
}

impl WorkspaceSessions {
    /// Decides what `label`'s request to watch `root` does next. Joined
    /// interest is recorded here, atomically with the watcher check: a
    /// request must not land on a watcher the last release just retired.
    /// A spawning request is only reserved — its interest registers at
    /// adoption, once a watcher exists to back it.
    fn acquire_watch(&mut self, root: &str, label: &str) -> WatchStep {
        if self.closed.contains(label) {
            return WatchStep::TurnedAway;
        }
        if self.interest.is_watched(root) {
            self.interest.acquire(root, label);
            return WatchStep::Join;
        }
        *self
            .pending
            .entry((root.to_string(), label.to_string()))
            .or_insert(0) += 1;
        WatchStep::Spawn
    }

    /// Adopts `watcher` for `root` on behalf of `label`, which reserved the
    /// spawn in [`acquire_watch`]. When the reservation is gone — the window
    /// was destroyed or a release cancelled it while the watcher spawned —
    /// the spawn is rejected rather than resurrecting released holdings.
    fn adopt_watcher(
        &mut self,
        root: &str,
        label: &str,
        watcher: WorkspaceDebouncer,
    ) -> WatchAdoption {
        if !self.claim_spawn(root, label) || self.closed.contains(label) {
            return WatchAdoption::Rejected(watcher);
        }
        self.interest.acquire(root, label);
        let session = self.sessions.entry(root.to_string()).or_default();
        if session.watcher.is_some() {
            WatchAdoption::Shared(watcher)
        } else {
            session.watcher = Some(watcher);
            WatchAdoption::Kept
        }
    }

    /// Consumes one of `(root, label)`'s in-flight spawn reservations.
    /// `false` when none remains — the releases it was paired with already
    /// ran, so the spawn it fed belongs to nobody.
    fn claim_spawn(&mut self, root: &str, label: &str) -> bool {
        let key = (root.to_string(), label.to_string());
        match self.pending.get_mut(&key) {
            Some(count) => {
                *count -= 1;
                if *count == 0 {
                    self.pending.remove(&key);
                }
                true
            }
            None => false,
        }
    }

    /// Drops the spawn reservation `start` never consumed because it failed.
    fn cancel_spawn(&mut self, root: &str, label: &str) {
        self.claim_spawn(root, label);
    }

    /// Drops one request, yielding what the last request was keeping alive.
    /// When the label still has a spawn in flight, that reservation is the
    /// request being released — the caller that asked to stop watching must
    /// not gain a watcher when the spawn lands — and the joined interest, a
    /// separate request, stays.
    fn unwatch(&mut self, root: &str, label: &str) -> Option<WorkspaceSession> {
        if self.claim_spawn(root, label) {
            return None;
        }
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

    /// Drops everything `label` held — its watch requests and its launch —
    /// and bars it from ever holding anything again.
    fn release_window(&mut self, label: &str) -> Vec<WorkspaceSession> {
        self.closed.insert(label.to_string());
        self.pending.retain(|(_, l), _| l != label);
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
        self.pending.retain(|(r, _), _| r != root);
        (self.interest.release_root(root), self.sessions.remove(root))
    }

    fn search(&self, root: &str) -> Option<Arc<Mutex<Connection>>> {
        self.sessions.get(root)?.search.clone()
    }

    /// Pools `connection` for `root`, unless another caller got there first —
    /// then theirs is kept and this one is dropped. When nothing holds `root`
    /// anymore — the last interest or launch released while `open` ran — the
    /// connection goes back unpooled: pooling it would hold it for the rest
    /// of the process, since nothing remains to release it.
    fn pool_search(&mut self, root: &str, connection: Connection) -> Arc<Mutex<Connection>> {
        let held = self.interest.is_watched(root)
            || self
                .sessions
                .get(root)
                .is_some_and(|session| !session.launched.is_empty());
        if !held {
            return Arc::new(Mutex::new(connection));
        }
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
///
/// Returns whether the request stands: `false` when the window was already
/// destroyed, or the request was released while the watcher spawned. In either
/// case nothing is held for `label` and the caller must not follow up — by
/// attaching a sync engine, say — as if the watch existed.
pub fn watch<F>(root: &str, label: &str, start: F) -> Result<bool, NativeError>
where
    F: FnOnce() -> Result<WorkspaceDebouncer, NativeError>,
{
    match with_sessions(|sessions| sessions.acquire_watch(root, label)) {
        WatchStep::TurnedAway => return Ok(false),
        WatchStep::Join => return Ok(true),
        WatchStep::Spawn => {}
    }
    let watcher = match start() {
        Ok(watcher) => watcher,
        Err(error) => {
            with_sessions(|sessions| sessions.cancel_spawn(root, label));
            return Err(error);
        }
    };
    let adoption = with_sessions(|sessions| sessions.adopt_watcher(root, label, watcher));
    match adoption {
        WatchAdoption::Kept => Ok(true),
        // Dropping a returned spawn stops the debouncer thread — outside the
        // lock, the same reason the spawn ran outside it.
        WatchAdoption::Shared(watcher) => {
            drop(watcher);
            Ok(true)
        }
        WatchAdoption::Rejected(watcher) => {
            drop(watcher);
            Ok(false)
        }
    }
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
