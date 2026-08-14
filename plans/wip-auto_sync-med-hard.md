# Auto Sync

> **WIP — trimmed MVP plan.** This replaces the former all-provider sync epic with a small, testable first slice. It preserves the local-first and bring-your-own-sync principles without making every provider, platform, and merge policy part of the initial delivery.

## Goal

Give desktop users dependable local version history and one useful automatic sync path for Markdown notes, without requiring Git knowledge. Sync must be understandable, recoverable, offline-safe, and never block editing.

## Product decisions

### First delivery: local history plus Git sync

The first slice is desktop-only and uses the existing system Git decision. It provides:

- local version history even when no remote sync is configured;
- one workspace-level Git sync configuration;
- automatic sync on idle, with manual “Sync now” always available;
- plain-language status, errors, and conflict resolution;
- Markdown/text conflicts first; binary files are detected and surfaced as keep-current, keep-remote, or keep-both;
- a user-configurable commit-message template, defaulting to a timestamp and note count.

Cloud-folder sync, mobile support, multiple simultaneous providers, and embedded gix are deferred. They can be added after the first path is reliable and after the extension lifecycle supports long-running watchers and provider settings.

### No AI in the sync loop

Sync does not call AI by default and does not depend on the AI epic. Automatic commits happen as often as the configured sync policy allows; generating a remote-model message for each one is unnecessary for a notes app and risks both cost and privacy leakage.

The initial message is deterministic and local, for example `Auto-sync: 2026-08-13 23:54 (5 notes changed)`. Let the user customize the template. An optional future action may let the user request an AI-written message for a selected history entry or before a manual sync, with the existing AI consent flow; that is not part of Auto Sync MVP.

### Keep Git hidden, but do not replace the existing Git foundation yet

The UI remains provider-oriented rather than Git-oriented: Synced, Syncing, Needs attention, and Sync history. Reuse the existing system-Git native integration for the first slice. Revisit bundled gix only if installation friction, cross-platform support, or product requirements demonstrate that system Git is insufficient.

## MVP scope

### In scope

- Desktop Tauri app only.
- Hidden local history repository in app data, or an equivalent extension of the existing Git service, with workspace identity and safe initialization.
- Local commit after a user save/idle cycle; history remains available with sync disabled.
- One Git remote setup flow using plain language and existing credential storage.
- Idle trigger with debounce, frequency cap, coalescing, cancellation, and manual Sync now.
- Sync status model: idle, syncing, needs-attention, paused, off.
- Useful persisted errors: offline, authentication, rejected push, conflict, disk/quota failure, and partial failure.
- Pull/merge/push flow serialized by one workspace lock.
- Markdown/text conflict cards with keep-current, keep-remote, keep-both, and an explicit merge/edit path.
- Binary conflict cards with metadata and keep-current, keep-remote, or keep-both.
- History list with timestamp, changed-note count, and deterministic commit message.
- Restore a previous version of a note.
- Tests for initialization, idling/coalescing, lock behavior, error recovery, text conflicts, binary conflicts, and restore.

### Explicitly deferred

- OneDrive, Google Drive, Syncthing, or any folder watcher.
- Git plus cloud simultaneously.
- Mobile Git sync and all mobile platform reporting.
- Bundled gix migration.
- Tree-conflict automation beyond safe detection and surfacing.
- Block-level Markdown merge or reconcile-text.
- AI-generated automatic messages, AI consent settings specific to sync, and new AI plumbing.
- Extension-boundary migration, background tasks, and extension settings.
- Branching, staging, remotes, hooks, LFS, and other power-user Git controls.

## User experience

1. A workspace can have local history without a remote.
2. The user optionally chooses “Sync notes to another device” and connects one Git service or repository.
3. After an idle period, the app saves pending changes, creates a local version, and attempts sync subject to the frequency cap.
4. The status indicator reports the result without Git jargon.
5. If a conflict occurs, a non-blocking card explains the two versions and offers safe choices. No raw conflict markers are shown as the primary UI.
6. Sync history explains what happened and offers restore; editing remains available during retries and attention states.

## Technical boundaries

- Keep provider operations behind a small interface so a later cloud provider can be added without designing the full multi-provider system now.
- Keep merge and conflict results structured: text versus binary, with the minimum metadata needed by the UI.
- Use the existing atomic-write/expected-value safeguards when available; until then, do not claim crash-proof destructive writes.
- Do not put repository metadata in the vault or expose a `.git` directory to users.
- Treat remote authentication and network failures as recoverable states, not reasons to block local history.

## Stories

1. **Local history foundation** — establish workspace identity, initialize hidden app-data history safely, record deterministic local versions, and support history reads with sync off.
2. **Sync contract and state model** — define provider interface, workspace lock, status/error persistence, cancellation, retry boundaries, and test doubles.
3. **Git setup and one sync cycle** — reuse system Git, configure one remote with existing credential storage, and implement save → local version → pull/merge → push with plain-language errors.
4. **Idle and manual triggers** — add debounced idle sync, max-frequency cap, coalescing, cancellation, and always-visible Sync now.
5. **Conflict handling** — implement text conflict presentation and resolution plus binary keep-current/remote/both behavior; keep tree conflicts limited to safe detection and attention states.
6. **History and restore UI** — show deterministic activity entries and restore a selected note version without exposing Git concepts.
7. **Hardening and acceptance** — exercise offline/auth/conflict/retry paths, large edits, app restart, workspace bootstrap cases, and failure-safe writes on desktop.

## Open questions for story refinement

- Does local history commit on every explicit save, only after idle, or both with coalescing? Default proposal: explicit save marks pending; idle creates the version.
- Is the first remote setup limited to a pasted repository URL, or should a hosted-service picker be included? Default proposal: one generic repository flow; provider-specific sign-in later.
- Should restore replace the note immediately or open a preview/diff first? Default proposal: preview, then explicit confirmation.
- What is the minimum acceptable merge editor for the first release? Default proposal: keep-current/remote/both plus editable merged text; no generalized tree merge.
- Which existing Git service and credential APIs are stable enough to reuse before any gix decision is revisited?

## Relationship to existing plans

This plan aligns with the current app vision and technical decisions: desktop-first, local-first, system Git for MVP, and AI as an optional extension. On approval, the former Auto Sync epic should be replaced by this file; the gix, cloud-provider, mobile, and AI-message ideas should become separate future epics or stories rather than dependencies of the initial sync delivery.
