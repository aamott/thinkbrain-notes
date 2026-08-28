# Sync Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `sync.trigger` policy enum with one wall-clock schedule — quiet for `quietSeconds`, last attempt older than `intervalSeconds` — exposed as five settings, four of them behind a new registry-wide `advanced` flag.

**Architecture:** The sweeper keeps its 500ms tick and its existing structure. Two things change underneath it: the frequency gate moves from a monotonic `Instant` to wall-clock epoch seconds (so an Android freeze cannot fake elapsed time), and the four hard-coded constants become settings resolved once per tick behind a 5-second cache. The `syncing` flag gains a start stamp and a generation so a trip frozen mid-flight can be taken over without two workers fighting over the flag.

**Tech Stack:** Rust (Tauri v2, `gix`), TypeScript/React (Zustand settings store), Vitest, `cargo test`.

**Spec:** `docs/superpowers/specs/2026-08-28-sync-schedule-design.md`

## Global Constraints

- Settings keys, exactly: `sync.automatically`, `sync.intervalSeconds`, `sync.quietSeconds`, `sync.onOpen`, `sync.onLeave`, `settings.showAdvanced`.
- Defaults, exactly: `automatically` `true`, `intervalSeconds` `60`, `quietSeconds` `30`, `onOpen` `true`, `onLeave` `true`, `showAdvanced` `false`.
- Bounds, exactly: `intervalSeconds` 30–3600, `quietSeconds` 5–300. Rust clamps to the same bounds when reading the file.
- `ORPHAN_AFTER_SECS = 600`. Schedule cache TTL 5 seconds.
- An unreadable, absent, or unparseable setting falls back to its **default**, never to "off". A settings file that cannot be read must never be written on top of.
- Every wall-clock comparison goes through `elapsed_at_least`, which reads a future timestamp as due.
- No `cfg!(target_os = ...)` may remain anywhere under `apps/desktop/src-tauri/src/commands/sync/`.
- Rust defaults are mirrored from TypeScript, not derived. Each side carries a comment naming the other file.
- `pnpm qa` must be green at the end of every task. Run `pnpm format:rust:fix` before `pnpm qa` — the QA Rust step is a format *check*.
- Never run `git checkout`, `git stash`, `git restore`, or `git reset`.

---

### Task 1: An `advanced` flag in the settings registry

**Files:**
- Modify: `packages/core/src/settings/types.ts` (`SettingDefinitionBase`)
- Modify: `packages/core/src/settings/modules/settings.ts`
- Test: `packages/core/src/settings/modules/settings.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `SettingDefinitionBase.advanced?: boolean`; the setting `settings.showAdvanced` (boolean, default `false`).

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/settings/modules/settings.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { createSettingsRegistry } from "../registry";
import { settingsModule } from "./settings";

describe("settings module", () => {
  it("offers a Show advanced settings toggle that starts off", () => {
    const registry = createSettingsRegistry();
    registry.register(settingsModule);
    const definition = registry.getDefinition("settings.showAdvanced");

    expect(definition?.type).toBe("boolean");
    expect(definition?.default).toBe(false);
  });

  it("does not hide the toggle behind itself", () => {
    const registry = createSettingsRegistry();
    registry.register(settingsModule);

    expect(registry.getDefinition("settings.showAdvanced")?.advanced).toBeUndefined();
  });

  it("keeps `advanced` on a definition through registration", () => {
    const registry = createSettingsRegistry();
    registry.register({
      id: "probe",
      label: "Probe",
      scope: "app",
      sections: [
        {
          id: "probe.general",
          label: "Probe",
          settings: [
            {
              key: "deep",
              type: "boolean",
              default: false,
              scope: "app",
              section: "probe.general",
              label: "Deep",
              description: "A setting most people never need.",
              advanced: true
            }
          ]
        }
      ]
    });

    expect(registry.getDefinition("probe.deep")?.advanced).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @thinkbrain/core test -- settings.test.ts`
Expected: FAIL — `settings.showAdvanced` is undefined, and `advanced` is not a known property.

- [ ] **Step 3: Add the flag to the type**

In `packages/core/src/settings/types.ts`, inside `SettingDefinitionBase`, immediately after the `portable` field:

```typescript
  /**
   * Hides the row behind the settings screen's "Show advanced settings"
   * toggle. Advanced means "most people never need this", not "dangerous" or
   * "unsupported": the setting validates, exports and imports like any other,
   * and the UI reveals it anyway when a search lands on it or when its value
   * is no longer the default.
   */
  readonly advanced?: boolean;
```

- [ ] **Step 4: Add the toggle setting**

In `packages/core/src/settings/modules/settings.ts`, add a second entry to `settings.general`'s `settings` array, after `autosave`:

```typescript
        {
          key: "showAdvanced",
          type: "boolean",
          default: false,
          scope: "app",
          section: "settings.general",
          label: "Show advanced settings",
          description:
            "Show every setting, including the ones most people never need to change. Advanced settings you have already changed stay visible whether this is on or off."
        }
```

Extend the module's doc comment to mention that it now also holds the advanced-settings toggle.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @thinkbrain/core test -- settings.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/settings/types.ts packages/core/src/settings/modules/settings.ts packages/core/src/settings/modules/settings.test.ts
git commit -m "Let a setting declare itself advanced"
```

---

### Task 2: The settings screen honours `advanced`

**Files:**
- Modify: `apps/desktop/src/settings/SettingsContent.tsx`
- Modify: `apps/desktop/src/settings/SettingsHeaderBar.tsx`
- Test: `apps/desktop/src/settings/SettingsContent.test.tsx`

**Interfaces:**
- Consumes: `SettingDefinition.advanced` and `settings.showAdvanced` from Task 1.
- Produces: nothing other code calls. The reveal rules are internal to `SettingsContent`.

**Context an implementer will not guess:** `SettingsContent.tsx:185` already filters rows through `HIDDEN_SETTING_ROWS`; the advanced filter belongs on the same chain. `highlightKey` is already threaded into `SettingsSection` as a prop (`:170`, `:251`) and is set by `subscribeSettingHighlight` (`:300`). That highlight **auto-clears after 1200ms** (`settingHighlight.ts`), so reveal must be latched separately or the row vanishes while being read. `resolveEffectiveValue` in `settingsHelpers.ts` is a pure function taking `(key, stagedChanges, appValues, workspaceValues, definition)`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/desktop/src/settings/SettingsContent.test.tsx`, following the existing render helpers in that file:

```typescript
  it("hides advanced rows until the toggle is on", async () => {
    // Register a module with one plain and one advanced setting, render, and
    // assert only the plain row is present; then set settings.showAdvanced
    // true and assert both are.
  });

  it("keeps showing an advanced row whose value is not the default", async () => {
    // Stage a non-default value for the advanced key with showAdvanced off.
  });

  it("keeps an advanced row visible after its search highlight clears", async () => {
    // requestSettingHighlight(advancedKey), advance timers past
    // HIGHLIGHT_DURATION_MS, assert the row is still rendered.
  });
```

Write these out fully against the file's existing helpers — the third is the one that catches the latching bug, so it must advance fake timers past 1200ms rather than assert immediately.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @thinkbrain/desktop test -- SettingsContent`
Expected: FAIL — advanced rows render unconditionally today.

- [ ] **Step 3: Latch revealed keys and filter**

In `SettingsContent`, beside the existing `highlightKey` state:

```typescript
  // A highlight clears itself after ~1200ms. Reveal must not: a row that
  // appears when search lands on it and then disappears mid-read is worse
  // than one that never appeared, so revealed keys are latched for the life
  // of this settings view.
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(
    () =>
      subscribeSettingHighlight((key) => {
        setHighlightKey(key);
        if (key !== null) setRevealedKeys((current) => new Set(current).add(key));
      }),
    []
  );
```

Replace the existing `useEffect(() => subscribeSettingHighlight(setHighlightKey), []);` with the above.

Pass `revealedKeys` and `showAdvanced` down to `SettingsSection`, and extend its filter at `:185`:

```typescript
  const definitions = allDefinitions
    .filter((d) => !HIDDEN_SETTING_ROWS.has(d.key))
    .filter(
      (d) =>
        !d.advanced ||
        showAdvanced ||
        revealedKeys.has(d.key) ||
        isChanged(d, stagedChanges, appValues, workspaceValues)
    );
```

with, in the same file:

```typescript
/**
 * Whether a setting holds anything other than its declared default.
 *
 * An advanced row the user has actually changed stays visible: hiding it
 * would leave them with a behaviour they chose and no way to find where they
 * chose it.
 */
function isChanged(
  definition: SettingDefinition,
  stagedChanges: Record<string, unknown>,
  appValues: Record<string, unknown>,
  workspaceValues: Record<string, unknown> | null
): boolean {
  const effective = resolveEffectiveValue(
    definition.key,
    stagedChanges,
    appValues,
    workspaceValues,
    definition
  );
  return effective !== definition.default;
}
```

`SettingsSection` already selects `stagedChanges`; it must also select `appValues` and `workspaceValues` from the store to feed `isChanged`. Read `showAdvanced` in the `SettingsContent` component with the existing `useEffectiveValue("settings.showAdvanced") === true` and pass it down, so the list re-renders when the toggle is staged rather than only after a save.

- [ ] **Step 4: Add the header toggle**

In `SettingsHeaderBar.tsx`, in the `role="toolbar"` div, before the Export button, add a labelled checkbox that stages `settings.showAdvanced`. Use `useEffectiveValue("settings.showAdvanced")` for the current value and `useSettingsStore((s) => s.stageChange)` to set it, matching how the autosave indicator already reads its value in this file. Give it `aria-label="Show advanced settings"` so the tests can find it.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @thinkbrain/desktop test -- SettingsContent SettingsHeaderBar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/settings/
git commit -m "Hide advanced settings without hiding them from search"
```

---

### Task 3: Five schedule settings replace the trigger enum

**Files:**
- Modify: `packages/core/src/settings/modules/sync.ts`
- Test: `packages/core/src/settings/modules/sync.test.ts:105-113`

**Interfaces:**
- Consumes: `advanced` from Task 1.
- Produces: exported `DEFAULT_SYNC_AUTOMATICALLY`, `DEFAULT_SYNC_INTERVAL_SECONDS`, `DEFAULT_SYNC_QUIET_SECONDS`, `DEFAULT_SYNC_ON_OPEN`, `DEFAULT_SYNC_ON_LEAVE`, and the bounds `SYNC_INTERVAL_SECONDS_MIN/MAX`, `SYNC_QUIET_SECONDS_MIN/MAX`. Task 4 mirrors every one of these as a Rust constant.

- [ ] **Step 1: Replace the trigger test**

In `packages/core/src/settings/modules/sync.test.ts`, delete the `offers a sync trigger policy that defaults to auto` test and put in its place:

```typescript
  it("schedules sync with a plain toggle and an interval", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);

    expect(registry.getDefinition("sync.trigger")).toBeUndefined();
    expect(registry.getDefinition("sync.automatically")?.default).toBe(true);
    expect(registry.getDefinition("sync.intervalSeconds")?.default).toBe(60);
    expect(registry.getDefinition("sync.quietSeconds")?.default).toBe(30);
    expect(registry.getDefinition("sync.onOpen")?.default).toBe(true);
    expect(registry.getDefinition("sync.onLeave")?.default).toBe(true);
  });

  it("keeps the everyday toggle out of advanced and the knobs in it", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);

    expect(registry.getDefinition("sync.automatically")?.advanced).toBeUndefined();
    for (const key of ["sync.intervalSeconds", "sync.quietSeconds", "sync.onOpen", "sync.onLeave"]) {
      expect(registry.getDefinition(key)?.advanced).toBe(true);
    }
  });

  it("refuses an interval fast enough to get someone rate-limited", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);

    expect(validateSettings(registry, { "sync.intervalSeconds": 60 })).toEqual([]);
    expect(validateSettings(registry, { "sync.intervalSeconds": 5 })).not.toEqual([]);
    expect(validateSettings(registry, { "sync.intervalSeconds": 86400 })).not.toEqual([]);
    expect(validateSettings(registry, { "sync.quietSeconds": 1 })).not.toEqual([]);
  });

  it("says that turning sync off does not stop saving local history", () => {
    const registry = createSettingsRegistry();
    registry.register(syncModule);

    expect(registry.getDefinition("sync.automatically")?.description).toMatch(
      /saved versions|version history|kept on this device/i
    );
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @thinkbrain/core test -- sync.test.ts`
Expected: FAIL — the new keys do not exist.

- [ ] **Step 3: Replace the setting**

In `packages/core/src/settings/modules/sync.ts`, delete `DEFAULT_SYNC_TRIGGER` and its doc comment, and add:

```typescript
/**
 * Defaults for the sync schedule. Mirrored on the native side as the
 * `DEFAULT_*` constants in
 * `apps/desktop/src-tauri/src/commands/sync/schedule.rs`, because native
 * answers these questions before any window is listening. Changing one means
 * changing the other.
 */
export const DEFAULT_SYNC_AUTOMATICALLY = true;
export const DEFAULT_SYNC_INTERVAL_SECONDS = 60;
export const DEFAULT_SYNC_QUIET_SECONDS = 30;
export const DEFAULT_SYNC_ON_OPEN = true;
export const DEFAULT_SYNC_ON_LEAVE = true;

/**
 * Bounds on the two intervals, mirrored in `schedule.rs` as `MIN_*`/`MAX_*`.
 *
 * The floor is not arbitrary. Each round trip is a git fetch *and* a push, so
 * thirty seconds is already a hundred and twenty fetches an hour against
 * someone's host. The ceiling is where "sync automatically" stops meaning
 * anything; past it, turning it off is the honest choice.
 */
export const SYNC_INTERVAL_SECONDS_MIN = 30;
export const SYNC_INTERVAL_SECONDS_MAX = 3600;
export const SYNC_QUIET_SECONDS_MIN = 5;
export const SYNC_QUIET_SECONDS_MAX = 300;
```

Replace the whole `sync.when` section's `settings` array with:

```typescript
        {
          key: "automatically",
          type: "boolean",
          default: DEFAULT_SYNC_AUTOMATICALLY,
          scope: "app",
          section: "sync.when",
          label: "Sync automatically",
          description:
            "Send and fetch changes on their own once you stop typing. Turn this off and nothing goes to your git link until you press Sync now — your notes and their saved versions are still kept on this device exactly as before."
        },
        {
          key: "intervalSeconds",
          type: "number",
          default: DEFAULT_SYNC_INTERVAL_SECONDS,
          min: SYNC_INTERVAL_SECONDS_MIN,
          max: SYNC_INTERVAL_SECONDS_MAX,
          scope: "app",
          section: "sync.when",
          label: "How often to sync (seconds)",
          advanced: true,
          description:
            "The shortest gap between two automatic syncs. Also how long after a sync this device waits before syncing again when you open a folder."
        },
        {
          key: "quietSeconds",
          type: "number",
          default: DEFAULT_SYNC_QUIET_SECONDS,
          min: SYNC_QUIET_SECONDS_MIN,
          max: SYNC_QUIET_SECONDS_MAX,
          scope: "app",
          section: "sync.when",
          label: "Wait after you stop typing (seconds)",
          advanced: true,
          description:
            "How still a folder has to be before an automatic sync starts, so a sync never lands in the middle of a sentence."
        },
        {
          key: "onOpen",
          type: "boolean",
          default: DEFAULT_SYNC_ON_OPEN,
          scope: "app",
          section: "sync.when",
          label: "Sync when you open a folder",
          advanced: true,
          description:
            "Fetch as soon as a folder opens, unless it already synced within the interval above. This is also where a broken git link or sign-in first shows itself."
        },
        {
          key: "onLeave",
          type: "boolean",
          default: DEFAULT_SYNC_ON_LEAVE,
          scope: "app",
          section: "sync.when",
          label: "Send changes when you leave the app",
          advanced: true,
          description:
            "On a phone, push what you wrote as the app goes into the background, before the system freezes it. On a computer this happens when the window is minimised, and rarely matters: automatic syncing keeps running while the app is open."
        }
```

Update the section `label` from "When to sync" to "When to sync" (unchanged) and the module doc comment to drop any mention of a policy.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm --filter @thinkbrain/core test -- sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/settings/modules/sync.ts packages/core/src/settings/modules/sync.test.ts
git commit -m "Replace the sync policy enum with a toggle and an interval"
```

---

### Task 4: `schedule.rs` — reading the schedule

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/sync/schedule.rs`
- Create: `apps/desktop/src-tauri/src/commands/sync/schedule_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands/sync/mod.rs` (declare `schedule`)
- Modify: `apps/desktop/src-tauri/src/commands/sync/trigger.rs` (delete the three moved functions, call them through `super::schedule::`)
- Modify: `apps/desktop/src-tauri/src/commands/sync/round.rs:499` (call site of `record_round_trip`)
- Modify: `apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs` (move the timestamp tests out)

**Interfaces:**
- Consumes: the exact keys, defaults and bounds from Task 3.
- Produces, all `pub` unless noted:
  - `struct Schedule { automatically: bool, interval_secs: u64, quiet_secs: u64, on_open: bool, on_leave: bool }`, `Copy + Clone + Debug + PartialEq + Eq`, with `Default` and `fn quiet(&self) -> Duration`
  - `fn resolved() -> Schedule` (cached 5s), `fn resolved_in(app_data_dir: Option<&Path>) -> Schedule` (uncached), `fn forget_cached()`
  - `fn elapsed_at_least(last_secs: u64, now_secs: u64, threshold_secs: u64) -> bool`
  - `fn now_epoch_secs() -> u64`, `fn record_round_trip(app_data_dir: &Path, root: &Path, succeeded: bool)`, `fn last_synced_at(app_data_dir: &Path, root: &Path) -> Option<u64>` — moved verbatim from `trigger.rs`, visibility widened to `pub`
  - `fn should_sync_on_open(schedule: Schedule, last_synced: Option<u64>, now_secs: u64) -> bool`
  - `fn should_flush_on_leave(schedule: Schedule) -> bool`
  - `const ORPHAN_AFTER_SECS: u64 = 600`

`trigger.rs` and its `Trigger` enum stay alive and untouched this task so the crate keeps compiling; Task 8 deletes them.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src-tauri/src/commands/sync/schedule_tests.rs`. Move `a_vault_that_has_never_synced_is_stale`, `a_recent_sync_is_not_stale_but_an_old_one_is`, `the_timestamp_survives_being_read_by_a_different_call`, `a_failed_round_trip_does_not_refresh_the_timestamp`, `a_failed_first_round_trip_records_nothing_at_all`, `recording_a_sync_keeps_the_rest_of_the_workspace_settings`, and `a_settings_file_that_cannot_be_read_is_left_untouched` across from `trigger_tests.rs` verbatim, rewriting the staleness ones against `should_sync_on_open`. Then add:

```rust
#[test]
fn an_absent_settings_file_gives_the_declared_defaults() {
    let schedule = super::resolved_in(None);
    assert_eq!(schedule, super::Schedule::default());
    assert!(schedule.automatically);
    assert_eq!(schedule.interval_secs, 60);
    assert_eq!(schedule.quiet_secs, 30);
}

#[test]
fn an_unreadable_setting_never_reads_as_stop_syncing() {
    let home = home_with(r#"{ "sync.automatically": "yes please" }"#);
    assert!(super::resolved_in(Some(&home)).automatically);
}

#[test]
fn an_interval_from_outside_the_bounds_is_clamped() {
    let fast = home_with(r#"{ "sync.intervalSeconds": 0 }"#);
    assert_eq!(super::resolved_in(Some(&fast)).interval_secs, super::MIN_INTERVAL_SECS);

    let slow = home_with(r#"{ "sync.intervalSeconds": 999999 }"#);
    assert_eq!(super::resolved_in(Some(&slow)).interval_secs, super::MAX_INTERVAL_SECS);
}

#[test]
fn a_timestamp_from_the_future_reads_as_due_not_fresh() {
    // saturating_sub would floor this to zero and call the vault fresh for
    // ever. A clock that moved backwards is not evidence of freshness.
    assert!(super::elapsed_at_least(9_000, 1_000, 60));
}

#[test]
fn opening_a_folder_syncs_only_when_the_interval_has_passed() {
    let schedule = super::Schedule::default();
    assert!(super::should_sync_on_open(schedule, None, 10_000));
    assert!(super::should_sync_on_open(schedule, Some(1_000), 10_000));
    assert!(!super::should_sync_on_open(schedule, Some(9_990), 10_000));
}

#[test]
fn nothing_automatic_happens_with_the_toggle_off() {
    let off = super::Schedule { automatically: false, ..super::Schedule::default() };
    assert!(!super::should_sync_on_open(off, None, 10_000));
    assert!(!super::should_flush_on_leave(off));
}

#[test]
fn leaving_can_be_turned_off_on_its_own() {
    let schedule = super::Schedule { on_leave: false, ..super::Schedule::default() };
    assert!(!super::should_flush_on_leave(schedule));
    assert!(super::should_sync_on_open(schedule, None, 10_000));
}
```

Write `home_with` in the new file the way `trigger_tests.rs:30` writes it — a temp dir holding an app settings file with the given JSON body.

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml schedule`
Expected: FAIL to compile — no `schedule` module.

- [ ] **Step 3: Write the module**

Create `apps/desktop/src-tauri/src/commands/sync/schedule.rs`:

```rust
//! When an automatic round trip is allowed to start.
//!
//! One rule: a vault syncs once it has been quiet for `quiet_secs` and its
//! last attempted round trip is older than `interval_secs`. Both numbers come
//! from settings; the second is measured on a wall clock.
//!
//! The wall clock is the point. Android freezes a process rather than stopping
//! its monotonic clock, so `Instant` arithmetic across a freeze measures time
//! that passed for the world and not for the app — which is how a vault that
//! synced moments before going into a pocket came out looking an hour stale.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::error::lock_or_recover;

/// Composed settings keys: module `sync`, declared in
/// `packages/core/src/settings/modules/sync.ts`. Spelled out here rather than
/// derived because this side answers the question before any window is
/// listening. Changing a key there means changing it here.
const AUTOMATICALLY: &str = "sync.automatically";
const INTERVAL_SECONDS: &str = "sync.intervalSeconds";
const QUIET_SECONDS: &str = "sync.quietSeconds";
const ON_OPEN: &str = "sync.onOpen";
const ON_LEAVE: &str = "sync.onLeave";

/// Mirrored from the `DEFAULT_SYNC_*` exports in that same module.
pub const DEFAULT_AUTOMATICALLY: bool = true;
pub const DEFAULT_INTERVAL_SECS: u64 = 60;
pub const DEFAULT_QUIET_SECS: u64 = 30;
pub const DEFAULT_ON_OPEN: bool = true;
pub const DEFAULT_ON_LEAVE: bool = true;

/// Mirrored from the `SYNC_*_MIN`/`_MAX` exports in that same module.
///
/// Enforced again here because the settings screen is not the only way a value
/// reaches the file: it can be hand-edited, and an interval of zero read
/// literally is a git fetch on every tick.
pub const MIN_INTERVAL_SECS: u64 = 30;
pub const MAX_INTERVAL_SECS: u64 = 3600;
pub const MIN_QUIET_SECS: u64 = 5;
pub const MAX_QUIET_SECS: u64 = 300;

/// How long a round trip may hold the sync claim before a later one may take
/// it over.
///
/// Generous on purpose. `round::sync` takes the workspace lane before it
/// touches the claim, so a trip that takes over does not run alongside the one
/// it replaced — it waits behind it. The bound only has to exceed a plausible
/// sync, not every conceivable one.
pub const ORPHAN_AFTER_SECS: u64 = 600;

/// What the user has asked for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Schedule {
    pub automatically: bool,
    pub interval_secs: u64,
    pub quiet_secs: u64,
    pub on_open: bool,
    pub on_leave: bool,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            automatically: DEFAULT_AUTOMATICALLY,
            interval_secs: DEFAULT_INTERVAL_SECS,
            quiet_secs: DEFAULT_QUIET_SECS,
            on_open: DEFAULT_ON_OPEN,
            on_leave: DEFAULT_ON_LEAVE,
        }
    }
}

impl Schedule {
    /// The quiet window, for the monotonic side of the gate.
    pub fn quiet(&self) -> Duration {
        Duration::from_secs(self.quiet_secs)
    }
}

/// Whether at least `threshold_secs` have passed, on a clock worth believing.
///
/// A timestamp in the future is not evidence of freshness; it is evidence the
/// clock is untrustworthy, and the safe reading of an untrustworthy clock is
/// "do the work". A `saturating_sub` here would floor to zero and leave a
/// vault permanently fresh after any backwards jump.
pub fn elapsed_at_least(last_secs: u64, now_secs: u64, threshold_secs: u64) -> bool {
    if now_secs < last_secs {
        return true;
    }
    now_secs - last_secs >= threshold_secs
}

/// How long a resolved schedule is trusted before the file is read again.
///
/// The sweeper asks every tick. Five seconds keeps that to one read per five
/// seconds however many vaults are open, and is short enough that changing a
/// setting takes effect while the user is still looking at the screen.
const CACHE_FOR: Duration = Duration::from_secs(5);

static CACHE: Mutex<Option<(Instant, Schedule)>> = Mutex::new(None);

/// The schedule in force, from the app settings file.
pub fn resolved() -> Schedule {
    let mut cache = lock_or_recover(&CACHE);
    if let Some((read_at, schedule)) = *cache {
        // A freeze inflates this elapsed time and expires the cache early,
        // which is the harmless direction: a re-read, not a stale answer.
        if read_at.elapsed() < CACHE_FOR {
            return schedule;
        }
    }
    let schedule = resolved_in(super::settle::settings_home().as_deref());
    *cache = Some((Instant::now(), schedule));
    schedule
}

/// Drops the cached schedule, so the next `resolved` reads the file.
pub fn forget_cached() {
    *lock_or_recover(&CACHE) = None;
}

/// The same, told where to look and never cached, so a test can hold a real
/// file rather than a location the whole process shares. `None` also occurs in
/// production, before `remember_settings_home` has been called.
pub fn resolved_in(app_data_dir: Option<&Path>) -> Schedule {
    let Some(app_data_dir) = app_data_dir else {
        return Schedule::default();
    };
    let path = crate::commands::settings::app_settings_path(app_data_dir);
    let Ok(contents) = crate::commands::settings::read_settings_file(&path) else {
        return Schedule::default();
    };
    let record = crate::commands::settings::parse_app_settings_record(contents.as_deref());
    // Absent, mistyped and unparseable all land on the declared default. An
    // unreadable preference must never be read as "stop syncing".
    let flag = |key: &str, fallback: bool| {
        record
            .get(key)
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(fallback)
    };
    let secs = |key: &str, fallback: u64, min: u64, max: u64| {
        record
            .get(key)
            .and_then(serde_json::Value::as_u64)
            .map_or(fallback, |value| value.clamp(min, max))
    };
    Schedule {
        automatically: flag(AUTOMATICALLY, DEFAULT_AUTOMATICALLY),
        interval_secs: secs(
            INTERVAL_SECONDS,
            DEFAULT_INTERVAL_SECS,
            MIN_INTERVAL_SECS,
            MAX_INTERVAL_SECS,
        ),
        quiet_secs: secs(
            QUIET_SECONDS,
            DEFAULT_QUIET_SECS,
            MIN_QUIET_SECS,
            MAX_QUIET_SECS,
        ),
        on_open: flag(ON_OPEN, DEFAULT_ON_OPEN),
        on_leave: flag(ON_LEAVE, DEFAULT_ON_LEAVE),
    }
}

/// Whether opening a workspace should start a round trip.
///
/// Gated on the interval rather than unconditional, because "open" is not
/// always a deliberate act: on Android it is also what happens every time the
/// system killed the app while it sat in a pocket. A vault that has never
/// synced is always due — the first open should fetch, not wait a minute to
/// decide it is allowed to.
pub fn should_sync_on_open(schedule: Schedule, last_synced: Option<u64>, now_secs: u64) -> bool {
    if !schedule.automatically || !schedule.on_open {
        return false;
    }
    match last_synced {
        None => true,
        Some(last) => elapsed_at_least(last, now_secs, schedule.interval_secs),
    }
}

/// Whether leaving the app should record what is pending and push it.
///
/// Best effort by nature: Android may cut the push short, and its outcome is
/// not observable. Acceptable because the interval brings the next attempt
/// round on its own, so nothing depends on this landing.
pub fn should_flush_on_leave(schedule: Schedule) -> bool {
    schedule.automatically && schedule.on_leave
}
```

Then move `now_epoch_secs`, `record_round_trip` and `last_synced_at` into this file **verbatim** from `trigger.rs`, changing only their visibility to `pub` and keeping every doc comment. Add at the bottom:

```rust
#[cfg(test)]
#[path = "schedule_tests.rs"]
mod tests;
```

- [ ] **Step 4: Rewire the two callers**

In `mod.rs`, declare `mod schedule;` beside `mod trigger;`. In `trigger.rs`, delete the three moved functions and have `is_stale` call `super::schedule::last_synced_at`; have the `STALE_AFTER_SECS` comparison keep using `saturating_sub` for now (Task 8 deletes it). In `round.rs:499`, call `super::schedule::record_round_trip`.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm format:rust:fix
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sync::
```
Expected: PASS, including every test that moved.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/
git commit -m "Read the sync schedule from settings, on a clock that does not lie"
```

---

### Task 5: The frequency gate moves to a wall clock

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/engine.rs:162,181,556-577`
- Modify: `apps/desktop/src-tauri/src/commands/sync/round.rs:442`
- Modify: `apps/desktop/src-tauri/src/commands/sync/registry.rs:404-405`
- Test: `apps/desktop/src-tauri/src/commands/sync/engine_tests.rs`

**Interfaces:**
- Consumes: `schedule::elapsed_at_least`, `schedule::now_epoch_secs` from Task 4.
- Produces: `Engine::mark_attempt(&self, now_secs: u64)` and
  `Engine::ready_to_sync(&self, quiet: Duration, interval_secs: u64, now: Instant, now_secs: u64) -> bool`.
  `Engine::mark_synced` is gone. Task 8 is the only other caller.

- [ ] **Step 1: Write the failing tests**

In `engine_tests.rs`, rewrite the existing `ready_to_sync` tests against the new signature and add:

```rust
#[test]
fn a_frozen_process_does_not_manufacture_an_elapsed_interval() {
    // The monotonic clock jumps an hour while the wall clock says four
    // seconds passed — the shape of a freeze on a device whose clock the app
    // cannot trust. The interval must believe the wall clock.
    let f = fixture("frozen-interval");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("a.md")], start);
    f.engine.mark_attempt(1_000);

    let long_after = start + Duration::from_secs(3_600);
    assert!(!f.engine.ready_to_sync(Duration::from_secs(30), 60, long_after, 1_004));
    assert!(f.engine.ready_to_sync(Duration::from_secs(30), 60, long_after, 1_070));
}

#[test]
fn a_vault_that_has_never_been_attempted_is_due_once_it_is_quiet() {
    let f = fixture("never-attempted");
    let start = Instant::now();
    f.engine.note_changes([PathBuf::from("a.md")], start);

    assert!(!f.engine.ready_to_sync(Duration::from_secs(30), 60, start, 1_000));
    assert!(f.engine.ready_to_sync(
        Duration::from_secs(30),
        60,
        start + Duration::from_secs(31),
        1_031
    ));
}
```

`engine_tests.rs` builds engines with `fixture(name) -> Fixture` (`:10`), whose `.engine` field is the `Engine`; every test in that file uses it and these must too. The existing `a_vault_is_ready_to_sync_only_once_it_has_been_still_and_the_cap_has_passed` (`:386`) is the one to rewrite against the new signature — it calls `mark_synced`, which is gone.

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml engine`
Expected: FAIL to compile — `mark_attempt` does not exist.

- [ ] **Step 3: Change the field and the two methods**

In `engine.rs`, replace the `last_synced` field with:

```rust
    /// When a round trip was last *started*, in seconds since the epoch.
    ///
    /// Wall clock, not `Instant`: Android freezes the process and a monotonic
    /// clock keeps counting through the freeze, so a vault that synced moments
    /// before going into a pocket looked an hour unsynced when it came out.
    ///
    /// Attempts, not successes. A vault with a bad link or a missing sign-in
    /// never succeeds, and a gate driven by successes would let the sweeper
    /// retry it on every tick.
    last_attempt: Mutex<Option<u64>>,
```

initialise it `Mutex::new(None)`, and replace `mark_synced`/`ready_to_sync` with:

```rust
    /// Marks a round trip as started, for the frequency gate.
    pub fn mark_attempt(&self, now_secs: u64) {
        *lock_or_recover(&self.last_attempt) = Some(now_secs);
    }

    /// Whether this vault has been still long enough, and it has been long
    /// enough since the last round trip, to sync without a click.
    ///
    /// Two clocks on purpose. Quiet is monotonic: it only ever measures
    /// seconds between local edits inside one run, where a user changing their
    /// clock must not count as typing. The interval is wall-clock, so a freeze
    /// cannot fake it.
    pub fn ready_to_sync(
        &self,
        quiet: Duration,
        interval_secs: u64,
        now: Instant,
        now_secs: u64,
    ) -> bool {
        if self.syncing() {
            return false;
        }
        let touched = *lock_or_recover(&self.last_touched);
        if now.saturating_duration_since(touched) < quiet {
            return false;
        }
        match *lock_or_recover(&self.last_attempt) {
            None => true,
            Some(last) => super::schedule::elapsed_at_least(last, now_secs, interval_secs),
        }
    }
```

- [ ] **Step 4: Update the two call sites**

`round.rs:442`: `engine.mark_attempt(super::schedule::now_epoch_secs());`, keeping the existing "Count an attempted round" comment.

`registry.rs:405`: `if !engine.ready_to_sync(IDLE, CAP.as_secs(), now, super::schedule::now_epoch_secs())`. This is temporary — Task 8 replaces both constants with settings.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm format:rust:fix
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sync::
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/
git commit -m "Measure the sync interval on a clock a freeze cannot fake"
```

---

### Task 6: A sync claim that can be taken over

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/engine.rs` (fields, `set_syncing` → three methods)
- Modify: `apps/desktop/src-tauri/src/commands/sync/round.rs:430-437` (`Clear`), and `report_phase`
- Modify: `apps/desktop/src-tauri/src/commands/sync/registry.rs:551,576`
- Test: `apps/desktop/src-tauri/src/commands/sync/engine_tests.rs`, `status_tests.rs:66,97,100`

**Interfaces:**
- Consumes: `schedule::elapsed_at_least`, `schedule::ORPHAN_AFTER_SECS`, `schedule::now_epoch_secs`.
- Produces: `Engine::begin_sync(&self, now_secs: u64) -> u64`,
  `Engine::claim_sync(&self, now_secs: u64, orphan_after: u64) -> Option<u64>`,
  `Engine::end_sync(&self, generation: u64) -> bool`,
  `Engine::note_sync_progress(&self, now_secs: u64)`.
  `Engine::set_syncing` is deleted; `Engine::syncing()` is unchanged.

- [ ] **Step 1: Write the failing tests**

In `engine_tests.rs`:

```rust
#[test]
fn a_fresh_claim_cannot_be_taken_over() {
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    assert!(f.engine.claim_sync(1_060, 600).is_none());
}

#[test]
fn a_claim_left_by_a_frozen_process_can_be_taken_over() {
    // A freeze pauses the worker mid-flight, so the `Drop` guard that clears
    // the flag never runs. Without a takeover, one frozen trip stops every
    // later one for the life of the process.
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    assert!(f.engine.claim_sync(1_601, 600).is_some());
}

#[test]
fn a_superseded_trip_does_not_clear_the_flag_under_the_one_that_replaced_it() {
    let f = fixture("sync-claim");
    let first = f.engine.claim_sync(1_000, 600).expect("the first trip claims");
    let second = f.engine.claim_sync(1_601, 600).expect("the frozen claim is taken over");

    assert!(!f.engine.end_sync(first));
    assert!(f.engine.syncing());
    assert!(f.engine.end_sync(second));
    assert!(!f.engine.syncing());
}

#[test]
fn a_trip_that_is_still_reporting_progress_is_not_orphaned() {
    let f = fixture("sync-claim");
    assert!(f.engine.claim_sync(1_000, 600).is_some());
    f.engine.note_sync_progress(1_500);
    assert!(f.engine.claim_sync(1_601, 600).is_none());
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml engine`
Expected: FAIL to compile.

- [ ] **Step 3: Replace the flag's write path**

In `engine.rs`, keep `syncing: AtomicBool` (cheap reads on the tick path) and add beside it:

```rust
    /// The round trip in flight: its generation, and when it started or last
    /// reported progress, in seconds since the epoch.
    sync_claim: Mutex<Option<(u64, u64)>>,
    /// Hands out generations. A taken-over trip keeps its old one, so the
    /// guard it holds can tell that it no longer owns the flag.
    next_generation: AtomicU64,
```

initialise them `Mutex::new(None)` and `AtomicU64::new(0)`, add `use std::sync::atomic::AtomicU64;`, and replace `set_syncing` with:

```rust
    /// Takes the claim, unconditionally. The caller holds the workspace lane,
    /// so it already knows it is the only trip running.
    pub fn begin_sync(&self, now_secs: u64) -> u64 {
        let mut claim = lock_or_recover(&self.sync_claim);
        self.take_claim(&mut claim, now_secs)
    }

    /// Takes the claim if it is free, or if the trip holding it has neither
    /// finished nor reported progress for `orphan_after` seconds.
    ///
    /// Android freezes processes rather than killing them, so the `Drop` guard
    /// that clears the flag does not run — it pauses, holding a claim that no
    /// longer describes anything happening.
    pub fn claim_sync(&self, now_secs: u64, orphan_after: u64) -> Option<u64> {
        let mut claim = lock_or_recover(&self.sync_claim);
        if let Some((_, since)) = *claim {
            if !super::schedule::elapsed_at_least(since, now_secs, orphan_after) {
                return None;
            }
        }
        Some(self.take_claim(&mut claim, now_secs))
    }

    fn take_claim(&self, claim: &mut Option<(u64, u64)>, now_secs: u64) -> u64 {
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed) + 1;
        *claim = Some((generation, now_secs));
        self.syncing.store(true, Ordering::Relaxed);
        generation
    }

    /// Says a trip is still alive, so a long one is not mistaken for a frozen
    /// one. Called from every phase report.
    pub fn note_sync_progress(&self, now_secs: u64) {
        let mut claim = lock_or_recover(&self.sync_claim);
        if let Some((generation, _)) = *claim {
            *claim = Some((generation, now_secs));
        }
    }

    /// Releases the claim, reporting whether the flag actually changed.
    ///
    /// A superseded generation belongs to a trip that was taken over: it has
    /// finished, but another is running in its place, so clearing here would
    /// tell the footer the vault is idle while it is not.
    pub fn end_sync(&self, generation: u64) -> bool {
        {
            let mut claim = lock_or_recover(&self.sync_claim);
            match *claim {
                Some((current, _)) if current == generation => *claim = None,
                _ => return false,
            }
        }
        // Outside the claim lock: `set_phase` takes another, and two locks
        // held in one order here and the other order elsewhere is how a
        // deadlock gets written.
        self.syncing.store(false, Ordering::Relaxed);
        self.set_phase(None);
        true
    }
```

- [ ] **Step 4: Rewire the three call sites**

`round.rs`, replacing `engine.set_syncing(true)` and the `Clear` struct:

```rust
    let generation = engine.begin_sync(super::schedule::now_epoch_secs());
    crate::commands::watcher::announce_sync_status(key);
    struct Clear<'a>(&'a super::engine::Engine, &'a str, u64);
    impl Drop for Clear<'_> {
        fn drop(&mut self) {
            if self.0.end_sync(self.2) {
                crate::commands::watcher::announce_sync_status(self.1);
            }
        }
    }
    let _clear = Clear(engine, key, generation);
```

`round.rs`, in `report_phase`, before it sets the phase: `engine.note_sync_progress(super::schedule::now_epoch_secs());`

`registry.rs:551`:

```rust
    let Some(generation) = f.engine.claim_sync(
        super::schedule::now_epoch_secs(),
        super::schedule::ORPHAN_AFTER_SECS,
    ) else {
        return;
    };
```

and `registry.rs:576` (the spawn-failure arm): `if f.engine.end_sync(generation) { crate::commands::watcher::announce_sync_status(key); }`.

Update `status_tests.rs:66,97,100` to use `begin_sync`/`end_sync`.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
pnpm format:rust:fix
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml sync::
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/sync/
git commit -m "Let a later sync take over a claim a freeze left behind"
```

---

### Task 7: The lifecycle adapter reports leaving only

**Files:**
- Create: `apps/desktop/src/sync/syncLifecycleAdapter.ts`
- Create: `apps/desktop/src/sync/syncLifecycleAdapter.test.ts`
- Delete: `apps/desktop/src/sync/syncTriggerAdapter.ts`, `apps/desktop/src/sync/syncTriggerAdapter.test.ts`
- Modify: `apps/desktop/src/App.tsx:5,9`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `reportHidden(state: DocumentVisibilityState): Promise<void>` and `useSyncLifecycleAdapter(): void`. Task 8 deletes the `sync_app_foregrounded` command this task stops calling.

- [ ] **Step 1: Write the failing tests**

Create `apps/desktop/src/sync/syncLifecycleAdapter.test.ts`, adapting the existing `syncTriggerAdapter.test.ts` (mock `invokeNativeCommand` the same way):

```typescript
  it("tells the native side when the app goes away", async () => {
    await reportHidden("hidden");
    expect(invokeNativeCommand).toHaveBeenCalledWith("sync_app_backgrounded");
  });

  it("says nothing when the app comes back", async () => {
    await reportHidden("visible");
    expect(invokeNativeCommand).not.toHaveBeenCalled();
  });

  it("does not interrupt the user when the call fails", async () => {
    vi.mocked(invokeNativeCommand).mockRejectedValueOnce(new Error("no"));
    await expect(reportHidden("hidden")).resolves.toBeUndefined();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @thinkbrain/desktop test -- syncLifecycleAdapter`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the adapter**

```typescript
/**
 * Tells the native side when the app is going away, so it can push what was
 * written before the system freezes the process.
 *
 * Coming back is deliberately not reported. The sweeper thread resumes with
 * the process and reaches the same decision within a tick, and a lifecycle
 * command that starts a sync the sweeper is about to start anyway is a second
 * implementation of the schedule — which is how the two drifted apart before.
 *
 * `visibilitychange` also means different things on the two platforms: a phone
 * leaving the foreground, a desktop window being minimised. Only the leaving
 * half is worth acting on, and `blur` is not a substitute — pushing on every
 * alt-tab is nobody's idea of a sync policy.
 */
import { useEffect } from "react";

import { invokeNativeCommand } from "../native/commands";

/** Tells the native side the app is going away. */
export async function reportHidden(state: DocumentVisibilityState): Promise<void> {
  if (state !== "hidden") {
    return;
  }
  try {
    await invokeNativeCommand("sync_app_backgrounded");
  } catch {
    // A lifecycle event is not something the user asked for, so a failure here
    // is not something to interrupt them about. `invokeNativeCommand` already
    // logs it (commands.ts: `logCommandFailure`) before rethrowing.
  }
}

/** Mounts the listener for the life of the app. */
export function useSyncLifecycleAdapter(): void {
  useEffect(() => {
    const onChange = () => void reportHidden(document.visibilityState);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
```

- [ ] **Step 4: Swap it in and delete the old one**

```bash
git rm apps/desktop/src/sync/syncTriggerAdapter.ts apps/desktop/src/sync/syncTriggerAdapter.test.ts
```

and update `App.tsx` to import and call `useSyncLifecycleAdapter`.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `pnpm --filter @thinkbrain/desktop test -- syncLifecycleAdapter App`

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/
git commit -m "Report only that the app is leaving, not that it came back"
```

---

### Task 8: Wire the schedule in and delete the policy

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/sync/registry.rs` (`TICK` area constants, `spawn_sweeper`, `maybe_sync`, `attach`, `sync_app_backgrounded`; delete `sync_app_foregrounded`)
- Delete: `apps/desktop/src-tauri/src/commands/sync/trigger.rs`, `trigger_tests.rs`
- Modify: `apps/desktop/src-tauri/src/commands/sync/mod.rs` (drop `mod trigger`)
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs` (`app_command_list!`, count 59 → 58)
- Modify: `apps/desktop/src/native/commands.ts` (`NativeCommandMap`)
- Test: `apps/desktop/src-tauri/src/commands/sync/registry_tests.rs`

**Interfaces:**
- Consumes: everything Tasks 4–6 produced.
- Produces: the finished behaviour. Nothing later depends on it.

- [ ] **Step 1: Write the failing tests**

In `registry_tests.rs`, add tests that the sweeper's gate consults the schedule — driving `maybe_sync` through a `Schedule` with `automatically: false` and asserting no round trip starts, and through one with a short interval asserting one does. Follow the fixtures already in that file. If `maybe_sync` is not reachable from the test module, make it `pub(super)` rather than restructuring the sweeper to suit a test.

- [ ] **Step 2: Run them and watch them fail**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml registry`

- [ ] **Step 3: Rewire the sweeper**

Delete the `IDLE` and `CAP` constants. In `spawn_sweeper`'s loop, resolve once per tick, above the `for`:

```rust
                let now = Instant::now();
                let now_secs = super::schedule::now_epoch_secs();
                // Once per tick, not once per workspace: this is the hot path,
                // and the schedule is the same answer for all of them.
                let schedule = super::schedule::resolved();
```

and pass them into `maybe_sync(&key, &engine, schedule, now, now_secs)`. Rewrite `maybe_sync`:

```rust
/// Fires a round trip when the vault has been still and the interval has come
/// round. "Sync now" does not go through here, and the per-workspace lane
/// still keeps two trips from interleaving.
fn maybe_sync(
    key: &str,
    engine: &Arc<Engine>,
    schedule: super::schedule::Schedule,
    now: Instant,
    now_secs: u64,
) {
    if !schedule.automatically {
        return;
    }
    if !engine.ready_to_sync(schedule.quiet(), schedule.interval_secs, now, now_secs) {
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
```

- [ ] **Step 4: Rewire open and leave, and delete the policy**

In `attach`, replace the `open_start_allowed` block:

```rust
    // A configured destination is checked when the workspace opens. This is
    // the first useful moment to report a bad link or sign-in, rather than
    // making someone wait for the interval or discover a manual button.
    //
    // Gated on the interval rather than unconditional: on Android "open" is
    // also what happens every time the system killed the app in someone's
    // pocket, and a fetch on each of those is the battery drain this whole
    // design exists to avoid. A vault whose link is broken never records a
    // success, so it does still attempt on every open — which is where a
    // broken link should surface.
    if super::schedule::should_sync_on_open(
        super::schedule::resolved(),
        super::schedule::last_synced_at(app_data_dir, root),
        super::schedule::now_epoch_secs(),
    ) {
        if let Some(destination) = round::destination(app_data_dir, root) {
            start_round(key, &engine, root.to_path_buf(), destination);
        }
    }
```

In `sync_app_backgrounded`, replace the gate with
`if !super::schedule::should_flush_on_leave(super::schedule::resolved()) { return Ok(()); }`.

Delete `sync_app_foregrounded` entirely, then:

```bash
git rm apps/desktop/src-tauri/src/commands/sync/trigger.rs apps/desktop/src-tauri/src/commands/sync/trigger_tests.rs
```

drop `mod trigger;` from `commands/sync/mod.rs`, drop `sync::registry::sync_app_foregrounded` from `app_command_list!` in `commands/mod.rs`, change the expected count in `the_command_list_has_no_duplicates_and_the_expected_size` from 59 to 58, and remove the `sync_app_foregrounded` entry from `NativeCommandMap` in `apps/desktop/src/native/commands.ts`.

- [ ] **Step 5: Prove the platform branch is gone**

```bash
grep -rn "target_os" apps/desktop/src-tauri/src/commands/sync/
```
Expected: no output.

- [ ] **Step 6: Run everything**

```bash
pnpm format:rust:fix && pnpm qa
```
Expected: green. Capture the **full** output if anything fails — a Rust test flaked once on 2026-08-27 and went unnamed because the output was filtered.

- [ ] **Step 7: Commit**

```bash
git add -A apps/desktop/
git commit -m "Sweep on the schedule and delete the trigger policy"
```

---

### Task 9: Close the stories this replaces

**Files:**
- Rename: `plans/auto-sync/pending-foreground_policy_on_desktop-med-med.md` → `done-...`
- Rename: `plans/auto-sync/pending-sync_trigger_sharp_edges-low-easy.md` → `done-...`
- Rename: `plans/mobile/pending-frozen_sync_blocks_the_next_one-med-med.md` → `done-...`

- [ ] **Step 1: Mark each one done**

For each: `git mv` it to the `done-` name, change `**Status:** ⬜ pending` to `**Status:** ✅ done`, and add a short closing note naming the spec and what actually closed it. Be specific rather than generic:

- **foreground policy on desktop** — closed by deletion, not by choosing an event. There is no foreground-triggered sync on any platform any more; the sweeper's interval covers it.
- **sharp edges** — edge 1 closed because no setting is device-specific now, so exporting one is safe; edge 2 closed by `elapsed_at_least`; edge 3 (`record_round_trip` writing without the workspace-settings lock) is **still open** — say so plainly and leave that third section as a pending story of its own rather than ticking a box that was not addressed.
- **frozen sync** — closed by the claim takeover. Note that the acceptance box asking for the device check against a *slow* remote is **not** ticked: the fix is proven by unit test at the `Engine` level, which is what that story asked for, but the device re-run has not happened.

- [ ] **Step 2: Commit**

```bash
git add -A plans/
git commit -m "Close the three stories the sync schedule replaces"
```

---

## Self-Review

**Spec coverage:** Decision 1 → Tasks 5, 8. Decision 2 (two clocks, `elapsed_at_least`) → Tasks 4, 5. Decision 3 (settings) → Task 3, with Rust mirroring and clamping in Task 4. Decision 4 (`advanced`) → Tasks 1, 2. Decision 5 (lifecycle) → Tasks 7, 8. Decision 6 (orphaned claims) → Task 6. "Cost: no new per-tick I/O" → Task 4's cache plus Task 8's resolve-once-per-tick. "What this deletes" → Task 8. Testing → each task's own tests; the Android device checks are the human's, listed in the spec and not claimable by a subagent.

**Placeholder scan:** Task 2's tests and Task 8's `registry_tests.rs` tests are described rather than written out, because both must be built on fixtures that already exist in those files and inventing parallel ones would be worse than the omission. Every other step carries the code.

**Type consistency:** `Schedule` is `Copy`, so passing it by value into `maybe_sync` and the predicates needs no clone. `ready_to_sync` takes `(Duration, u64, Instant, u64)` in Tasks 5 and 8 alike. `claim_sync` returns `Option<u64>` and `end_sync` takes `u64` in Tasks 6 and 8 alike. `elapsed_at_least(last, now, threshold)` keeps that argument order at all seven call sites.

## Third sharp edge, deliberately not closed

`record_round_trip` does a read-modify-write of the workspace settings file without `WORKSPACE_SETTINGS_MUTATION_LOCK`. This plan does not touch it: the loser of that race is `sync.lastSyncedAt`, whose loss costs one extra sync, and taking a settings lock from inside a sync worker needs a look at what else holds it and for how long. Task 9 leaves it recorded as its own story rather than ticking it.
