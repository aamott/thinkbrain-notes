# Auto Sync

> Reviewed 2026-08-16; approved 2026-08-16, all decisions settled. Supersedes
> `git-integration` + `plans/git-integration/` — that work is
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
  system git doesn't exist there. Auth is therefore ours: platform credential
  stores via gix callbacks — needed only for push/pull.
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
- **Automatic schedule:** wait for both a quiet workspace and the minimum gap
  since the last attempt (defaults: 30s and 60s). Sync-on-open is gated by the
  last successful sync; leaving triggers a best-effort sync attempt. These
  rules are shared across desktop and Android. The earlier `sync.trigger` policy was
  superseded by `docs/superpowers/specs/2026-08-28-sync-schedule-design.md`.
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
- **Settings/credentials placement:** remote URL in workspace settings, sync
  preferences in app settings (both in OS app-data); tokens in the platform
  credential store only. No git CLI, no
  `.gitconfig`, nothing written to the vault.
- **Direct app feature first, extension later.** Extension background
  tasks/settings/secret storage aren't shipped; sync uses shell lifecycle,
  writes to status bar directly, and a native credential-store adapter. Migration is
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

0. `gix_engine_hidden_repo` — engine, hidden repo,
   bootstrap matrix, auto-commit, checkpoint API
2. `cloud_conflict_detection` — pattern table, watcher
   integration, startup scan, cleanup protocol
3. `merge_engine` — three-way (git) / two-way (cloud) →
   structured chunks; buffer rule; workspace mutex
4. `merge_ui` — cards + merge tab, per-type behavior,
   source-based labels
5. `sync_status_history_restore` — status pill, friendly
   history, restore previous version
6. `git_remote_sync` — push/pull, credential stores, plain-language
   setup, triggers; 6e onboarding import is
   `auto-sync/workspace_from_git_link`; 6f import
   sign-in parity is `auto-sync/import_sign_in_parity`
7. `history_pruning` — retention/size policy, gc
8. `mobile_cross_compile` — CI validation on
   Android/iOS targets; local Android NDK validation
9. `provider_sign_in` — "Sign in with GitHub" alongside
   the token form; same keychain path as story 6c
- UX follow-up (after 6): `workspace_selector_git_badge`
  — plain vs Git-linked cue in the workspace selector (icon Choice B)

## Status

- ✅ Approved; `app-vision.md` reconciled; old git-integration code removed.
- ✅ Story 0 (`gix` build spike, split off the front of story 1).
- ✅ Story 6 (Git Remote Sync: 6a send-pack, 6b round trip, 6c credentials, 6d link UX, 6e workspace import, 6f import sign-in parity, selector git badge).
- ✅ Story 8 (Mobile cross-compile validation in CI & local Android NDK).
- ✅ Android private Git access: Android Keystore-backed credential storage
  and a private GitHub import/edit/sync/restart round trip verified on an
  emulator on 2026-09-20. Physical hardware remains a useful validation pass;
  see `mobile/android_anonymous_clone`.
- ✅ Story 3 (Merge Engine). Its three-way half landed inside story 6 rather
  than on its own — the merge resolves what it can and leaves only genuine
  overlaps as copies, which the two-way path already handles.
- 🟨 Stories 2, 4 and 5 are substantially built. Remaining: provider fixtures
  and Windows verification for story 2; image thumbnails and merge-tab
  self-closing for story 4; Windows verification for story 5. See each story.
- 🟨 Story 7 has fixed retention, size reporting and local undo clearing;
  configurable policy and packed-object compaction remain decisions.
- ⬜ Story 9 (GitHub provider sign-in) remains optional future UX; the manual
  token flow supports GitHub, GitLab and other HTTPS hosts.
