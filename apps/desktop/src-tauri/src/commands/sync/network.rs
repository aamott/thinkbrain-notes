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
const REMOTE_REF: &str = "refs/thinkbrain/remote";

/// How long one fetch or push may take.
///
/// Held across the per-workspace lane, so a hung remote must not pin that
/// lane forever — every later Sync Now on this vault queues behind it.
pub(super) const NETWORK: Duration = Duration::from_secs(90);

/// Brings the destination's branch down into a ref of ours.
///
/// `None` means the far side has nothing on that branch yet, which is what a
/// destination looks like before anyone has synced to it.
pub(super) fn fetch(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<Option<gix::ObjectId>, NativeError> {
    let brought = repo
        .remote_at(gix::bstr::BStr::new(destination))
        .map_err(remote_failure)?
        .with_refspecs(
            [format!("{}:{}", super::snapshot::HISTORY_REF, REMOTE_REF).as_str()],
            Direction::Fetch,
        )
        .map_err(remote_failure)?
        .with_fetch_tags(gix::remote::fetch::Tags::None)
        .connect(Direction::Fetch)
        .map_err(remote_failure)?
        .with_credentials(super::credentials::provide)
        .prepare_fetch(gix::progress::Discard, Default::default())
        .map_err(remote_failure)?
        .receive(gix::progress::Discard, cancel);

    match brought {
        Ok(_) => head_of(repo, REMOTE_REF),
        // The branch is simply not there: a destination nobody has synced to
        // yet. Nothing to bring down is not a failure to reach it.
        Err(gix::remote::fetch::Error::NoMapping { .. }) => Ok(None),
        Err(_) if cancel.load(Ordering::Relaxed) => Err(timed_out()),
        Err(error) => Err(remote_failure(error)),
    }
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

fn head_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    let unreadable = |error: &dyn std::fmt::Display| {
        failed(
            "sync.history_unreadable",
            "Could not read a sync marker.",
            error,
        )
    };
    repo.try_find_reference(reference)
        .map_err(|error| unreadable(&error))?
        .map(|mut found| {
            found
                .peel_to_id()
                .map(gix::Id::detach)
                .map_err(|error| unreadable(&error))
        })
        .transpose()
}
