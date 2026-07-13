# Collaboration

> Real-time multi-user collaboration: co-editing, presence, and
> conflict-aware editing. This is the farthest-future epic and a **stub** —
> stories are sketched for scope only and are all `pending` / `low` urgency.
> Read `plans/app-vision.md` before starting any story here.

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

> ⚠️ **Open issue — needs manager decision.** Real-time collaboration is in
> direct tension with the app's core principles:
>
> - **Local First** — "Everything works offline. Internet features are
>   optional." Collaboration is inherently online and stateful.
> - **Bring your own sync** — "No cloud sync. No proprietary cloud backend
>   assumptions." Real-time co-editing requires *some* relay/coordination
>   service (even a peer-to-peer one needs signaling).
> - **Privacy / no vendor lock-in** — A hosted collaboration backend would
>   reintroduce a central dependency the project explicitly avoids.
>
> Collaboration therefore likely requires a **separate architectural mode**
> distinct from the local-first MVP, rather than a feature bolted onto it.
> Possible directions (to be decided before this epic is started):
>
> 1. **Self-hosted / user-provided relay** — the user runs (or points at) a
>    relay/signaling server; the app never depends on a project-run cloud.
>    Consistent with "bring your own sync" extended to real-time.
> 2. **Peer-to-peer (WebRTC + CRDT)** — no central server beyond a signaling
>    exchange; sync state via CRDTs over P2P. Most aligned with local-first,
>    hardest to build and operate.
> 3. **Opt-in collaboration mode** — collaboration is an explicit, isolated
>    mode the user enables per-workspace; the default remains single-user
>    local-first. Single-user files never touch collaboration state.
>
> None of these is decided. This epic should not be started until the manager
> resolves the architectural direction and updates this section.

### Likely shape (subject to the decision above)

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
  - `extensions` — a capability-sandboxed extension API may be the cleanest
    way to ship collaboration as an opt-in module rather than core.
  - `note-model` — the Markdown document model and frontmatter handling must
    be stable before layering CRDT merge semantics on top.
- This epic is blocked on the **architectural-direction decision** above.

## Validation

- To be defined once the architecture is chosen. At minimum:
  - Unit tests for the CRDT merge layer (concurrent edit scenarios).
  - Integration test: two sessions editing the same note converge.
  - Presence does not persist to disk or the vault.
  - Single-user (non-collaboration) mode is unaffected.

## Status

- ⬜ Architectural direction decided (local-first vs. collaboration tension) — **blocked on manager decision**
- ⬜ CRDT / merge layer for Markdown documents
- ⬜ Real-time co-editing in the CodeMirror 6 editor
- ⬜ Live presence indicators (online users, cursor/selection)
- ⬜ Conflict-aware editing (concurrent edits merge without data loss)
- ⬜ Shared-workspace sessions (invite, join, leave)
- ⬜ Permission model (read-only vs. edit)
- ⬜ Comments / inline annotations
- ⬜ Transport abstraction in `packages/core` (P2P / relay backends)
- ⬜ Collaboration state isolated from vault and SQLite cache
