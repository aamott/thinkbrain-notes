# Mobile Sync Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace idle-time inference as the only way an automatic sync starts, with an explicit `sync.trigger` policy both platforms honour, so Android's frozen-then-resumed clock stops firing syncs nobody asked for.

**Architecture:** One setting drives `maybe_sync`. The sweeper thread keeps running everywhere and keeps doing its local work; only its decision to start a *network* round trip changes. The webview reports foreground/background lifecycle events; Rust decides which vaults that affects, because the registry already holds them.

**Tech Stack:** Rust (Tauri commands, `std::sync`), TypeScript/React (settings module in `packages/core`, adapter hook in `apps/desktop/src`), vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-28-mobile-sync-triggers-design.md`

## Global Constraints

- `run_trip` and the round-trip code in `round.rs` are **unchanged**. This is a scheduling change. If a task starts editing the round trip, stop — the design was wrong. The single permitted exception is Task 4's three-line recording call in `sync`, placed after the trip has returned, beside the maintenance bookkeeping already there; it adds no round-trip logic and `run_trip` and everything it calls stay untouched. Any other edit to `round.rs` is out of scope.
- The sweeper thread runs on **every** platform. `record_settled` and `maybe_maintain` are untouched; only `maybe_sync` changes.
- `cfg!(target_os = ...)` appears in **exactly one** place: resolving `auto`. Nowhere else in the sync code asks what platform it is on.
- Staleness threshold: **3 minutes**.
- Setting key: `sync.trigger`. Values: `auto` (default), `idle`, `foreground`, `manual`.
- A Rust default constant duplicated from TypeScript must carry a comment naming the other file, matching the existing convention in `settle.rs:36-41`.
- `pnpm qa` green before every commit.

---

### Task 1: Confirm `visibilitychange` fires on Android

The spec names this as its first risk. Everything else assumes it. Do not build on it unverified — the logcat-forwarding assumption earlier in this project looked equally safe and needed checking too.

**Files:** none — this task produces an answer, not code.

**Interfaces:**
- Consumes: nothing.
- Produces: a go/no-go recorded in the story. If it fails, later tasks change: the foreground signal must come from a Kotlin lifecycle hook instead, and Task 6 is rewritten.

- [ ] **Step 1: Build, install and attach the debugger**

```bash
pnpm desktop:tauri android build --debug --apk --target x86_64
adb install -r apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.thinkbrain.notes)
```

- [ ] **Step 2: Install a recording listener in the webview**

```bash
python3 tools/android-devtools/wveval.py "(() => {
  window.__vis = [];
  document.addEventListener('visibilitychange', () => window.__vis.push(document.visibilityState));
  return 'listening';
})()"
```

- [ ] **Step 3: Background and foreground the app**

```bash
adb shell input keyevent KEYCODE_HOME
adb shell 'sleep 3'
adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1
adb shell 'sleep 3'
```

- [ ] **Step 4: Read what was recorded**

```bash
python3 tools/android-devtools/wveval.py "JSON.stringify(window.__vis)"
```

Expected: `["hidden","visible"]`. Anything else — an empty array especially — means the assumption is false.

- [ ] **Step 5: Record the answer in the story and commit**

Write the observed output into `plans/mobile/pending-mobile_sync_triggers-high-med.md` under a "Verified on a device" heading, including the exact array, so the next reader does not have to re-run it.

```bash
git add plans/mobile/pending-mobile_sync_triggers-high-med.md
git commit -m "Confirm visibilitychange fires on Android before building on it"
```

**If it fails:** stop and report. Do not proceed to Task 6 as written.

---

### Task 2: The `sync.trigger` setting

**Files:**
- Modify: `packages/core/src/settings/modules/sync.ts`
- Test: `packages/core/src/settings/modules/sync.test.ts`

**Interfaces:**
- Produces: setting key `sync.trigger`, values `"auto" | "idle" | "foreground" | "manual"`, default `"auto"`, scope `"app"`, section `sync.destination`. Task 3 reads this key from the app settings file.

- [ ] **Step 1: Write the failing test**

Add to the existing `describe` block, using the imports already at the top of
that file — `createSettingsRegistry` from `../registry`, `validateSettings`
from `../validation`, and `syncModule` from `./sync`:

```ts
it("offers a sync trigger policy that defaults to auto", () => {
  const registry = createSettingsRegistry();
  registry.register(syncModule);
  const definition = registry.getDefinition("sync.trigger");

  expect(definition?.default).toBe("auto");
  expect(validateSettings(registry, { "sync.trigger": "manual" })).toEqual([]);
  expect(validateSettings(registry, { "sync.trigger": "whenever" })).not.toEqual([]);
});
```

Verified against `sync.test.ts:49-50`, do not substitute: the module export is
`syncModule`, the registry helper is `createSettingsRegistry`, and it takes no
arguments — modules are added with a separate `registry.register(...)` call.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @thinkbrain/core exec vitest run src/settings/modules/sync.test.ts`
Expected: FAIL — `getDefinition("sync.trigger")` returns undefined.

- [ ] **Step 3: Add the setting**

In `sync.ts`, add to the `sync.destination` section's `settings` array:

```ts
{
  key: "trigger",
  type: "enum",
  default: DEFAULT_SYNC_TRIGGER,
  options: ["auto", "idle", "foreground", "manual"],
  scope: "app",
  section: "sync.destination",
  label: "When to sync",
  description:
    "Automatic suits most people: this computer syncs when a folder has been still for a moment, and a phone syncs when you come back to it. When idle only syncs after you stop typing. When I return syncs when you open the app again, if it has been a few minutes. Only when I ask never syncs on its own — your notes stay on this device until you press Sync now."
}
```

and above the module:

```ts
/** Repeated in `apps/desktop/src-tauri/src/commands/sync/trigger.rs`. Changing one means changing the other. */
export const DEFAULT_SYNC_TRIGGER = "auto";
```

`"enum"` is a real `SettingType` (`packages/core/src/settings/types.ts:11`); it requires `options` and renders as a select control automatically. Do not copy `historyPolicy` — that one is `type: "string"` with a custom control, which would give this setting a free-text box.

- [ ] **Step 4: Run the test and watch it pass**

Run: `pnpm --filter @thinkbrain/core exec vitest run src/settings/modules/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/settings/modules/sync.ts packages/core/src/settings/modules/sync.test.ts
git commit -m "Add a sync trigger policy setting"
```

---

### Task 3: Read the policy in Rust and resolve `auto`

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/sync/trigger.rs`
- Create: `apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands/sync/mod.rs` (add `pub mod trigger;` and the `#[cfg(test)] #[path = "trigger_tests.rs"] mod trigger_test;` pair, matching how `settle` is wired)

**Interfaces:**
- Consumes: setting key `sync.trigger` from Task 2.
- Produces:
  - `pub enum Trigger { Idle, Foreground, Manual }`
  - `pub fn resolved_in(app_data_dir: Option<&Path>) -> Trigger`
  - `pub fn resolved() -> Trigger`

- [ ] **Step 1: Write the failing tests**

```rust
use super::trigger::{Trigger, resolved_in};
use crate::tests::make_temp_test_dir;

fn home_with(setting: Option<&str>) -> std::path::PathBuf {
    let dir = make_temp_test_dir("trigger", "sync", true);
    if let Some(json) = setting {
        let path = crate::commands::settings::app_settings_path(&dir);
        std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
        std::fs::write(&path, json).expect("settings written");
    }
    dir
}

#[test]
fn an_explicit_policy_is_honoured() {
    let home = home_with(Some(r#"{"sync.trigger":"manual"}"#));
    assert_eq!(resolved_in(Some(&home)), Trigger::Manual);
}

/// `auto` is the default, and it is the only place the platform is consulted.
#[test]
fn auto_resolves_to_this_platforms_default() {
    let home = home_with(Some(r#"{"sync.trigger":"auto"}"#));
    let expected = if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    };
    assert_eq!(resolved_in(Some(&home)), expected);
}

/// A preference nobody can read is not an instruction to behave differently.
#[test]
fn an_unreadable_or_absent_setting_falls_back_to_auto() {
    let home = home_with(None);
    let expected = if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    };
    assert_eq!(resolved_in(Some(&home)), expected);
    assert_eq!(resolved_in(None), expected);
}

#[test]
fn an_unknown_value_falls_back_rather_than_disabling_sync() {
    let home = home_with(Some(r#"{"sync.trigger":"whenever"}"#));
    assert_ne!(resolved_in(Some(&home)), Trigger::Manual);
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib trigger`
Expected: FAIL — module `trigger` does not exist.

- [ ] **Step 3: Write `trigger.rs`**

```rust
//! When an automatic round trip is allowed to start.
//!
//! Idle time is an inference about what someone is doing, drawn from a clock.
//! On Android that clock stops during a freeze and jumps on resume, so the
//! inference fires against time that never passed. This module replaces the
//! inference with a stated policy, so the sweeper asks what the user wants
//! rather than guessing from a timer.

use std::path::Path;

/// The composed settings key: module `sync`, setting `trigger`, declared in
/// `packages/core/src/settings/modules/sync.ts`. Spelled out here rather than
/// derived because this side answers the question before any window is
/// listening. Changing the key there means changing it here.
const SETTING: &str = "sync.trigger";

/// What starts an automatic round trip.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    /// Once the vault has been still. The sweeper's original behaviour.
    Idle,
    /// On workspace open, and on return to the app when the last successful
    /// sync is old enough to be worth repeating.
    Foreground,
    /// Never on its own.
    Manual,
}

/// The one place in the sync code that asks what platform it is running on.
///
/// A phone is glanced at far more often than a desktop is focused, and its
/// process is frozen in between; a desktop keeps running and its clock keeps
/// meaning something. Those are different enough to deserve different
/// defaults, and `auto` is how a user says "whichever suits this device".
fn platform_default() -> Trigger {
    if cfg!(target_os = "android") {
        Trigger::Foreground
    } else {
        Trigger::Idle
    }
}

/// The policy in force, read from the app settings file.
pub fn resolved() -> Trigger {
    resolved_in(super::settle::settings_home().as_deref())
}

/// The same, told where to look, so it can be tested against a real file
/// rather than against a location the whole process shares.
pub fn resolved_in(app_data_dir: Option<&Path>) -> Trigger {
    let Some(app_data_dir) = app_data_dir else {
        return platform_default();
    };
    let path = crate::commands::settings::app_settings_path(app_data_dir);
    let Ok(contents) = crate::commands::settings::read_settings_file(&path) else {
        return platform_default();
    };
    match crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(SETTING)
        .and_then(serde_json::Value::as_str)
    {
        Some("idle") => Trigger::Idle,
        Some("foreground") => Trigger::Foreground,
        Some("manual") => Trigger::Manual,
        // "auto", anything unrecognised, and absent all mean the same thing.
        // An unreadable preference must never be read as "stop syncing".
        _ => platform_default(),
    }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib trigger`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/trigger.rs apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs apps/desktop/src-tauri/src/commands/sync/mod.rs
git commit -m "Read the sync trigger policy, resolving auto per platform"
```

---

### Task 4: Persist the last successful sync time

`Engine::last_synced` is an in-memory `Instant`: it does not survive a restart, and on Android it is the very clock this story distrusts. `Foreground` needs a wall-clock time that outlives the process.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/trigger.rs`
- Modify: `apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands/sync/round.rs` — in `sync`, next to the existing `engine.maintain(false)` call

**Interfaces:**
- Consumes: `Trigger` from Task 3.
- Produces:
  - `pub fn record_round_trip(app_data_dir: &Path, root: &Path, succeeded: bool)`
  - `pub fn is_stale(app_data_dir: &Path, root: &Path, now_secs: u64) -> bool`
  - `pub(super) fn last_synced_at(app_data_dir: &Path, root: &Path) -> Option<u64>`
  - `pub(super) fn now_epoch_secs() -> u64`
  - Constant `pub const STALE_AFTER_SECS: u64 = 180;`
  - Workspace settings key `sync.lastSyncedAt`, holding seconds since the Unix epoch.

**Why `record_round_trip` takes the outcome rather than being called inside an `if`:** the rule that only success moves the timestamp is the sharpest requirement the spec makes about it, and the spec asks for it as a *unit test*. A bare `mark_synced_now` called inside `if outcome.is_ok()` puts that rule at the call site, where no unit test in `trigger_tests.rs` can reach it — the only writer would be provably correct and the rule provably untested. Passing the outcome moves the rule inside the function, where a test can hold it.

- [ ] **Step 1: Write the failing tests**

```rust
use super::trigger::{
    STALE_AFTER_SECS, is_stale, last_synced_at, now_epoch_secs, record_round_trip,
};

#[test]
fn a_vault_that_has_never_synced_is_stale() {
    let (app_data, root) = a_workspace("never-synced");
    assert!(is_stale(&app_data, &root, 1_000_000));
}

#[test]
fn a_recent_sync_is_not_stale_but_an_old_one_is() {
    let (app_data, root) = a_workspace("recency");
    record_round_trip(&app_data, &root, true);
    let now = now_epoch_secs();

    assert!(!is_stale(&app_data, &root, now + STALE_AFTER_SECS - 1));
    assert!(is_stale(&app_data, &root, now + STALE_AFTER_SECS + 1));
}

/// Wall clock, not a monotonic instant: the whole point is surviving a
/// restart, and a process that has just started has no earlier `Instant` to
/// compare against.
#[test]
fn the_timestamp_survives_being_read_by_a_different_call() {
    let (app_data, root) = a_workspace("persisted");
    record_round_trip(&app_data, &root, true);
    assert!(!is_stale(&app_data, &root, now_epoch_secs()));
}

/// The spec's sharpest requirement about this timestamp: it records success,
/// not attempts. A failed sync that refreshed it would make a vault look fresh
/// at exactly the moment it is not, and the next return to the app would skip
/// the retry that would have fixed it.
#[test]
fn a_failed_round_trip_does_not_refresh_the_timestamp() {
    let (app_data, root) = a_workspace("only-on-success");
    record_round_trip(&app_data, &root, true);
    let after_success = last_synced_at(&app_data, &root);
    assert!(
        after_success.is_some(),
        "a successful round trip recorded nothing"
    );

    record_round_trip(&app_data, &root, false);

    assert_eq!(last_synced_at(&app_data, &root), after_success);
}

/// A vault that has never synced at all must stay that way after a failure,
/// or the first failed sync would look like a first successful one.
#[test]
fn a_failed_first_round_trip_records_nothing_at_all() {
    let (app_data, root) = a_workspace("failed-first");
    record_round_trip(&app_data, &root, false);

    assert_eq!(last_synced_at(&app_data, &root), None);
    assert!(is_stale(&app_data, &root, now_epoch_secs()));
}

/// `record_round_trip` rewrites the whole workspace settings file, so it has
/// to merge rather than replace. Clobbering `sync.destination` would leave the
/// vault pointing nowhere — a sync that breaks syncing.
#[test]
fn recording_a_sync_keeps_the_rest_of_the_workspace_settings() {
    let (app_data, root) = a_workspace("merges");
    let path = crate::commands::settings::workspace_settings_path(&app_data, &root);
    std::fs::create_dir_all(path.parent().expect("a parent")).expect("settings dir");
    std::fs::write(&path, r#"{"sync.destination":"https://example.test/notes.git"}"#)
        .expect("settings written");

    record_round_trip(&app_data, &root, true);

    let contents = crate::commands::settings::read_settings_file(&path)
        .expect("the settings are readable")
        .expect("the settings are present");
    let record = crate::commands::settings::parse_app_settings_record(Some(&contents));
    assert_eq!(
        record
            .get("sync.destination")
            .and_then(serde_json::Value::as_str),
        Some("https://example.test/notes.git"),
        "recording the sync time discarded the destination"
    );
    assert!(record.contains_key("sync.lastSyncedAt"));
}
```

Add `a_workspace(name)` alongside the Task 3 helpers. Model it on `with_setting` in `apps/desktop/src-tauri/src/commands/sync/round_tests.rs:89`, which already returns `(app_data, root)` from two `make_temp_test_dir` calls for exactly this purpose — copy that shape rather than inventing one:

```rust
fn a_workspace(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let app_data = crate::tests::make_temp_test_dir(&format!("{name}-appdata"), "trigger", true);
    let root = crate::tests::make_temp_test_dir(&format!("{name}-vault"), "trigger", true);
    (app_data, root)
}
```

Do **not** write a test-local `now_secs()`. The tests call `now_epoch_secs()`, which Step 3 declares `pub(super)` and Task 6 also consumes. A second function computing the same epoch seconds is duplication a reviewer will rightly reject.

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib trigger`
Expected: FAIL — `record_round_trip` not found.

- [ ] **Step 3: Implement, reusing the settings helpers `round::destination` already uses**

```rust
/// How old a successful sync must be before returning to the app repeats it.
///
/// Long enough that flicking to another app and back does not resync; short
/// enough that coming back after a meeting gets fresh notes. A constant rather
/// than a setting: one less thing to explain, and easy to move if it is wrong.
pub const STALE_AFTER_SECS: u64 = 180;

const LAST_SYNCED: &str = "sync.lastSyncedAt";

pub(super) fn now_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

/// Records the result of a round trip, in wall-clock time.
///
/// Only success moves the timestamp. A failed sync that refreshed it would
/// make a vault look fresh at exactly the moment it is not, and the next
/// return to the app would skip the retry that would have fixed it. The
/// outcome is a parameter rather than an `if` at the call site so that the
/// rule lives here, where a test can hold it.
pub fn record_round_trip(app_data_dir: &Path, root: &Path, succeeded: bool) {
    if !succeeded {
        return;
    }
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = crate::commands::settings::read_settings_file(&path)
        .ok()
        .flatten();
    let mut record = crate::commands::settings::parse_app_settings_record(contents.as_deref());
    record.insert(
        LAST_SYNCED.to_string(),
        serde_json::Value::from(now_epoch_secs()),
    );
    match crate::commands::settings::serialize_app_settings_record(record) {
        Ok(written) => {
            if let Err(error) = crate::commands::atomic_write::write_file_atomically(&path, written)
            {
                eprintln!("[sync] could not record the last sync time: {error:?}");
            }
        }
        Err(error) => eprintln!("[sync] could not serialize the last sync time: {error:?}"),
    }
}

/// When this vault last synced successfully, if it ever has.
pub(super) fn last_synced_at(app_data_dir: &Path, root: &Path) -> Option<u64> {
    let path = crate::commands::settings::workspace_settings_path(app_data_dir, root);
    let contents = crate::commands::settings::read_settings_file(&path).ok()?;
    crate::commands::settings::parse_app_settings_record(contents.as_deref())
        .get(LAST_SYNCED)
        .and_then(serde_json::Value::as_u64)
}

/// Whether a vault's last successful sync is old enough to repeat.
///
/// A vault that has never synced is stale: the first return to the app should
/// fetch, not wait three minutes to decide it is allowed to.
pub fn is_stale(app_data_dir: &Path, root: &Path, now_secs: u64) -> bool {
    match last_synced_at(app_data_dir, root) {
        Some(last) => now_secs.saturating_sub(last) >= STALE_AFTER_SECS,
        None => true,
    }
}
```

Verified signatures, use them as written: `read_settings_file` returns `Result<Option<String>, NativeError>` (`settings.rs:802`), so the `.ok().flatten()` above is correct; `write_file_atomically` returns `io::Result<()>` and lives in `crate::commands::atomic_write` (`atomic_write.rs:13`), **not** in `commands::workspace`; `serialize_app_settings_record` takes a `Map<String, Value>` and returns `Result<String, NativeError>` (`settings.rs:378`); `workspace_settings_path(app_data_dir, canonical_root)` is at `settings.rs:324`.

- [ ] **Step 4: Call it in `round.rs`**

`round::sync` takes `(engine, key, root, destination, profile_id)` and has no app-data path of its own, so read it from the same place `maybe_sync` does.

This is the one call site both paths pass through: the manual `sync_now` command (`round.rs:563`) and the sweeper's `maybe_sync` (`registry.rs:483`) both call `round::sync`, so recording here covers both, and recording anywhere else would miss one.

`round.rs:497-502` currently reads:

```rust
    engine.set_sync_problem(outcome.as_ref().err().cloned());
    if outcome.is_ok() {
        if let Err(error) = engine.maintain(false) {
            eprintln!("[sync] history maintenance after a round trip failed: {error:?}");
        }
    }
    outcome
```

Add the recording call above that block, outside the `if` — `record_round_trip` decides for itself, which is the whole point of it taking the outcome:

```rust
    engine.set_sync_problem(outcome.as_ref().err().cloned());
    if let Some(home) = super::settle::settings_home() {
        super::trigger::record_round_trip(&home, root, outcome.is_ok());
    }
    if outcome.is_ok() {
        if let Err(error) = engine.maintain(false) {
            eprintln!("[sync] history maintenance after a round trip failed: {error:?}");
        }
    }
    outcome
```

This is the only edit to `round.rs` in this plan, and it adds no round-trip logic: it sits after the trip has finished, beside the maintenance bookkeeping that is already there. The Global Constraint on `round.rs` is about the round trip itself — `run_trip` and everything it calls stay untouched.

Note that `settings_home()` is `None` until `remember_settings_home` has been called, so in unit tests this call does nothing. That is why Step 1's tests drive `record_round_trip` directly with a temp directory rather than going through `sync`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/trigger.rs apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs apps/desktop/src-tauri/src/commands/sync/round.rs
git commit -m "Record the last successful sync in wall-clock time"
```

---


### Task 5: `maybe_sync` obeys the policy

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/registry.rs:404-416`
- Test: `apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs`

**Interfaces:**
- Consumes: `Trigger`, `resolved()` from Task 3.
- Produces: `pub(super) fn idle_start_allowed(trigger: Trigger) -> bool` in `trigger.rs`.

- [ ] **Step 1: Write the failing test**

```rust
/// The sweeper's idle rule is one policy among three, not a law. Only `Idle`
/// may start a round trip from a timer; the others wait to be told.
#[test]
fn only_the_idle_policy_starts_a_round_trip_from_a_timer() {
    use super::trigger::{Trigger, idle_start_allowed};

    assert!(idle_start_allowed(Trigger::Idle));
    assert!(!idle_start_allowed(Trigger::Foreground));
    assert!(!idle_start_allowed(Trigger::Manual));
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib idle_start_allowed`
Expected: FAIL — function not found.

- [ ] **Step 3: Implement and wire it in**

In `trigger.rs`:

```rust
/// Whether the sweeper's idle timer may start a round trip under this policy.
pub(super) fn idle_start_allowed(trigger: Trigger) -> bool {
    matches!(trigger, Trigger::Idle)
}
```

In `registry.rs`, as the first lines of `maybe_sync`:

```rust
fn maybe_sync(key: &str, engine: &Arc<Engine>, now: Instant) {
    // Idle time is only evidence under the policy that says so. Under the
    // others this timer is measuring a clock that may have jumped while the
    // process was frozen, which is the whole reason the policy exists.
    if !super::trigger::idle_start_allowed(super::trigger::resolved()) {
        return;
    }
    if !engine.ready_to_sync(IDLE, CAP, now) {
```

- [ ] **Step 4: Run the whole suite**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`
Expected: PASS. Desktop behaviour is unchanged because `auto` resolves to `Idle` there.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/trigger.rs apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs apps/desktop/src-tauri/src/commands/sync/registry.rs
git commit -m "Start an automatic round trip only under a policy that allows it"
```

---

### Task 6: Lifecycle commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/registry.rs` (add the two functions near `start_round`)
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs` (register both commands in the `app_command_handlers!` macro **and** in its `APP_COMMAND_PATHS` test mirror — see Step 5; it is not `lib.rs`)
- Test: `apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs`

**Interfaces:**
- Consumes: `Trigger`, `resolved()`, `is_stale` from Tasks 3–4.
- Produces: Tauri commands `sync_app_foregrounded` and `sync_app_backgrounded`, both taking no arguments and returning `Result<(), NativeError>`.

- [ ] **Step 1: Write the failing test for the decision, not the command**

The command bodies iterate a process-wide registry, which a unit test cannot populate honestly. Test the decision instead, which is where the logic is:

```rust
/// Returning to the app syncs only under `Foreground`, and only when the last
/// successful round trip is old enough to be worth repeating.
#[test]
fn returning_to_the_app_syncs_only_when_the_policy_says_so_and_it_is_stale() {
    use super::trigger::{Trigger, should_sync_on_foreground};

    assert!(should_sync_on_foreground(Trigger::Foreground, true));
    assert!(!should_sync_on_foreground(Trigger::Foreground, false));
    assert!(!should_sync_on_foreground(Trigger::Idle, true));
    assert!(!should_sync_on_foreground(Trigger::Manual, true));
}

/// Backgrounding pushes under `Foreground` only. A desktop user who never
/// touches the setting sees no new behaviour at all from this work.
#[test]
fn leaving_the_app_pushes_only_under_the_foreground_policy() {
    use super::trigger::{Trigger, should_push_on_background};

    assert!(should_push_on_background(Trigger::Foreground));
    assert!(!should_push_on_background(Trigger::Idle));
    assert!(!should_push_on_background(Trigger::Manual));
}
```

- [ ] **Step 2: Run and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib trigger`
Expected: FAIL — functions not found.

- [ ] **Step 3: Implement the decisions in `trigger.rs`**

```rust
/// Whether returning to the app should start a round trip for a vault.
pub fn should_sync_on_foreground(trigger: Trigger, stale: bool) -> bool {
    matches!(trigger, Trigger::Foreground) && stale
}

/// Whether leaving the app should attempt a push.
///
/// Best effort by nature: Android may cut it short, and its outcome is not
/// observable. That is acceptable only because returning to the app syncs
/// again when stale, so nothing depends on this landing.
pub fn should_push_on_background(trigger: Trigger) -> bool {
    matches!(trigger, Trigger::Foreground)
}
```

- [ ] **Step 4: Add the commands in `registry.rs`**

```rust
/// The app came back to the foreground.
///
/// The webview reports the lifecycle event and nothing else: which vaults that
/// affects is answered here, where the registry already holds every open
/// engine keyed by its root.
#[tauri::command]
pub fn sync_app_foregrounded() -> Result<(), NativeError> {
    let trigger = super::trigger::resolved();
    let Some(home) = settle::settings_home() else {
        return Ok(());
    };
    for (key, engine) in open_engines() {
        let root = PathBuf::from(&key);
        if !super::trigger::should_sync_on_foreground(trigger, super::trigger::is_stale(&home, &root, now_epoch_secs())) {
            continue;
        }
        let Some(destination) = round::destination(&home, &root) else {
            continue;
        };
        start_round(&key, &engine, root, destination);
    }
    Ok(())
}

/// The app is going away. Record what is pending, then try to send it.
#[tauri::command]
pub fn sync_app_backgrounded() -> Result<(), NativeError> {
    let trigger = super::trigger::resolved();
    let now = Instant::now();
    let Some(home) = settle::settings_home() else {
        return Ok(());
    };
    for (key, engine) in open_engines() {
        // The local half runs under every policy: recording what is pending is
        // what protects the notes if the process is killed, and it touches no
        // network.
        if let Err(error) = engine.record_settled(now) {
            eprintln!("[sync] could not record changes for {key}: {error:?}");
        }
        if !super::trigger::should_push_on_background(trigger) {
            continue;
        }
        let root = PathBuf::from(&key);
        let Some(destination) = round::destination(&home, &root) else {
            continue;
        };
        start_round(&key, &engine, root, destination);
    }
    Ok(())
}

/// Every open engine with its key, copied out from under the lock.
///
/// The same shape the sweeper uses: recording and syncing must not happen with
/// the registry held, or every window opening a workspace waits behind them.
fn open_engines() -> Vec<(String, Arc<Engine>)> {
    let guard = registry();
    let Some(state) = guard.as_ref() else {
        return Vec::new();
    };
    state
        .engines
        .iter()
        .map(|(key, engine)| (key.clone(), Arc::clone(engine)))
        .collect()
}
```

`now_epoch_secs` is already `pub(super)` from Task 4. `spawn_sweeper` builds
the same vector inline; replace that block with a call to `open_engines` so
there is one copy.

- [ ] **Step 4b: Let the policy gate the sync `attach` already does on open**

**`attach` already starts a round trip when a workspace opens.** `registry.rs:179-183`, at the end of `attach`, reads:

```rust
    // A configured destination is checked when the workspace opens. This is
    // the first useful moment to report a bad link or sign-in, rather than
    // making someone wait for the idle timer or discover a manual button.
    if let Some(destination) = round::destination(app_data_dir, root) {
        start_round(key, &engine, root.to_path_buf(), destination);
    }
```

So the spec's "opening a vault syncs unconditionally under `foreground`" is
already true, on every platform. Do **not** add a second call — that would
fire two round trips on every open, which is the double-sync this task's next
paragraph warns about, arriving from a source the plan had not read.

What is actually missing is the other half of the policy: `manual` promises
"no automatic network at all, in any lifecycle event", and this existing call
breaks that promise. `idle` must keep it, because `idle` is today's desktop
behaviour exactly unchanged, and this call is part of today's behaviour.

So gate the existing block rather than adding to it:

```rust
    // A configured destination is checked when the workspace opens. This is
    // the first useful moment to report a bad link or sign-in, rather than
    // making someone wait for the idle timer or discover a manual button.
    //
    // Opening is deliberate, so it does not consult staleness — `foreground`
    // syncs here every time. `manual` is the one policy that does not: it
    // promises no automatic network in any lifecycle event. `idle` keeps this
    // because this call is part of the desktop behaviour `idle` preserves.
    if !matches!(super::trigger::resolved(), super::trigger::Trigger::Manual) {
        if let Some(destination) = round::destination(app_data_dir, root) {
            start_round(key, &engine, root.to_path_buf(), destination);
        }
    }
```

Then check the interaction with `start_setup_round` (`registry.rs:454`), which
already fires a round trip when a link is first set up. Open a freshly linked
vault under `foreground` and count the round trips in the log. Expected:
**one**. If two, that is a pre-existing overlap between `attach` and
`start_setup_round` rather than something this task introduced — report it as
a concern rather than fixing it here, because narrowing it touches the setup
path, which is outside this plan.

- [ ] **Step 5: Register the commands**

**Not `lib.rs`.** Commands are registered in
`apps/desktop/src-tauri/src/commands/mod.rs`, and in **two** places that a
test holds together.

First, the `app_command_handlers!` macro (`commands/mod.rs:45`), at the end of
the list beside its `sync::` neighbours:

```rust
            $crate::commands::sync::registry::sync_app_foregrounded,
            $crate::commands::sync::registry::sync_app_backgrounded
```

Second, its `#[cfg(test)]` mirror `APP_COMMAND_PATHS` (`commands/mod.rs:116`),
in the same order:

```rust
    "sync::registry::sync_app_foregrounded",
    "sync::registry::sync_app_backgrounded",
```

The mirror's own doc comment says why: `all_registered_commands_match_expected`
fails when the two drift. Update both together — updating only the macro leaves
the suite red, and updating only the mirror registers nothing.

- [ ] **Step 6: Run the suite**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/trigger.rs apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs apps/desktop/src-tauri/src/commands/sync/registry.rs apps/desktop/src-tauri/src/commands/mod.rs
git commit -m "Add foreground and background sync commands"
```

---

### Task 7: The webview reports the lifecycle event

**Files:**
- Create: `apps/desktop/src/sync/syncTriggerAdapter.ts`
- Create: `apps/desktop/src/sync/syncTriggerAdapter.test.ts`
- Modify: `apps/desktop/src/native/commands.ts` (add both commands to `NativeCommandMap`)
- Modify: `apps/desktop/src/App.tsx` (mount the hook)

**Interfaces:**
- Consumes: commands `sync_app_foregrounded`, `sync_app_backgrounded` from Task 6.
- Produces: `export function useSyncTriggerAdapter(): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invokeNativeCommand: invoke
}));

import { reportVisibility } from "./syncTriggerAdapter";

afterEach(() => invoke.mockReset());

describe("syncTriggerAdapter", () => {
  it("tells the native side when the app comes back", async () => {
    invoke.mockResolvedValue(undefined);
    await reportVisibility("visible");
    expect(invoke).toHaveBeenCalledWith("sync_app_foregrounded");
  });

  it("tells the native side when the app goes away", async () => {
    invoke.mockResolvedValue(undefined);
    await reportVisibility("hidden");
    expect(invoke).toHaveBeenCalledWith("sync_app_backgrounded");
  });

  /// A lifecycle event is not a user action; a failure here must never surface
  /// as an error the user has to dismiss.
  it("stays quiet when the native side fails", async () => {
    invoke.mockRejectedValue(new Error("no"));
    await expect(reportVisibility("visible")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter desktop exec vitest run src/sync/syncTriggerAdapter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

```ts
/**
 * Reports app lifecycle to the native side so it can decide whether to sync.
 *
 * Deliberately thin: this file knows *that* the app came back, never *which*
 * vaults that affects. The registry on the native side already holds every
 * open workspace, and putting the decision here would mean policy in two
 * places and would only ever cover whichever vault the current view knew
 * about.
 */
import { invokeNativeCommand } from "../native/commands";
import { useEffect } from "react";

export async function reportVisibility(state: DocumentVisibilityState): Promise<void> {
  try {
    await invokeNativeCommand(
      state === "visible" ? "sync_app_foregrounded" : "sync_app_backgrounded"
    );
  } catch {
    // A lifecycle event is not something the user asked for, so a failure
    // here is not something to interrupt them about. The native side already
    // logs it.
  }
}

/** Mounts the listener for the life of the app. */
export function useSyncTriggerAdapter(): void {
  useEffect(() => {
    const onChange = () => void reportVisibility(document.visibilityState);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
```

- [ ] **Step 4: Add both commands to `NativeCommandMap`**

```ts
  readonly sync_app_foregrounded: { readonly args: undefined; readonly result: null };
  readonly sync_app_backgrounded: { readonly args: undefined; readonly result: null };
```

- [ ] **Step 5: Mount it in `App.tsx`**

```tsx
import { useSyncTriggerAdapter } from "./sync/syncTriggerAdapter";

export default function App() {
  const loadPlatformCapabilities = usePlatformCapabilities((s) => s.load);
  useSyncTriggerAdapter();
```

- [ ] **Step 6: Run the tests and `pnpm qa`**

Run: `pnpm --filter desktop exec vitest run src/sync/syncTriggerAdapter.test.ts` then `pnpm qa`
Expected: PASS, then green.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/sync/syncTriggerAdapter.ts apps/desktop/src/sync/syncTriggerAdapter.test.ts apps/desktop/src/native/commands.ts apps/desktop/src/App.tsx
git commit -m "Report app lifecycle so the native side can decide to sync"
```

---

### Task 8: Prove it on a device, and close the story

**Files:**
- Modify: `plans/mobile/pending-mobile_sync_triggers-high-med.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a story with its acceptance boxes honestly ticked, or an explicit note of what is still unproven.

- [ ] **Step 1: Build, install, and confirm the policy resolves**

```bash
pnpm desktop:tauri android build --debug --apk --target x86_64
adb install -r apps/desktop/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1
adb forward tcp:9222 localabstract:webview_devtools_remote_$(adb shell pidof com.thinkbrain.notes)
```

- [ ] **Step 2: Confirm the commands exist and are reachable**

```bash
python3 tools/android-devtools/wveval.py "window.__TAURI_INTERNALS__.invoke('sync_app_foregrounded').then(() => 'ok', e => 'ERR ' + JSON.stringify(e))"
```

Expected: `ok`.

- [ ] **Step 3: Confirm the stale-clock symptom is gone**

Open a managed vault, background the app with `adb shell input keyevent KEYCODE_HOME`, wait longer than the old 30-second `IDLE`, then foreground it. Watch logcat throughout:

```bash
adb logcat -c && adb shell input keyevent KEYCODE_HOME && adb shell 'sleep 45' \
  && adb shell monkey -p com.thinkbrain.notes -c android.intent.category.LAUNCHER 1 \
  && adb shell 'sleep 8' && adb logcat -d | grep -iE 'Tauri/Console|RustStdoutStderr' | tail -20
```

Expected: at most one round trip, started by the foreground event, and only if the vault was stale. Not a sync fired the instant the process resumed.

- [ ] **Step 4: Confirm desktop is untouched**

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib && pnpm qa
```

Expected: green. `auto` resolves to `Idle` on desktop, so the sweeper behaves exactly as before.

- [ ] **Step 5: Tick the story's acceptance honestly and commit**

Tick only what was observed. Anything not proven gets a sentence saying so, not a tick.

```bash
git add plans/mobile/pending-mobile_sync_triggers-high-med.md
git commit -m "Verify sync triggers on a device and close the story"
```
