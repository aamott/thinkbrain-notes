//! Runs synchronous disk work off the async runtime's worker threads.
//!
//! An `async` Tauri command is polled on an async-runtime worker, and a body
//! that walks a vault or reads a large file holds that worker for every task
//! it was driving. `run` hands the body to the blocking pool — the thread pool
//! built for exactly this — so the worker is released while the filesystem
//! call proceeds, then flattens the join result back into the command's
//! ordinary `Result`.

use crate::error::NativeError;

/// Runs `work` on the blocking pool and returns its result unchanged.
///
/// `operation` names the command, which is the only context a join failure
/// carries: a panicking or cancelled worker surfaces as `native.worker_failed`
/// with the operation in `details` rather than as a hung IPC call or a bare
/// panic string. The work itself owns its errors — they pass through typed.
pub(crate) async fn run<T, F>(operation: &'static str, work: F) -> Result<T, NativeError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, NativeError> + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(result) => result,
        Err(error) => {
            eprintln!("[{operation}] blocking task failed: {error}");
            Err(NativeError::with_details(
                "native.worker_failed",
                "The native operation could not finish.",
                format!("{operation}: {error}"),
            ))
        }
    }
}
