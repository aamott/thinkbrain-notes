# Architecture review: Rust native backend (med/hard)

Scope: `apps/desktop/src-tauri` — `lib.rs` setup, `commands/` (workspace*, search, settings, sync, watcher, extensions, themes, backup), `error.rs`, `credential_store.rs`, and the IPC contract with `apps/desktop/src/native/commands.ts`. Read-only review; design decisions judged, not just bugs. Line numbers are from the reviewed revision.

## Summary — top 5

1. **Make per-workspace resources owned by one workspace session, not four subsystem maps.** `WATCHERS`, `ENGINES`, `SEARCH_CONNECTIONS`, and `WorkspaceWindowRoots` each track the vault independently with different keys and lifetimes; the search pool has no release path at all except managed delete (`search.rs:23`, `workspace_managed.rs:163`). A canonical-root-keyed `WorkspaceSession` in managed state would make delete/close/switch a single decision.
2. **Close the attach/release race in the background sync bootstrap.** `watch_workspace` acquires watcher interest, then spawns a thread that later calls `registry::attach` (`watcher/lifecycle.rs:132-165`). A window destroyed during bootstrap leaves `adopt()` holding interest for a dead label (`sync/registry.rs:76-80`) — a leaked engine that keeps recording a vault nobody has open, and can resurrect metadata after delete. Same root cause as the known `detach_engine_on_delete` story; fix them together.
3. **All commands are synchronous `fn`s, so heavy work runs on the IPC/main path.** `index_documents` (SQLite batch), `sync_now` (network round trip), `list_workspace_entries` (10k-entry walk) are all `pub fn` (`search.rs:95`, `sync/round.rs:704`, `workspace_entries.rs:38`). The codebase already knows the cost — bootstrap was moved off-thread citing Windows AppHang (`watcher/lifecycle.rs:140-145`) — but the fix was applied only where it hurt first.
4. **The TS↔Rust command contract is hand-mirrored with no mechanical check.** `app_command_list!` names each command once in Rust (`commands/mod.rs:58`), while `NativeCommandMap` in `commands.ts` re-declares names, args, and results by hand. Arg-name/casing drift fails only at runtime. Either generate bindings (tauri-specta/ts-rs) or add a CI check comparing `APP_COMMAND_PATHS` against the map's keys.
5. **The pending `ipc_hardening` story has the right scope; extend it to the search pool.** Root-is-renderer-chosen (`workspace_paths.rs:65-91`), `csp: null`, and unreleased asset grants are correctly identified. The same root-authority fix would also stop `get_search_connection` creating an index for any existing directory the renderer names (`search.rs:26-41`).

## Findings

| # | Title | Urgency | Difficulty | Payoff |
|---:|---|---|---|---|
| 1 | Unify per-workspace resources under one session owner | Med | Hard | High |
| 2 | Fix attach/release race in background sync bootstrap | Med | Med | High |
| 3 | Move blocking commands off the synchronous IPC path | Med | Med | High |
| 4 | Mechanically verify the TS command map against Rust | Med | Easy | High |
| 5 | Search connection pool has no lifecycle release | Low | Easy | Med |
| 6 | Oversized modules drift past the <500-line guideline | Low | Med | Med |
| 7 | `eprintln!` is the only logging channel | Low | Easy | Med |
| 8 | ipc_hardening story scope is right; fold in search + asset-grant revocation | Low | Med | Med-high |

## 1. Unify per-workspace resources under one session owner

**Current decision.** Each subsystem owns its own table: `WATCHERS` (static `Mutex<Option<WatchState>>`, `watcher/lifecycle.rs:101`), `ENGINES` (static registry, `sync/registry.rs:115`), `SEARCH_CONNECTIONS` (`search.rs:23`), and `WorkspaceWindowRoots` (Tauri managed state keyed by *window label*, `workspace_windows.rs:19`). Watcher and engine deliberately share `WatchInterest` (root → label → count), which is the one coordinated pair.

**Cost.** "What lives for this vault?" has no single answer. Cleanup is reassembled per event: `release_window_watchers` calls `sync::registry::release_window` then drops debouncers (`watcher/lifecycle.rs:206-216`); `delete_managed_workspace_in` knows to release the search connection but not the engine or watcher (`workspace_managed.rs:162-163`). The main window's root is not in `WorkspaceWindowRoots` at all (comment at `lib.rs:93-94`), so even window→root is partial. Every new per-vault resource repeats the keying and the leak surface.

**Alternative.** A `WorkspaceSession { watcher, engine, search_conn, asset_grant, interest }` map keyed by canonical root, held in managed state; subsystem modules borrow from it rather than owning statics. Keep `WatchInterest` as the refcount inside the session.

**Effort/risk/payoff.** Hard — it crosses the watcher/sync/search boundary and every test that pokes the statics; payoff is that delete, close, and switch become one transition instead of N coordinated ones. Do it incrementally: session object first, migrate search pool and asset grants before touching the watcher/engine pair.

## 2. Attach/release race in the background sync bootstrap

**Current decision.** `watch_workspace` registers watcher interest, then spawns `thinkbrain-sync-bootstrap` to call `registry::attach` so vault hashing doesn't stall the window (`watcher/lifecycle.rs:154-165`). `attach` re-checks `hold_and_sweep` under the lock before bootstrapping (`sync/registry.rs:127-148`) — but nothing re-checks whether the *label* is still alive before `adopt` acquires its interest (`sync/registry.rs:186`).

**Cost.** Window closed mid-bootstrap (or `delete_managed_workspace` racing it, per `plans/workspace-manager/pending-detach_engine_on_delete-low-med.md`): `release_window`/`detach` ran before the interest existed, so `adopt` acquires a count for a dead label that can never reach zero. The engine lives forever, the sweeper keeps recording, and after a managed delete it can recreate `sync/workspace-<hash>.git` — the silent resurrection the pending story already predicts. Today the delete path is Android-only, which bounds the blast radius but does not fix the race itself.

**Alternative.** Track a monotonically increasing generation per (root, label) in `WatchInterest`; `attach` carries the generation captured at watch time and `adopt` drops the engine if the label's interest is already gone. Simpler still: `release_window` also records tombstoned labels briefly, and `adopt` refuses tombstoned labels.

**Effort/risk/payoff.** Med effort, low risk (registry-internal), high payoff — it is the only path that creates a resource for an owner that provably no longer exists. Should land with the `detach_engine_on_delete` story, not after it.

## 3. Blocking work on synchronous commands

**Current decision.** Every command except `open_workspace_window` is a plain `fn` — Tauri runs those on the main/IPC path, not a worker. The codebase documents the consequence itself: bootstrap was threaded because "on a large vault that takes long enough to stall the Windows message pump and trigger an AppHang" (`watcher/lifecycle.rs:141-145`). Yet `index_documents` writes a SQLite batch (`search.rs:95`), `sync_now` does a full git round trip including fetch/push (`sync/round.rs:704-724`), and `list_workspace_entries` walks up to `MAX_WORKSPACE_ENTRIES` files (`workspace_entries.rs:38`, `workspace_paths.rs:14`) — all synchronously.

**Cost.** A multi-second vault walk or a slow git fetch freezes UI for every window, not just the caller's. `sync_now` is the worst offender: network latency is unbounded, and the footer button that triggers it is exactly where a user notices a hang.

**Alternative.** Mark I/O commands `async` and run the body via `tauri::async_runtime::spawn_blocking` — `sync/round.rs:379` and `sync/network.rs:348` already have `network_call`/`bounded` wrappers doing this pattern internally for threads; reuse it at the command boundary. Prioritize `sync_now`, `index_documents`, `list_workspace_entries`, `sync_history`, `read_version_diff`. Cheap reads (`read_markdown_file`, settings reads) can stay sync.

**Effort/risk/payoff.** Med effort, low risk (signatures change, bodies don't), high payoff on Windows and Android especially.

## 4. TS command map is hand-synced with Rust

**Current decision.** Rust names all 61 commands once via `app_command_list!`, expanded into both the handler registration and a test-visible path list (`commands/mod.rs:58-163`) — a genuinely good single-source design. The TS side hand-writes `NativeCommandMap` with every command's args and result (`apps/desktop/src/native/commands.ts:38+`), and nothing compares the two.

**Cost.** Adding a Rust command without a TS entry is silently unreachable; renaming an arg or flipping `camelCase` compiles clean and fails at runtime in production. The Rust count test (`commands/mod.rs:190`) can't see the far side.

**Alternative.** Cheap option: emit `APP_COMMAND_PATHS` to a file in a build/test step and assert the map's keys match in CI — a day of work, catches name drift. Durable option: tauri-specta or ts-rs to export arg/result types and generate the map; bigger migration (~all 61 signatures need `specta`/`Type` derives) but kills the whole class.

**Effort/risk/payoff.** Easy→Med depending on option, low risk, high payoff — this is the only untyped seam between the two halves of the app.

## 5. Search connection pool never releases

**Current decision.** `SEARCH_CONNECTIONS` maps canonical root → pooled `Connection` (`search.rs:23-43`). The only release is `release_search_connection`, called solely from managed-vault delete (`workspace_managed.rs:163`, `search.rs:280`). Window close, workspace switch, `clear_index` — none release it.

**Cost.** Every vault ever opened this session holds an open SQLite file forever. Harmless at two vaults; real on long sessions, and it keeps the index file busy on Windows where an open handle blocks deletion. It also makes the pool a second implicit "open workspaces" registry that nothing else consults.

**Alternative.** Tie the pooled connection to `WatchInterest`: release when the last window releases the root (same hook `unwatch_workspace` already has). This falls out of finding 1's session object for free.

**Effort/risk/payoff.** Easy, low risk, medium payoff.

## 6. Module size drift past the <500-line guideline

**Current decision.** `settings.rs` 939, `engine.rs` 752, `round.rs` 738, `registry.rs` 649 (+ a 675-line test file). AGENTS.md prefers <500 and hard-caps 800.

**Cost.** `settings.rs` mixes app settings, workspace settings, desktop state, quarantine, and mutation locks — the largest non-test file is also the one every feature touches. `round.rs` carries the round-trip pipeline, `sync_now`, and network-call plumbing; `registry.rs` is already the hardest file in the codebase to hold in your head and owns the race in finding 2.

**Alternative.** Split along seams already visible in the doc comments: `settings.rs` → `app_settings`/`workspace_settings`/`desktop_state`/`quarantine`; `round.rs` → pipeline vs `sync_now` command surface. Pure moves, no behavior change.

**Effort/risk/payoff.** Med effort, low risk, medium payoff — mostly reviewability, which matters most exactly where the lifecycle bugs live.

## 7. `eprintln!` as the logging substrate

**Current decision.** Every subsystem logs via `eprintln!` (`workspace_windows.rs:67`, `watcher/lifecycle.rs:163`, `registry.rs:267`, …). No `log`/`tracing` facade, no levels, no ring buffer.

**Cost.** On Android, stdout/stderr reach logcat unfiltered; on desktop release builds they're lost entirely unless attached to a console. "Fail loudly" works for errors returned over IPC, but the sweeper and watcher — the components whose errors have nowhere else to go — whisper to a void on release builds.

**Alternative.** `tauri-plugin-log` (or `tracing` + a `log` bridge) behind the same call sites; keep stderr as one target. Low effort since call sites already say what happened and why.

## 8. ipc_hardening scope

**Verified, not assumed:** `resolve_workspace_root` accepts any existing absolute dir (`workspace_paths.rs:65-91`); `read_theme_file` *does* re-contain to the themes dir (`themes.rs:232-260`) — good; `read_extension_file` checks containment then opens, with the TOCTOU gap the story names (`extensions.rs:135-141`). The story's four items are all real. Two additions worth folding in: (a) the search pool/index file is creatable for any existing directory the renderer names (`search.rs:30-40`) — moot once roots are registered; (b) `delete_managed_workspace_in` computes sibling deletions correctly but the whole command still trusts the window lifecycle for engine/watcher detach — fold in finding 2. Scope judgment: keep it low urgency; nothing is exploitable today, and finding 1's session object is the natural carrier for registered-roots anyway.

## Keep as is

- **`app_command_list!` single-source expansion** (`commands/mod.rs:58-163`): one list feeds registration and tests, with a count test that forces reviewer attention on changes. Model worth copying to the TS side (finding 4).
- **`WatchInterest` counted interest** (`watcher/lifecycle.rs:34-92`): React effect double-mount is handled correctly via counts, not sets; `release_window` covers OS-destroyed windows. The design is right; it just needs to own more resources.
- **Sharing watcher lifecycle for sync engines** (`registry.rs:1-10`): one engine per vault, same interest accounting — deliberately identical lifecycles. Right call.
- **Canonical-root keying everywhere** (`search.rs:30-34`, `registry.rs:296-301`): resolves before keying so symlink spellings can't fork engines/connections. Subtle and correct.
- **`NativeError` {code,message,details} + `lock_or_recover`** (`error.rs`): uniform typed error across the bridge, poison-recovery consistent with documented rationale, `failed()` helper keeps code+message+details triples tidy.
- **Credential store architecture** (`credential_store.rs`): eager single registration with measured cost (~52ms documented), runtime `is_available()` reported through `platform_capabilities` so "absent" is a fact not a `cfg!` guess; Android keystore-via-`ndk-context` ordering documented (`android_context.rs`). Clean platform split.
- **Asset-scope grant per open vault** (`workspace_windows.rs:59-71`): empty static scope + per-vault `allow_directory` is the right default; revocation is a known hardening item, not a design flaw.
- **`unwatch_workspace` takes the canonical root, not a re-resolution** (`watcher/lifecycle.rs:181-185`): releasing works precisely when the folder no longer exists — the comment shows the failure mode was thought through.
- **Bootstrap off main thread + per-workspace lanes** (`registry.rs:39-44`, `watcher/lifecycle.rs:154`): right instinct; extend the pattern to commands (finding 3) and close the adopt race (finding 2).
- **Events carry a root, not state** (`watcher/mod.rs:60-128`): `sync://status`/`sync://conflicts` announce that an answer changed, never the answer — can't go stale in flight.
- **Managed-vault delete ordering** (`workspace_managed.rs:165-168`): vault removed before metadata so a partial failure leaves orphaned history rather than a vault without its record — correct priority ordering.
