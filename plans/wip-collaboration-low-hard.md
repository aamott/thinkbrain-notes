# Collaboration

> Real-time multi-user collaboration: co-editing, presence, and
> conflict-aware editing. **Bottom priority.** This is a stub epic — stories
> are sketched for scope only and are all `pending` / `low` urgency.
> Read `plans/app-vision.md` before starting any story here.
>
> **Direction (decided):** Local-first. Collaboration must not compromise the
> core principles. It would be nice if we figure out a way to make it work
> within the local-first/bring-your-own-sync model — but only if we can. This
> epic is exploratory, not committed.

## Goal

Enable multiple users to work on the same workspace simultaneously with
real-time co-editing, live presence (who is online, where their cursor is), and
conflict-aware editing that preserves each user's intent. The user experience
should feel like a shared editor, not a file-passing exercise.

## Scope

In scope (eventual):

- real-time co-editing of Markdown notes (concurrent edits merge without data loss)
- live presence indicators (online users, active file, cursor/selection)
- conflict-aware editing (CRDT or operational-transform merge layer)
- shared-workspace sessions (invite collaborators, join/leave)
- permission model (read-only vs. edit, per-workspace or per-file)
- comments / inline annotations tied to note content
- session lifecycle (start, persist, resume, end)

Non-goals (out of scope even for this epic):

- a proprietary hosted collaboration cloud run by the project
- replacing the "bring your own sync" model for single-user workflows
- real-time collaboration on non-Markdown / binary attachments
- full Git-based merge-conflict resolution UI (see `git-integration`)

## Architecture Decisions

### Direction: local-first, opt-in, P2P if possible

Real-time collaboration is in tension with the app's core principles (local
first, bring your own sync, no vendor lock-in). The decided direction:

- **Opt-in collaboration mode** — collaboration is an explicit, isolated mode
  the user enables per-workspace. The default remains single-user local-first.
  Single-user files never touch collaboration state.
- **Peer-to-peer (WebRTC + CRDT) preferred** — no central server beyond a
  signaling exchange. Sync state via CRDTs over P2P. Most aligned with
  local-first and no-vendor-lock-in. Hardest to build, but this is a stub epic
  with no timeline pressure.
- **Self-hosted / user-provided relay as fallback** — if P2P signaling proves
  impractical, the user runs (or points at) a relay/signaling server. The app
  never depends on a project-run cloud. This extends "bring your own sync" to
  real-time.
- **Never a project-hosted collaboration cloud.** This is a hard line.

Collaboration is a **separate architectural mode** distinct from the local-first
MVP, not a feature bolted onto it. If we can't make it work within these
constraints, the epic stays deferred.

### Likely shape

- A **CRDT layer** (e.g. Yjs / Automerge) over Markdown document state, so
  concurrent edits merge deterministically without a central authority.
- A **transport abstraction** in `packages/core` with swappable backends
  (P2P, user-hosted relay, etc.) — never wired directly into UI.
- **Presence as ephemeral state** — presence data is never written to the
  vault or the SQLite cache; it lives only in memory / session state.
- **Vault stays pure Markdown** — collaboration merge state/metadata must
  not pollute user files. Any CRDT metadata lives in app-data, not the vault
  (user-data separation rule).
- **CodeMirror 6 collaboration bindings** — the editor already uses CM6;
  collaboration binds to CM6 transactions via the CRDT layer.

## Dependencies

- No hard dependencies on other epics, but strongly informed by:
  - `extensions` — a trusted local extension API may be the cleanest way to
    ship collaboration as an opt-in module rather than core; soft capability
    declarations are compatibility gates, not isolation.
  - `note-model` — the Markdown document model and frontmatter handling must
    be stable before layering CRDT merge semantics on top.
- This epic is **bottom priority** and exploratory — not committed to ship.

## Validation

- To be defined once the architecture is chosen. At minimum:
  - Unit tests for the CRDT merge layer (concurrent edit scenarios).
  - Integration test: two sessions editing the same note converge.
  - Presence does not persist to disk or the vault.
  - Single-user (non-collaboration) mode is unaffected.

## Status

- ✅ Architectural direction decided — local-first, opt-in, P2P preferred, no project-hosted cloud
- ⬜ CRDT / merge layer for Markdown documents
- ⬜ Real-time co-editing in the CodeMirror 6 editor
- ⬜ Live presence indicators (online users, cursor/selection)
- ⬜ Conflict-aware editing (concurrent edits merge without data loss)
- ⬜ Shared-workspace sessions (invite, join, leave)
- ⬜ Permission model (read-only vs. edit)
- ⬜ Comments / inline annotations
- ⬜ Transport abstraction in `packages/core` (P2P / relay backends)
- ⬜ Collaboration state isolated from vault and SQLite cache
