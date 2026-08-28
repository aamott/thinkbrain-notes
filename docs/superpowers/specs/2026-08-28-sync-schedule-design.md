# Sync Schedule: One Rule, Two Clocks

**Date:** 2026-08-28

**Supersedes:** Decisions 1-4 of
`docs/superpowers/specs/2026-08-28-mobile-sync-triggers-design.md`. That design
shipped and works; this one removes the mechanism it introduced, having found
the defect underneath it.

**Closes:**
`plans/auto-sync/pending-foreground_policy_on_desktop-med-med.md`,
`plans/auto-sync/pending-sync_trigger_sharp_edges-low-easy.md` (all three
edges), `plans/mobile/pending-frozen_sync_blocks_the_next_one-med-med.md`.

## The problem

Two complaints, one cause.

**A phone open in front of you never syncs on a timer.** The
`mobile-sync-triggers` work stopped the Android freeze bug by gating the
sweeper's network call on the `idle` policy and defaulting phones to
`foreground`. So a phone syncs when you open a folder, when you return to the
app, and when you leave it — and never while you sit and write for an hour.

**`sync.trigger` is not a preference.** It is four spellings of a workaround
for one defect: `Engine::last_synced` is a `std::time::Instant`, and a
monotonic clock keeps counting through an Android process freeze. A vault that
synced ten seconds before the phone went into a pocket looks an hour unsynced
when it comes out, so the frequency cap that should have said "not yet" said
"go" — against a network that is not up yet.

The policy setting existed to keep that timer away from the platform where its
clock lies. Fix the clock and the policy has nothing left to do.

## Decision 1: one rule

An automatic round trip starts when both hold:

- the vault has been quiet for **`quietSeconds`**, and
- the last **attempted** round trip is older than **`intervalSeconds`**.

That is `ready_to_sync(IDLE, CAP)` with both constants promoted to settings and
the second measured on a wall clock instead of a monotonic one.

Nothing else fires on a timer. On a desktop the sweeper runs continuously and
the interval comes round on its own. On Android the sweeper thread resumes with
the process, ticks, and finds the interval elapsed — so "sync when I come back"
is not a rule in the code. It is the timer working correctly across a freeze.

**This reverses a decision in the superseded spec, deliberately.** That spec
treats a sync fired at resume as the bug:

> A user who comes back after an hour gets a sync they did not ask for, at the
> moment they opened their notes.

It was a bug because it fired whether or not real time had passed. Gated on a
wall clock it fires only when `intervalSeconds` of real time have genuinely
elapsed, which is exactly what "sync every 60 seconds" means. A user who does
not want that raises the interval or turns sync off.

## Decision 2: two clocks, and why not one

The obvious simplification — drive the interval from the persisted
last-**success** timestamp and delete the in-memory one — is wrong, and the
reason is written in `round.rs`:

> Count an attempted round, not only a successful one. Otherwise a bad link or
> missing sign-in starts a new automatic attempt every sweep tick.

A vault with a broken git link never succeeds, so a success-driven interval
would never advance and the sweeper would hammer the remote twice a second.
The attempt clock is the backoff. It stays.

| Clock | Lives | Records | Gates |
|---|---|---|---|
| `Engine::last_attempt` | in memory, epoch seconds | every round trip started, success or not | the sweeper's interval |
| `sync.lastSyncedAt` | workspace settings file, epoch seconds | successful round trips only | the open-time sync |

Both are wall-clock, so both survive a freeze. The attempt clock needs no
persistence: a fresh process has no attempt history, and that moment is
covered by the open-time gate below.

The gate itself takes both clocks explicitly, so a test can drive each one:

```rust
pub fn ready_to_sync(
    &self,
    quiet: Duration,        // measured against `last_touched`, monotonic
    interval_secs: u64,     // measured against `last_attempt`, wall clock
    now: Instant,
    now_secs: u64,
) -> bool;
```

`Engine::last_touched` stays a monotonic `Instant`. It only ever measures
seconds between local edits inside one process run, where monotonic is both
correct and immune to a user changing their clock. After a freeze it reads
"very quiet", which is true.

### A backwards clock reads as due, not fresh

Shared by every wall-clock comparison:

```rust
pub fn elapsed_at_least(last_secs: u64, now_secs: u64, threshold_secs: u64) -> bool {
    // A timestamp in the future is not evidence of freshness. It is evidence
    // the clock is untrustworthy, and the safe reading of an untrustworthy
    // clock is "do the work", not "skip it forever".
    if now_secs < last_secs {
        return true;
    }
    now_secs - last_secs >= threshold_secs
}
```

Today's `saturating_sub` floors to zero, so a backwards jump makes a vault
permanently fresh with nothing to recover it but reopening the workspace. That
is edge 2 of the sharp-edges story.

## Decision 3: the settings

All five live in the existing `sync.when` section, scope `app`, and are
**portable** — no value is device-specific any more, which is what closes edge
1 of the sharp-edges story (an exported `idle` landing on a phone that cannot
honour it).

| Key | Type | Default | Bounds | Surface |
|---|---|---|---|---|
| `sync.automatically` | boolean | `true` | — | basic |
| `sync.intervalSeconds` | number | `60` | 30–3600 | advanced |
| `sync.quietSeconds` | number | `30` | 5–300 | advanced |
| `sync.onOpen` | boolean | `true` | — | advanced |
| `sync.onLeave` | boolean | `true` | — | advanced |

`sync.automatically: false` is today's `manual`: no automatic network on any
path, and the other four stop applying. **Local version history, settling and
maintenance keep running.** The description must say so, because "sync
automatically" turned off sounds like "stop saving my work", and the sweeper
being untouched is the whole reason it is not.

The 30-second floor is not arbitrary: each round trip is a git fetch *and* a
push, so 30 seconds is already 120 fetches an hour per vault, and below that a
host's abuse detection becomes a real risk. The ceiling of 3600 is where "sync
automatically" stops meaning anything useful; someone who wants less should
turn it off.

Rust clamps both numbers to the same bounds when it reads them. The settings UI
enforces the range, but the file can be hand-edited, and an interval of `0`
read literally is a fetch every tick.

### Defaults are mirrored, not derived

The native side answers these questions before any window is listening, so
`schedule.rs` repeats the five defaults as constants and each side carries a
comment naming the other. This is the existing convention for
`settleAutomatically`, `historyPolicy` and the maintenance thresholds; it is
not new debt.

## Decision 4: `advanced` belongs to the registry, not to sync

Hiding four rows behind a per-module convention would give the next module a
reason to invent its own. So: `advanced?: boolean` on
`SettingDefinitionBase` — pure data, available to every module — plus one
`settings.showAdvanced` boolean (default `false`) in the existing
"settings about settings" module, and a toggle in `SettingsHeaderBar`.

Two rules keep the flag from becoming a trap:

- **A search hit reveals its row.** Search runs over
  `getAllDefinitions()` in the nav and is unaffected by hiding, so without this
  a user finds "How often to sync", clicks it, and lands on a section where the
  row is not rendered. `SettingsContent` already receives the highlighted key;
  reveal is **sticky for the life of the settings view**, because the highlight
  itself clears after 1200ms and a row that vanishes while being read is worse
  than one that never appeared.
- **A non-default value reveals its row.** Otherwise you can change a setting,
  hide it, and never find what you changed. Computed with the existing pure
  `resolveEffectiveValue` against `definition.default` — no new hook.

## Decision 5: lifecycle events

Two remain, both gated by `sync.automatically`:

- **Opening a workspace** syncs when `sync.onOpen` is on and the persisted
  last-success is older than `intervalSeconds`. A vault that has never synced
  counts as due.

  Gating the open on the interval is a change from today's unconditional sync,
  and it is what makes `onOpen` safe on a phone. On a desktop, opening is a
  deliberate act that happens rarely. On Android, "open" is also what happens
  every time the OS killed the app in your pocket — so an unconditional
  sync-on-open is the battery drain the superseded spec was trying to avoid,
  wearing a different name.

  A broken vault still attempts on every open, because its success timestamp
  never advances. That is correct: opening is where a bad link should surface,
  and it is one attempt per open rather than one per tick.

- **Leaving the app** flushes and pushes when `sync.onLeave` is on. This is
  reported from `visibilitychange`, which on a phone means the OS is about to
  freeze the process and on a desktop means the window was minimised.

  **The asymmetry is documented, not fixed.** A desktop rarely fires this, and
  that is fine: the sweeper is still running, so changes leave on the interval
  anyway. Listening for `blur` instead would push on every alt-tab, which is
  the trap `pending-foreground_policy_on_desktop` warned about. The setting's
  description promises what `visibilitychange` delivers and no more.

**`sync_app_foregrounded` is deleted.** The sweeper resumes with the process
and ticks within 500ms; a lifecycle command that starts a sync the sweeper is
about to start anyway is a second implementation of Decision 1. Removing it
also removes the desktop `visibilitychange`-is-not-focus trap by construction
rather than by choosing between two events.

## Decision 6: an orphaned sync claim can be taken over

A frozen process keeps its memory, so the `syncing` flag survives a freeze that
the `Drop` guard clearing it does not. Under the superseded design that cost a
skipped return-sync. Under Decision 1 the recurring timer is the *only*
automatic trigger, so a stuck flag stops syncing entirely until restart. It has
to be fixed here.

The flag gains a wall-clock start stamp and a generation number:

```rust
fn begin_sync(&self, now_secs: u64) -> u64;                        // stamp, bump, return generation
fn claim_sync(&self, now_secs: u64, orphan_after: u64) -> Option<u64>;  // begin, if free or orphaned
fn end_sync(&self, generation: u64) -> bool;                       // clears only if still current
```

`ORPHAN_AFTER_SECS = 600`. A claim older than that may be taken over.

**Why a generous bound is safe rather than a race:** `round::sync` takes the
per-workspace lane *before* it touches the flag, so a taken-over trip does not
run alongside the original — it blocks on the lane until the original finishes.
The bound only has to exceed a plausible sync, not every conceivable one.

**Why the generation is needed:** after a takeover two workers exist, each
holding a `Clear` guard. Without generations the first to finish would clear a
flag the second still owns, and the footer would report idle during a live
sync. `end_sync` no-ops when the generation has moved on.

`Engine::set_syncing` is replaced by these three. Two ways to set the same flag
is how the orphan appeared.

## Cost: no new per-tick I/O

The sweeper ticks twice a second against every open workspace, and the
superseded design already left a comment warning that resolving policy from the
settings file on that path is work nobody asked for.

- The schedule resolves **once per tick, not once per workspace**, and is
  cached for 5 seconds behind a `static`. One settings read per five seconds
  regardless of how many vaults are open. The cache's own TTL is measured with
  `Instant`, where a freeze inflates the elapsed time and expires the cache —
  the harmless direction.
- The interval and quiet gates read in-memory values only. `sync.lastSyncedAt`
  is touched on workspace open and after a round trip, never on a tick.

## What this deletes

`Trigger`, `platform_default`, `idle_start_allowed`, `open_start_allowed`,
`should_sync_on_foreground`, `should_flush_on_background`, `STALE_AFTER_SECS`
and the `is_stale` helper built on it,
the `sync.trigger` setting and its enum options, `set_syncing`, the
`sync_app_foregrounded` command and its entry in the command list and
`NativeCommandMap`, and the foreground half of `syncTriggerAdapter.ts`.

`trigger.rs` becomes `schedule.rs` and keeps `record_round_trip`,
`last_synced_at` and `now_epoch_secs`. `is_stale`'s job passes to
`elapsed_at_least`, which takes the interval as an argument rather than closing
over a constant, so the open gate and the tick gate compare against the same
number the user set.

**The last `cfg!(target_os)` in the sync layer goes with it.** No file under
`commands/sync/` asks what platform it is running on.

### No migration

`sync.trigger` landed after `v0.2.0` and exists only on `dev` and nightlies. An
unknown key in a settings file is inert — quarantine fires on documents that
fail to parse, not on keys the registry does not recognise — so an orphaned
`sync.trigger` costs a stale line in a JSON file and nothing else. The
registry's versioned `SettingMigration` machinery is for values worth carrying
forward; this one is not.

## Testing

**Unit, at the schedule and engine level:**

- quiet but not due does not fire; due but not quiet does not fire
- a failed round trip does not advance `sync.lastSyncedAt` (this test exists
  and must keep passing)
- a failed round trip *does* advance the attempt clock, so a broken vault
  attempts once per interval rather than once per tick
- `elapsed_at_least` reads a future timestamp as due
- an out-of-range `intervalSeconds` in the settings file is clamped
- a claim older than `ORPHAN_AFTER_SECS` is taken over; a fresh one is not
- `end_sync` with a superseded generation leaves the flag set
- `sync.automatically: false` fires nothing on the tick, the open or the leave
  path, and still records settled changes locally

**Device, on Android, because that is what this is for:**

- open in the foreground and typing in bursts: one sync per interval, each
  landing after typing stops rather than during it
- backgrounded for longer than the interval: exactly one sync at resume
- backgrounded for less than the interval: no sync at resume
- `sync.automatically` off: no network on any of the three

## Non-goals

- **Cancel-on-background and a push-only background flush.** Both are
  reasonable and both are listed in the frozen-sync story. Neither is needed
  once a claim can be taken over, and adding all three at once would leave no
  evidence about which one mattered.
- **A per-workspace schedule.** The scope is `app`, matching `sync.trigger`
  before it. Nobody has asked to sync one vault faster than another.
- **Reworking what a round trip does.** Fetch, merge, push are untouched.
