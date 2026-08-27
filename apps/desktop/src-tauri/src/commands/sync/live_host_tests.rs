//! Opt-in proof against a real HTTPS host (GitHub / GitLab).
//!
//! Ignored by default. Set `TB_SYNC_LIVE_URL`, `TB_SYNC_LIVE_USER`, and
//! `TB_SYNC_LIVE_TOKEN`, then run:
//! `cargo test -p thinkbrain-notes-desktop --lib live_host -- --ignored --nocapture --test-threads=1`
//!
//! Never logs the token. Prefer a disposable private repository.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use super::credentials;
use super::push;
use super::round::{Synced, run_trip};
use super::snapshot;
use super::test_support;

static NEXT: AtomicU64 = AtomicU64::new(1);

struct Device {
    vault: PathBuf,
    repo: gix::Repository,
}

fn device(name: &str) -> Device {
    let fixture = test_support::repo_fixture(name, "live-host");
    Device {
        vault: fixture.vault,
        repo: fixture.repo,
    }
}

fn write(device: &Device, relative: &str, contents: &str) {
    test_support::write(&device.vault, relative, contents);
    snapshot::record(
        &device.repo,
        &[PathBuf::from(relative)],
        &format!("changed {relative}"),
    )
    .expect("the change is recorded");
}

fn read(device: &Device, relative: &str) -> String {
    fs::read_to_string(device.vault.join(relative)).expect("the note is on disk")
}

fn live_env() -> Option<(String, String, String)> {
    let url = env::var("TB_SYNC_LIVE_URL").ok()?.trim().to_string();
    let user = env::var("TB_SYNC_LIVE_USER").ok()?.trim().to_string();
    let token = env::var("TB_SYNC_LIVE_TOKEN").ok()?.trim().to_string();
    if url.is_empty() || user.is_empty() || token.is_empty() {
        return None;
    }
    Some((url, user, token))
}

fn trip(device: &Device, destination: &str, profile: &str) -> Synced {
    run_trip(
        &device.repo,
        &device.vault,
        destination,
        Some(profile),
        |_| {},
    )
    .unwrap_or_else(|error| panic!("live sync failed: {} ({})", error.message, error.code))
}

fn bind_profile(user: &str, token: &str) -> String {
    let id = format!("live-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    credentials::store_profile(&id, user, token).expect("the live sign-in is stored");
    id
}

#[test]
#[ignore = "needs TB_SYNC_LIVE_* against a disposable HTTPS repo"]
fn live_host_empty_remote_two_devices_and_conflict() {
    let Some((url, user, token)) = live_env() else {
        panic!("set TB_SYNC_LIVE_URL, TB_SYNC_LIVE_USER, and TB_SYNC_LIVE_TOKEN");
    };
    let profile = bind_profile(&user, &token);
    let one = device("live-one");
    let two = device("live-two");

    write(&one, "from-one.md", "first\n");
    let first = trip(&one, &url, &profile);
    assert_eq!(first.landed, push::Landed::Moved);
    assert!(first.sent > 0, "nothing was sent to the live host");

    let brought = trip(&two, &url, &profile);
    assert_eq!(brought.brought_down, 1);
    assert_eq!(read(&two, "from-one.md"), "first\n");

    // A later note from the first device must still land after the second
    // device has caught up — catching up must not invent a merge commit that
    // blocks the next push.
    write(&one, "shared.md", "the line\n");
    let again = trip(&one, &url, &profile);
    assert_eq!(
        again.landed,
        push::Landed::Moved,
        "catch-up on the other device blocked this push"
    );
    trip(&two, &url, &profile);
    assert_eq!(read(&two, "shared.md"), "the line\n");

    write(&one, "shared.md", "one wording\n");
    assert_eq!(trip(&one, &url, &profile).landed, push::Landed::Moved);
    write(&two, "shared.md", "two wording\n");
    let conflicted = trip(&two, &url, &profile);
    assert_eq!(
        conflicted.asked_about, 1,
        "a live conflict did not leave a question"
    );
    assert_eq!(read(&two, "shared.md"), "two wording\n");
    assert_eq!(
        read(&two, "shared (from another device).md"),
        "one wording\n"
    );
}
