use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;

use gix::remote::Direction;

use crate::error::NativeError;

use super::failed;
use super::remote_failure;

/// Where a fetched branch is put.
///
/// Deliberately outside `refs/heads/`, so nothing can mistake the other
/// device's work for our own history.
pub(super) const REMOTE_REF: &str = "refs/thinkbrain/remote";

/// How long one fetch or push may take.
///
/// Held across the per-workspace lane, so a hung remote must not pin that
/// lane forever — every later Sync Now on this vault queues behind it.
pub(super) const NETWORK: Duration = Duration::from_secs(90);

/// Brings the destination's default branch down into a ref of ours.
///
/// Uses git protocol v2 by default (gix default). If ref discovery fails on an
/// HTTPS remote that rejects v2 requests (e.g. Cloudflare / middleboxes
/// blocking v2 POSTs or servers without v2 support), retries once with protocol
/// v1 scoped strictly to an in-memory repository config clone.
///
/// `None` means the far side has nothing on that branch yet, which is what a
/// destination looks like before anyone has synced to it. Local remotes are
/// asked for HEAD's target so a nonstandard default (not `main`) still arrives.
pub(super) fn fetch(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<Option<gix::ObjectId>, NativeError> {
    match fetch_attempt(repo, destination, cancel) {
        Ok(result) => Ok(result),
        Err(error) => {
            if cancel.load(Ordering::Relaxed) {
                return Err(error);
            }
            if let Some(v1_repo) = repo_with_protocol_v1(repo) {
                if let Ok(result) = fetch_attempt(&v1_repo, destination, cancel) {
                    return Ok(result);
                }
            }
            Err(error)
        }
    }
}

fn repo_with_protocol_v1(repo: &gix::Repository) -> Option<gix::Repository> {
    let mut cloned = repo.clone();
    let mut config = cloned.config_snapshot_mut();
    config.set_raw_value("protocol.version", "1").ok()?;
    config.commit().ok()?;
    Some(cloned)
}

fn fetch_attempt(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<Option<gix::ObjectId>, NativeError> {
    let spec = fetch_refspec(destination);
    match receive(repo, destination, cancel, &spec)? {
        Some(id) => Ok(Some(id)),
        None if spec != main_refspec() => receive(repo, destination, cancel, &main_refspec()),
        None => Ok(None),
    }
}

fn receive(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
    spec: &str,
) -> Result<Option<gix::ObjectId>, NativeError> {
    let normalized = super::normalize_destination(destination);
    let brought = repo
        .remote_at(gix::bstr::BStr::new(&normalized))
        .map_err(remote_failure)?
        .with_refspecs([spec], Direction::Fetch)
        .map_err(remote_failure)?
        .with_fetch_tags(gix::remote::fetch::Tags::None)
        .connect(Direction::Fetch)
        .map_err(remote_failure)?
        .with_credentials(super::credentials::provide)
        .prepare_fetch(gix::progress::Discard, Default::default())
        .map_err(remote_failure)?
        .receive(gix::progress::Discard, cancel);

    match brought {
        Ok(_) => super::snapshot::try_head_of(repo, REMOTE_REF).map_err(|error| {
            failed(
                "sync.history_unreadable",
                "Could not read a sync marker.",
                error,
            )
        }),
        Err(gix::remote::fetch::Error::NoMapping { .. }) => Ok(None),
        Err(_) if cancel.load(Ordering::Relaxed) => Err(timed_out()),
        Err(error) => Err(remote_failure(error)),
    }
}
fn fetch_refspec(destination: &str) -> String {
    local_head_target(destination)
        .map(|name| format!("{name}:{REMOTE_REF}"))
        .unwrap_or_else(|| format!("HEAD:{REMOTE_REF}"))
}

fn main_refspec() -> String {
    format!("{}:{REMOTE_REF}", super::snapshot::HISTORY_REF)
}

fn local_head_target(destination: &str) -> Option<String> {
    let path = destination.strip_prefix("file://").unwrap_or(destination);
    let repo = gix::open(path).ok()?;
    let head = repo.head().ok()?;
    Some(head.referent_name()?.as_bstr().to_string())
}

fn timed_out() -> NativeError {
    NativeError::new(
        "sync.remote_timeout",
        "The other end took too long to answer.",
    )
}

/// Runs `work` on its own thread so a hung remote cannot pin the caller —
/// and therefore the per-workspace lane — past `limit`.
///
/// A panic inside `work` is caught so it surfaces as a distinct
/// `sync.internal_error` rather than a misleading `sync.remote_unreachable`
/// (a panic used to drop the sender, which the receiver reported as "could not
/// reach the remote"). The panic payload is logged — never any secret — and
/// the original error message is preserved in the log for debugging.
pub(super) fn bounded<T: Send + 'static>(
    limit: Duration,
    cancel: Arc<AtomicBool>,
    work: impl FnOnce() -> Result<T, NativeError> + Send + 'static,
) -> Result<T, NativeError> {
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("thinkbrain-sync-io".into())
        .spawn(move || {
            // `AssertUnwindSafe`: the closure captures remote handles whose
            // `UnwindSafe` impls we do not control, but a sync is single-threaded
            // per workspace lane, so there is no concurrent mutation to corrupt.
            let outcome =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)).map_err(|panic| {
                    eprintln!("[sync] worker thread panicked: {panic:?}");
                    NativeError::new(
                        "sync.internal_error",
                        "An internal error occurred during sync.",
                    )
                });
            let _ = tx.send(outcome.and_then(|inner| inner));
        })
        .map_err(|error| {
            failed(
                "sync.remote_unreachable",
                "Could not reach the place these notes sync to.",
                error,
            )
        })?;
    match rx.recv_timeout(limit) {
        Ok(outcome) => outcome,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            cancel.store(true, Ordering::Relaxed);
            Err(timed_out())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(NativeError::new(
            "sync.remote_unreachable",
            "Could not reach the place these notes sync to.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::sync::test_support;

    #[test]
    fn protocol_v1_fallback_does_not_mutate_on_disk_config() {
        let fixture = test_support::repo_fixture("v1-fallback", "network");
        let on_disk_config_path = fixture.repo.git_dir().join("config");
        let initial_config =
            std::fs::read_to_string(&on_disk_config_path).expect("config file exists");
        assert!(!initial_config.contains("protocol.version"));

        let v1_repo = repo_with_protocol_v1(&fixture.repo).expect("in-memory clone succeeds");
        let config_snapshot = v1_repo.config_snapshot();
        let version = config_snapshot
            .string("protocol.version")
            .map(|s| s.to_string());
        assert_eq!(version.as_deref(), Some("1"));

        // Confirm the config file on disk was not touched
        let disk_after = std::fs::read_to_string(&on_disk_config_path).expect("config exists");
        assert!(!disk_after.contains("protocol.version"));
        assert_eq!(initial_config, disk_after);
    }
}
