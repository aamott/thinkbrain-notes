//! Blocking-pool offload tests: `commands::blocking::run` scheduling and
//! result semantics, plus the async boundary of the commands that run on it.
//!
//! The "removed before first poll" tests pin a contract the sync commands
//! could not express: an `async` command captures its arguments when called
//! but does no disk work until the future is polled, so the filesystem it
//! sees is the one at run time — not the one at call time.

use std::{
    fs,
    pin::pin,
    sync::mpsc,
    task::{Context, Poll, Waker},
    thread,
    time::Duration,
};

use tauri::async_runtime::block_on;
use tauri::ipc::{InvokeResponseBody, IpcResponse};

use crate::NativeError;
use crate::commands::{blocking::run, media::read_media_file, workspace::*};

use super::temp_test_dir;

/// Only a guard against a wedged test hanging forever — a hung channel would
/// otherwise block `cargo test` until CI's timeout. Not a latency assertion.
const HANG_GUARD: Duration = Duration::from_secs(5);

/// Polls a pinned future once with a no-op waker: the future must arrange
/// its own rescheduling, which `run` does through the JoinHandle's waker.
fn poll_once<T>(future: &mut std::pin::Pin<&mut impl std::future::Future<Output = T>>) -> Poll<T> {
    future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
}

#[test]
fn run_dispatches_work_to_a_blocking_pool_thread() {
    let caller = thread::current().id();
    let worker = block_on(run("test.thread", move || Ok(thread::current().id())))
        .expect("worker returns its thread id");

    assert_ne!(
        caller, worker,
        "disk work must not run on the polling thread"
    );
}

#[test]
fn run_returns_work_results_unchanged() {
    let value = block_on(run("test.value", || Ok(vec![1_u8, 2, 3]))).expect("ok value");
    assert_eq!(value, vec![1, 2, 3]);

    // An ordinary NativeError is the work's own failure — it must reach the
    // caller untouched rather than being rewritten as a worker failure.
    let expected = NativeError::with_details(
        "workspace.open_failed",
        "Failed to open this workspace.",
        "no such directory",
    );
    let returned = block_on(run("test.error", {
        let expected = expected.clone();
        move || Err::<(), _>(expected)
    }))
    .expect_err("typed error passes through");
    assert_eq!(returned, expected);
}

#[test]
fn run_maps_a_worker_panic_to_worker_failed() {
    let error = block_on(run(
        "media.panic_test",
        move || -> Result<(), NativeError> {
            panic!("simulated worker panic");
        },
    ))
    .expect_err("a panicking worker is a failure, not a hang");

    assert_eq!(error.code, "native.worker_failed");
    assert_eq!(error.message, "The native operation could not finish.");
    let details = error.details.expect("details name the operation");
    assert!(
        details.contains("media.panic_test"),
        "details should carry the operation name, got: {details}"
    );
}

#[test]
fn run_is_pending_while_its_worker_is_held() {
    block_on(async {
        let (gate_tx, gate_rx) = mpsc::channel::<()>();
        let (started_tx, started_rx) = mpsc::channel::<()>();
        let (done_tx, done_rx) = mpsc::channel::<Result<&'static str, NativeError>>();

        let mut future = pin!(run("test.held", move || {
            started_tx.send(()).expect("worker started");
            // The timeout is a deadlock guard, not a speed target: if the
            // sender is dropped without releasing this errors too, so a
            // panicking test cannot leave the worker parked forever.
            gate_rx.recv_timeout(HANG_GUARD).expect("worker released");
            done_tx.send(Ok("held")).expect("completion is reported");
            Ok("held result")
        }));

        // First poll schedules the worker but cannot complete it.
        assert!(matches!(poll_once(&mut future), Poll::Pending));
        started_rx.recv_timeout(HANG_GUARD).expect("worker started");

        // A held worker does not serialize the pool: an independent run
        // completes while the first is still parked. The result comes back
        // over a channel because awaiting `run` inline here would hang
        // forever on a serialization regression instead of failing.
        let (parallel_tx, parallel_rx) = mpsc::channel::<Result<u32, NativeError>>();
        tauri::async_runtime::spawn(async move {
            parallel_tx
                .send(run("test.parallel", || Ok(7_u32)).await)
                .expect("parallel result is reported");
        });
        let parallel = parallel_rx
            .recv_timeout(HANG_GUARD)
            .expect("parallel work completes while the held worker is parked");
        assert_eq!(parallel.expect("parallel work succeeds"), 7);

        gate_tx.send(()).expect("release the held worker");
        assert_eq!(future.await.expect("held worker finishes"), "held result");
        assert_eq!(
            done_rx
                .recv_timeout(HANG_GUARD)
                .expect("held worker reported done"),
            Ok("held")
        );
    });
}

#[test]
fn dropping_the_future_lets_the_worker_finish() {
    block_on(async {
        let (gate_tx, gate_rx) = mpsc::channel::<()>();
        let (done_tx, done_rx) = mpsc::channel::<()>();

        {
            let mut future = pin!(run("test.detached", move || {
                gate_rx.recv_timeout(HANG_GUARD).expect("worker released");
                done_tx.send(()).expect("completion is reported");
                Ok(())
            }));
            assert!(matches!(poll_once(&mut future), Poll::Pending));
            // Dropping the future drops the JoinHandle, which detaches rather
            // than cancels the spawned work. That is intentional: a caller
            // that stops awaiting (window closed, request superseded) must
            // not strand or abort a read already on the pool, and no window
            // or session owner is needed to reap it.
        }

        gate_tx.send(()).expect("release the detached worker");
        done_rx
            .recv_timeout(HANG_GUARD)
            .expect("detached worker ran to completion");
    });
}

#[test]
fn list_workspace_entries_validates_the_root_at_run_time() {
    let root = temp_test_dir("async-root-removed");
    let root_path = root.to_string_lossy().to_string();
    let future = list_workspace_entries(root_path, false, None);
    // Remove the vault after the future exists but before it is polled: the
    // worker must see the disk as it is now, not as it was at call time.
    fs::remove_dir_all(&root).expect("root removed before first poll");

    let error = block_on(future).expect_err("missing root is rejected");
    assert_eq!(error.code, "workspace.open_failed");
}

#[test]
fn list_workspace_entries_sees_disk_state_at_run_time() {
    let root = temp_test_dir("async-root-created");
    let root_path = root.to_string_lossy().to_string();
    fs::remove_dir_all(&root).expect("fixture starts absent");
    let future = list_workspace_entries(root_path, false, None);

    // Populate the vault only after the future is created.
    fs::create_dir_all(root.join("docs")).expect("root recreated");
    fs::write(root.join("docs/note.md"), "# Late note\n").expect("note written");

    let entries = block_on(future).expect("listing succeeds");
    let paths: Vec<&str> = entries
        .iter()
        .map(|entry| entry.relative_path.as_str())
        .collect();
    assert!(paths.contains(&"docs"));
    assert!(paths.contains(&"docs/note.md"));

    fs::remove_dir_all(&root).expect("fixture cleaned up");
}

#[test]
fn read_media_file_validates_the_root_at_run_time() {
    let root = temp_test_dir("async-media-removed");
    let root_path = root.to_string_lossy().to_string();
    fs::write(root.join("pixel.png"), [0x89_u8]).expect("media written");
    let future = read_media_file(root_path, "pixel.png".to_string());
    // Remove the vault after the future exists but before it is polled.
    fs::remove_dir_all(&root).expect("root removed before first poll");

    // Response is not Debug, so this cannot use `expect_err`.
    let error = block_on(future).err().expect("missing root is rejected");
    assert_eq!(error.code, "workspace.open_failed");
}

/// Compile-time guard against `open_workspace` regressing back to a sync
/// handler — its body holds an `AppHandle`, so no runtime instance is made
/// here; the workspace-window lifecycle tests cover the seam.
#[test]
fn open_workspace_command_is_async() {
    fn assert_async_command<F, Fut>(_command: F)
    where
        F: Fn(tauri::AppHandle, String) -> Fut,
        Fut: std::future::Future<Output = Result<WorkspaceSnapshot, NativeError>>,
    {
    }

    assert_async_command(open_workspace);
}

#[test]
fn read_media_file_returns_the_file_as_a_raw_response() {
    let root = temp_test_dir("async-media-ok");
    fs::write(root.join("pixel.png"), [0x89_u8, 0x50, 0x4e, 0x47]).expect("media written");

    let response = block_on(read_media_file(
        root.to_string_lossy().to_string(),
        "pixel.png".to_string(),
    ))
    .expect("media read succeeds");

    match response.body().expect("response has a body") {
        InvokeResponseBody::Raw(bytes) => assert_eq!(bytes, vec![0x89, 0x50, 0x4e, 0x47]),
        other => panic!("media responses must be raw bytes, got {other:?}"),
    }

    fs::remove_dir_all(&root).expect("fixture cleaned up");
}
