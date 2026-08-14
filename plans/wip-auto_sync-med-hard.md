# Auto Sync

> **WIP — concept under refinement.** **[DECIDED]** settled; **[OPEN]** need
> input; **[WIP]** best judgment, not yet confirmed.
>
> **Supersedes `wip-git-integration-low-hard.md` and its child stories.** That
> epic assumed system Git as MVP with sync as a separate layer. This epic
> bundles Git (gix), hides it behind a unified Sync UI, and presents it as one
> of four sync methods. Read `plans/app-vision.md` ("Bring your own sync") and
> `plans/technical-decisions.md` before starting.
>
> **When this concept is approved:** update `app-vision.md` (Git row: system
> Git → bundled gix) and `technical-decisions.md` (Git section: system Git →
> bundled gix) to match. Those docs still mandate system Git; this plan
> supersedes that decision but the docs need reconciliation on approval.

## Goal

Automatic, non-technical-friendly sync across Git, OneDrive, Google Drive, and
Syncthing — automated commit messages, clean conflict UI, zero Git jargon.
Desktop, Android, iOS from one codebase.

## Two sync shapes

One user-facing "Sync" concept, two underlying shapes:

- **Active (Git):** app drives it. Commit/push/pull via bundled gix. Conflicts
  are Git merge conflicts. Trigger-based. All platforms (foreground-only on
  mobile).
- **Passive (OneDrive, Google Drive, Syncthing):** external daemons the app
  doesn't control. App watches the folder, reacts to conflict files they
  create (`Note (1).md`, `Note (conflicted copy).md`, `.sync-conflict-*`).
  Conflicts are duplicate files. Desktop only — no daemons on iOS/Android.

One merge engine, one conflict UI, one code path. Provider differs only in how
it produces the `(base, ours, theirs)` triple.

## Architecture decisions

### Git engine: bundled gix **[DECIDED]**

System Git violates no-external-dependency — non-technical users won't have it.
**gix (gitoxide):** pure-Rust, 4+ years old, actively maintained,
cross-compiles to iOS/Android (CI tests Android), rustls (no OpenSSL), full
merge (three-way, recursive, rename detection). Replaces system-Git MVP work
in `gitService.ts` and `src-tauri/src/commands/git.rs`.

**Losses vs system Git:** hooks only (implement validation in app logic).
Everything else missing (LFS, sparse checkout, partial clone, custom merge
drivers, worktrees) is irrelevant for text notes. No user-noticed feature lost.

### Merge engine: gix three-way merge **[DECIDED, with caveat]**

gix's merge is Git's proven algorithm, already a dependency, 4+ years mature.
Produces conflict markers in intermediate output, but we parse results into
structured conflicts — user never sees raw markers.

**[WIP]** If gix's line-level merge produces too many false conflicts on prose,
**reconcile-text** (v0.12.1, pure Rust, marker-free, WASM) is the fast-follow.
~1 year old, pre-1.0 — doesn't meet the 3-year maturity bar today but is the
best option if gix proves too coarse. Re-evaluate via conflict-rate tracking
(see Open Questions).

**[WIP]** Block-level Markdown merge (split into blocks, diff blocks, fall
back to line merge within a conflicting block) is a fast-follow using the
existing `packages/core` Markdown parser. Optimization for fewer false
conflicts, not a correctness requirement — conflict UI handles misses. Ship
line-level first.

### difftastic: ruled out **[DECIDED]**

No three-way merge (two-way diff only), no Markdown support, not a library.
Maintainer recommends mergiraf for merge, which is CLI-only.

### Hidden repo in app-data **[DECIDED]**

One hidden gix repo per workspace in OS app-data (never vault, never cloud):
1. Merge base for conflicts
2. The actual repo for Git-sync users (push/pull against remote)
3. Version history for "restore previous version"

`.git` never touches cloud. No on-disk `.git` for users to poke at. Power users
who want real Git control use their own Git setup outside the app.

**Cloud merge base caveat [WIP]:** "last commit = last synced state" is
reliable for Git (push acknowledges) but *not* for cloud drives — the app gets
no upload/download confirmation from OneDrive/Syncthing. A commit containing
local edits may be mistaken for the common ancestor. Options:
- **A. Conservative two-way merge for cloud** — no base, present both versions,
  user picks. Safe but loses auto-merge.
- **B. Quiescence-based checkpoint** — commit to hidden repo only after
  detecting the folder is stable (no watcher events for N seconds), treating
  that as "synced." Heuristic, not guaranteed.
- **C. Accept the approximation** — use last commit as base, accept occasional
  wrong merges. The conflict UI catches failures; user picks keep-current or
  keep-remote.

**Recommendation: B with C as fallback.** Quiescence detection is the same
pattern the file watcher already uses (debounce). When quiescence can't be
determined (app was closed, startup scan), fall back to C — the conflict UI is
the safety net. Never claim a clean three-way merge for cloud when the base is
uncertain; the UI should say "two versions exist" not "merged automatically"
when the base is approximate.

### Git fully hidden — no Source Control panel **[DECIDED]**

No staging, branching, remotes, or credentials UI in a panel. Remote setup
once in Settings ("Sync via Git": remote URL + auth), then invisible. Existing
`SourceControlPanel.tsx` diff/status parsing is reusable; the panel doesn't
ship.

Four user-facing surfaces, no Git jargon:
1. **Sync status indicator** (status bar) — Synced / Syncing / Needs attention
2. **Conflict resolution cards** — keep-current / keep-remote / keep-both,
   expandable diff for text. This *is* the merge tool.
3. **Sync History** — friendly activity log from hidden repo commits + AI
   messages. Expandable to raw commit messages.
4. **Restore previous version** — right-click a note, pick from dated list.
   Uses hidden repo history. Zero Git knowledge needed.

### Automated commit messages **[DECIDED]**

Diff → AI prompt → natural-language message, shown in Sync History. AI
optional — template fallback ("Auto-sync: 5 notes changed") keeps Git working
with no AI configured. Rides on AI/ACP infrastructure; no new AI plumbing.
Fails loudly to template, never blocks sync.

### Platform tiers **[DECIDED]**

| Platform | Git sync | Cloud sync | Trigger |
|----------|----------|------------|---------|
| Desktop  | gix (bundled) | folder-watch + conflict detection | idle/blur/save/manual + freq cap |
| Android  | gix (foreground only) | not supported (no daemon) | on app open + manual |
| iOS      | gix (foreground only) | not supported (no daemon) | on app open + manual |

Mobile background execution is OS-restricted (~30s on iOS). Cloud providers
listed as "Desktop only" on mobile — not hidden. iCloud Drive on iOS works via
the system (not us); detected and presented as "your iCloud Drive" if present.

### Sync triggers **[DECIDED]**

Cloud: reactive, always-on. Only setting: "auto-merge without asking" vs "ask
me each time" (default: auto-merge).

Git: all configurable in advanced settings:
- On idle (debounced, default ~30s) — the default
- On app blur (window loses focus)
- On save — optional, aggressive
- Manual — "Sync now" button, always available
- Max sync frequency cap (default 1/min) — most recent pending sync wins,
  intermediate coalesce

Default for fresh non-technical user: on-idle + max 1/min + manual always
visible.

### Multi-provider: Git + cloud simultaneously **[DECIDED]**

User can run Git sync and cloud sync on the same vault. Common case: vault in
OneDrive folder *and* Git remote. Both active; neither exclusive.

Both share the vault folder (write merged files) and hidden repo (commit).
Orchestrator holds a **sync lock** — one sync cycle at a time per workspace,
regardless of provider. Git idle-trigger and cloud conflict detection that
fire simultaneously are serialized. Lock is per-workspace, not global.

Interaction flow (vault in OneDrive + Git remote):
1. User edits → app writes → OneDrive uploads
2. Git idle-trigger → hidden repo commits, pushes to Git remote
3. Other device edits → OneDrive downloads, may create conflict file
4. Cloud watcher detects conflict → acquires lock → merge (base from hidden
   repo, ours = local, theirs = conflict copy) → write merged → commit to
   hidden repo → OneDrive syncs merged up
5. Git sync's next cycle pushes the merge to Git remote

Git = intentional version control (push/pull to remote). Cloud = transparent
folder sync. Hidden repo is the shared merge base.

### File types: text and binary **[DECIDED]**

Vault isn't Markdown-only — images, PDFs, attachments.

- **Text (Markdown, plain text, JSON, YAML):** full three-way merge via gix.
  Conflict cards show expandable diff. Keep-current / keep-remote / keep-both
  / merge.
- **Binary (images, PDFs, attachments):** no merge. gix detects binary,
  refuses text merge. Conflict cards show metadata (name, size, modified,
  thumbnail if renderable). Keep-current / keep-remote / keep-both (two
  files). No diff, no merge.

Conflict result carries `kind: "text" | "binary"`. Binary "keep both" produces
`name.ext` + `name (remote).ext` — "current"/"remote" labels match the conflict
UI, no collision with provider patterns.

### Provider abstraction **[DECIDED]**

`SyncProvider` trait in native layer. Each reports: platform availability,
state, conflict markers, sync cycle entry point. Orchestrator picks active
provider(s), holds sync lock, presents unified status.

```
apps/desktop/src-tauri/src/commands/sync/
├─ mod.rs              # SyncProvider trait, orchestrator, sync lock
├─ git_provider.rs     # gix-backed Git sync (all platforms)
├─ cloud_provider.rs   # folder-watch + conflict-file detection (desktop only)
├─ merge.rs            # gix three-way merge → structured conflicts (text + binary)
└─ hidden_repo.rs      # gix repo in app-data: mirror + merge base + history
```

### Extension boundary **[DECIDED — direct first, extension later]**

Sync ships as a direct app feature first (status bar, shell-managed lifecycle,
existing settings, direct native credentials). Migrates to extension boundary
when background tasks, extension settings, and secret storage land. Native
layer (gix, merge, hidden repo) doesn't change during migration — only
UI/lifecycle/settings integration points move.

### Data safety integration **[DECIDED — parallel, not blocking]**

Sync doesn't depend on data-safety epic. Hidden repo is sync's own recovery
path — if a sync write crashes, "restore previous version" recovers from
history. Data-safety's atomic writes (temp + rename) make sync writes safer;
sync adopts them when they land. Convergence point: sync's file-write code
calls the same atomic-write primitive the document adapter uses.

**Honest gap:** hidden history can't recover uncommitted edits or a crash
during the first destructive write. Until data-safety's atomic writes land,
there's a data-loss window on crash mid-merge. The `expected` field in the
document adapter (required, not optional) prevents blind overwrites during
sync races — a sync write that loses the race surfaces
`workspace.note_conflict` instead of clobbering. This is the partial guard;
atomic writes are the complete fix.

### Watcher loops and self-event suppression **[DECIDED]**

Cloud sync has a feedback-loop risk: app writes merged file → cloud daemon
uploads → daemon downloads (echo) → watcher sees "change" → app re-merges →
loop. The indexing-search epic already solved this: `watcher.rs` records an
expected echo for app-initiated writes and suppresses them. Sync reuses the
same pattern — every file sync writes records an expected echo so the watcher
doesn't re-process it. External writes (real conflicts) have no echo and are
processed normally.

Additional safeguards: quiescence check before committing to hidden repo (no
watcher events for N seconds), idempotent merge (same base+ours+theirs
produces same result, so re-processing is harmless if it happens).

### Startup reconciliation **[DECIDED]**

Conflicts can appear while the app is closed (cloud daemon runs without us).
On workspace open, before starting the watcher, sync scans the vault for
conflict files (`Note (1).md`, `Note (conflicted copy).md`,
`.sync-conflict-*`) and processes any found. This is a one-time scan, not
continuous — the watcher handles conflicts that appear while open.

### Conflict scope: content and tree **[DECIDED]**

Content merge (`base, ours, theirs`) handles modify/modify conflicts. Sync
also handles tree-level conflicts:
- **Rename/delete:** file renamed on one side, deleted on other → keep renamed
  or honor delete, user decides.
- **Modify/delete:** file edited on one side, deleted on other → keep edited
  version or honor delete, user decides.
- **Path collisions:** two different files synced to same path → rename one,
  user decides which.
- **Case-only renames:** significant on case-sensitive filesystems (Linux),
  invisible on case-insensitive (macOS/Windows) → normalize and warn.

Conflict result carries `scope: "content" | "tree"` alongside
`kind: "text" | "binary"`. Tree conflicts always go to the UI — no
auto-resolution.

### Failure and error model **[WIP]**

Three status labels (Synced / Syncing / Needs attention) are not enough. Sync
needs a richer state model:

- **States:** idle, syncing, needs-attention, paused, off
- **Error types:** offline, auth-failed, quota-exceeded, disk-full, timeout,
  rejected-push, partial-failure, conflict-pending
- **Recovery:** retry with backoff (offline, timeout), re-auth prompt
  (auth-failed), user action (quota, disk-full, conflict-pending)
- **Persistence:** last-success time, last-error type + message, pending work
  count — all shown in Sync History

**[WIP]** Exact state machine and which errors auto-retry vs. surface
immediately is story-level detail. The epic decision: sync has a persistent
error model, not just 3 labels, and errors carry enough info for non-technical
recovery actions ("Reconnect", "Sign in again", "Free up space").

### First-run and off-state UX **[WIP]**

"Remote URL + auth" is still Git jargon. Setup needs plain language:
- **Git setup:** "Sync your notes to another device" → choose "Through a Git
  service (GitHub, GitLab, etc.)" or "Direct to another computer" → paste
  link → sign in. No mention of "remote", "URL", "clone", "fetch".
- **Cloud setup:** auto-detected if vault is inside a known cloud folder
  (OneDrive/Google Drive/Syncthing). "We noticed your notes are in OneDrive —
  we'll handle conflicts automatically." No setup needed.

**Local history when sync is off:** the hidden repo commits regardless of
whether push/pull is enabled. "Restore previous version" works even with no
provider configured. Sync off = no network, not no history.

**[WIP]** Exact setup wizard flow and provider enable/disable/remove UX is
story-level.

### AI consent for commit messages **[DECIDED]**

Sending note diffs to an AI provider for commit message generation is sending
note content externally. Per the app's AI principles (`technical-decisions.md`:
"Cloud model use and sending note/workspace context require explicit consent"),
this requires explicit opt-in. The setting lives in sync settings, not AI
settings — "Generate friendly sync messages using AI" with a clear note that
this sends diff content to the configured AI provider. Off by default.
Template fallback ("Auto-sync: 5 notes changed") works without it.

## Scope

In scope:
- Bundled gix Git engine (replaces system Git)
- Hidden repo in app-data (merge base + version history)
- gix three-way merge → structured conflicts (text/binary, content/tree)
- Four providers: Git (all platforms), OneDrive/Google Drive/Syncthing (desktop)
- Multi-provider: Git + cloud simultaneously, sync lock
- File watcher for cloud conflict detection (desktop) + startup reconciliation
- Self-event suppression (reuses `watcher.rs` echo pattern)
- Sync triggers: idle/blur/save/manual + frequency cap (Git)
- Persistent error model (states + error types + recovery actions)
- Automated commit messages via AI (explicit opt-in, template fallback)
- Unified Sync UI: status indicator, conflict cards (text + binary),
  history, restore version
- Plain-language setup wizard (no Git jargon)
- Local history works with sync off
- Platform availability reporting per provider
- Credential storage via OS keychain/keystore (gix credential callbacks)

Non-goals:
- Block-level Markdown merge (fast-follow)
- reconcile-text replacement (fast-follow if gix too coarse)
- Cloud provider APIs (folder-watching only)
- Mobile cloud-drive sync (platform limitation)
- Git hooks (validation in app logic)
- Branching/staging/remotes UI (fully hidden)
- Third-party sync provider extensions (later)

## Dependencies

- `extensions` epic — not blocking (see Enabling Work); migration target later
- `data-safety` epic — parallel, not blocking
- `ai` epic — optional; template fallback works without it
- `workspace-explorer` (done) — active workspace root, file tree
- desktop shell (done) — Tauri native bridge, activity bar, status bar

## Priority

1. **Auto Sync** (this epic) — highest priority
2. **Android app** (`pending-mobile-med-hard.md`)
3. **General file editing/viewing** — non-Markdown editor/explorer support

Priority = what the user cares about most, not what gets built first. Enabling
or stabilizing work for a priority item becomes urgent by proxy.

## Enabling work

Sync's native layer (gix, merge, hidden repo, watcher) is pure Rust in
`src-tauri` — needs nothing from the extension system. Three extension pieces
are pending (background tasks, extension settings, secret storage) but sync
doesn't wait for them.

**Build sync as a direct app feature first, migrate to extension boundary
later** — same pattern journal/calendar used. Sync writes to status bar
directly, manages watcher/timer lifecycle in the shell, uses existing settings,
stores Git credentials through a direct native keychain adapter. When
extension system's pending pieces land, sync migrates. The migration is a
refactor, not a rewrite — native layer and merge logic unchanged.

## Stories

Ordered by dependency. Contracts and cross-compilation first; providers build
on the orchestrator; UI last.

1. **Bundled gix engine + hidden repo** — replace system Git with gix, hidden
   repo in app-data, mirror vault, basic commit. Includes bootstrap matrix
   (new workspace, existing local, existing remote, both nonempty) and
   workspace identity. Replaces `gitService.ts` and `git.rs`.
2. **Sync orchestrator + provider trait** — `SyncProvider` trait, sync lock,
   provider selection, status reporting, self-event suppression (reuses
   `watcher.rs` echo pattern). Contracts before providers.
3. **Three-way merge → structured conflicts** — gix merge wrapper, `(base,
   ours, theirs)` → conflict result with `kind: "text" | "binary"` and
   `scope: "content" | "tree"`. Binary skips merge. Tree conflicts
   (rename/delete, modify/delete, path collisions) always go to UI.
4. **Git sync provider** — push/pull via gix + rustls, credential callbacks to
   OS keychain, plain-language setup wizard (no "remote"/"URL"/"clone"
   jargon).
5. **Cloud sync provider** — folder watcher, conflict-file detection patterns
   per provider, startup reconciliation scan, desktop only. Quiescence-based
   merge base checkpoint.
6. **Sync triggers** — idle/blur/save/manual + frequency cap, configurable in
   advanced settings. "Sync now" contract: save open editors → commit →
   fetch → merge → push, cancellable, waits for lock.
7. **Sync UI: status indicator + conflict cards** — status bar indicator with
   persistent error model (states + error types + recovery actions),
   conflict cards (keep-current/remote/both), expandable diff for text,
   metadata + thumbnail for binary.
8. **Sync UI: history + restore version** — friendly activity log, restore
   from hidden repo history. Works with sync off (local history only).
9. **Automated commit messages** — AI diff → message with explicit opt-in
   consent (sends diff content externally), template fallback, shown in Sync
   History.
10. **Platform availability + mobile** — per-provider platform reporting,
    foreground-only Git sync on mobile, "Desktop only" labels for cloud.
    gix + rustls cross-compilation validation on iOS/Android targets.

## Status

- ⬜ All stories pending. Epic is **WIP — concept under refinement**.
- Supersedes `wip-git-integration-low-hard.md` and child stories in
  `plans/git-integration/`. Those are stale; review for reusable scope before
  closing.

## Open questions

### Binary conflict "keep both" naming **[DECIDED]**

`name.ext` + `name (remote).ext`. "current"/"remote" labels match the conflict
UI, no collision with provider patterns.

### Sync lock granularity **[DECIDED — A]**

Per-workspace lock. Simplest correct option — one sync at a time per vault.
Revisit only if dogfooding shows large-vault syncs regularly blocking cloud
conflict resolution.

### gix merge quality on prose **[WIP — C]**

Track conflict rate continuously, no fixed deadline. Fast-follow to
reconcile-text when false-conflict rate (non-overlapping edits that conflict)
exceeds a threshold (~30%). Data-driven, no artificial deadline.

### Block-level Markdown merge timing **[WIP — C]**

Only build if gix merge proves too coarse. Optimization, not correctness —
conflict UI handles misses, no data loss risk in waiting.

### Conflict card UI surface **[DECIDED — B]**

Panel (right sidebar or bottom panel). Non-blocking, user resolves at their
pace, conflicts visible while editing. Toast supplements for initial awareness
("Sync found 2 conflicts — click to review").

### Status bar sync indicator **[DECIDED — A]**

Direct shell integration — sync writes to `StatusBar.tsx` directly. No new API.
Contribution point extracted later when a second feature needs status-bar
presence.
