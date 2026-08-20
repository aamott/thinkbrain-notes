# Auto Sync

> Reviewed 2026-08-16; approved 2026-08-16, all decisions settled. Supersedes
> `wip-git-integration-low-hard.md` + `plans/git-integration/` — that work is
> **removed, not migrated**. The plan docs were already gone; the code
> (`gitService.ts`, `SourceControlPanel.tsx`, the Rust `commands/git` module,
> panel registration) is already deleted. `app-vision.md` now says bundled gix;
> there is no
> `technical-decisions.md` to update — it was deleted in an earlier cleanup,
> and these decisions live here instead.

## Vision

Nontechnical users merge files confidently. Any cloud daemon (OneDrive, Google
Drive, Syncthing…) syncs the vault; we detect the conflict files daemons create
and resolve them in a friendly UI. Git (bundled gix) is the one sync we drive
ourselves — push/pull, zero jargon. Many file types; binaries handled honestly
(no fake diffs). Desktop, Android, iOS from one codebase.

**Invariant — every resolution is undoable.** Both versions are committed to
the hidden repo *before* any resolution writes to the vault. Wrong click →
restore from History. This is what earns the UI its casual tone.

## Decisions

- **gix (bundled), not system git.** Must compile on desktop/Android/iOS;
  system git doesn't exist there. Auth is therefore ours: OS keychain via gix
  credential callbacks — needed only for push/pull, nothing else.
- **Hidden repo per workspace in OS app-data.** Never in vault, never syncs.
  Serves: git-sync repo, merge base, version history. Commits regardless of
  sync config — history/restore work offline with zero setup.
- ~~**Vault already containing `.git`:** detect, never touch, one settings
  notice ("This vault has its own Git repo — Auto Sync won't touch it").~~
  **Superseded** — see "Vault already containing `.git`, revised" below.
- **Vault already containing `.git`, revised:** record it like any other, and
  say so. The original conflated two things: never touching someone's own
  repository, and declining to keep any history for their notes. The first is
  right, and it keeps itself — ours lives in app data, and the vault walk
  already skips every dot-directory, `.git` among them, so nothing of theirs
  is ever read or written. The second turned the whole feature off for the
  people most likely to want it: a notes folder under version control is
  exactly the folder most likely to also be inside a sync folder, and they
  were getting no conflict detection, no history and no restore. The status
  footer and the History panel now say that a second history is being kept.
  Found by opening a vault that had a `.git` and being told nothing needed
  attention, with no way to learn why.
- **Merge depth: three-way only where the base is exact** (git sync — gix
  three-way merge). Cloud conflict files → **two-way**: show both versions,
  user picks/combines. No base guessing, no quiescence heuristics. Three-way
  for cloud is a fast-follow gated on observed conflict volume (local-only
  metric; no telemetry).
- **Conflict kinds:** `text` (full merge UI) | `binary` (metadata +
  thumbnails, keep one/both). Tree conflicts (rename/delete, path collisions,
  case-only renames) deferred until three-way-for-cloud.
- **No provider abstraction.** Passive detection is a filename-pattern table
  (OneDrive/Google Drive/Syncthing tested; Dropbox/Nextcloud/iCloud
  best-effort rows). Git code stays git code. Extract a trait when a second
  *active* provider exists.
- **Concurrency:** resolution/sync writes serialized per workspace (mutex).
- **Errors:** 3 states (Synced / Syncing / Needs attention) + last-error
  message + Sync History entries. Principle: every error names a recovery
  action ("Sign in again", "Free up space"). Taxonomy grows from real
  failures, not upfront.
- **Git triggers:** on-idle (debounced) + manual "Sync now" + frequency cap
  (default 1/min). Blur/save triggers later.
- **Commit messages: template only** — `Sync 2026-08-16 09:31 — 3 notes
  changed`. Custom template setting later. No AI (non-goal).
- **UI: triage cards + full merge tab** (mockup:
  `plans/auto-sync/merge-ui-mockup.html`). Chunk choices labeled **by source**
  ("Keep this computer's" / "Keep OneDrive's" / "Keep both"), never by
  position — panes sit side-by-side on desktop, stacked on mobile.
- **One Sync feature, two jobs.** Cloud rescue + git sync share one hidden repo,
  merge engine, and conflict UI — but two activity-bar items name the jobs:
  **Two versions** (choose between copies from git or a cloud folder) and
  **Saved versions** (local change history and restore). Settings split the
  transports: **Cloud copies** (app-wide, passive detection) and **Git link**
  (per workspace). Not two extensions and not Git-vs-OneDrive as two products.
- **Settings/credentials placement:** remote URL + sync prefs in workspace
  settings (OS app-data); token in OS keychain only. No git CLI, no
  `.gitconfig`, nothing written to the vault.
- **Direct app feature first, extension later.** Extension background
  tasks/settings/secret storage aren't shipped; sync uses shell lifecycle,
  writes to status bar directly, direct native keychain adapter. Migration is
  a refactor — native layer unchanged.
- Watcher reuse: detection builds on shipped `watcher.rs` +
  `record_self_write` echo suppression.

## Non-goals

AI commit messages (if ever: an AI-epic extension decorating Sync History —
never a sync dependency) · three-way cloud merge (fast-follow) · tree
conflicts · block-level Markdown merge · reconcile-text · cloud provider APIs
(folder-watching only) · mobile cloud daemons · git hooks/branching/staging UI
· third-party sync provider extensions.

## Stories (`plans/auto-sync/`, dependency order)

0. `pending-gix_engine_hidden_repo-high-hard.md` — engine, hidden repo,
   bootstrap matrix, auto-commit, checkpoint API
2. `pending-cloud_conflict_detection-high-med.md` — pattern table, watcher
   integration, startup scan, cleanup protocol
3. `pending-merge_engine-high-hard.md` — three-way (git) / two-way (cloud) →
   structured chunks; buffer rule; workspace mutex
4. `pending-merge_ui-high-hard.md` — cards + merge tab, per-type behavior,
   source-based labels
5. `pending-sync_status_history_restore-high-med.md` — status pill, friendly
   history, restore previous version
6. `pending-git_remote_sync-med-hard.md` — push/pull, keychain, plain-language
   setup, triggers
7. `pending-history_pruning-low-med.md` — retention/size policy, gc
8. `pending-mobile_cross_compile-med-easy.md` — CI validation on
   Android/iOS targets
9. `pending-provider_sign_in-low-hard.md` — "Sign in with GitHub" alongside
   the token form; same keychain path as story 6c

## Status

- ✅ Approved; `app-vision.md` reconciled; old git-integration code removed.
- ✅ Story 0 (the `gix` build spike, split off the front of story 1). gix
  cross-compiles for Android and iOS, and CI keeps it that way.
- ⬜ Stories 1–9 pending.
