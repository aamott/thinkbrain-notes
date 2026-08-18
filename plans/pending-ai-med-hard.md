# AI (Fable)

> Awaiting full planning pass (Opus 5). This is a fable — the narrative arc and
> concrete invariants only. Implementation details (files, commands, events,
> DTOs, test matrices) are deliberately absent and owned by the planning pass.
> Read `plans/app-vision.md` and the ACP skill before planning.

## Story

The assistant is a **true extension** that lives in the **right action items
menu** with its own icon, popping out from the right by default. It gives users
local-first agent chat via ACP, with the Rust host owning process lifecycle and
the renderer owning chat UI. No credentials cross into React; no host-side
planning/editing/merging; consent is explicit and scoped.

The arc, in order:

1. Core contracts & consent records (platform-neutral, no SDK/React/Tauri).
2. Agent registry & detection (allowlisted, local, non-blocking).
3. Native secret-store consumer boundary (AI consumes, extension owns storage).
4. ACP host & session lifecycle in Rust.
5. Provider configuration UI & metadata.
6. Native model gateway.
7. Agent text-streaming renderer/runtime.
8. Desktop thread & local history.
9. ACP capability enforcement.
10. ACP permission-consent UI.
11. Opted-in model context.
12. Assistant extension registration handoff.
13. AI-assisted discovery bridge (last; semantic-search remains owner).

## Feature areas to plan

Each is a surface Opus 5 must decompose. Concise callouts only — not specs.

- **UI design & mockup**: dev has specific instructions for the chat surface
  (shadcn primitives, right-side placement). Planner should ask the dev for
  these before designing; do not invent layout.
- **Model selection**: how a user picks a model for a thread/turn. Interacts
  with harness and profile selection.
- **Harness selection**: initial harnesses — Claude Code (with ACP extension),
  Codex (with ACP extension), Devin CLI, Mistral Vibe (ACP built in). Future:
  pydantic-ai-harness and others. Planner defines the harness abstraction;
  dev implements each.
- **Model autodetect**: `HarnessProvider` and `list_models` are ACP standard
  methods; Devin is compatible. Use these for autodetect, not custom probing.
- **Model autodetect fallback**: separate per-harness. Each harness module owns
  its fallback chain when `list_models` is unavailable or fails.
- **Harness autodetect**: do not list a harness that isn't installed. Detection
  is local, non-blocking, no subprocess spawn, no network.
- **Profile selection**: a profile binds harness + model + settings presets.
  Planner defines the profile shape and switching UX.
- **File attachments**: how users attach files to a prompt. Uses the
  `attachment` shadcn primitive for the chip/marker UI.
- **Context & cost tracking**: token/context usage and cost visibility per turn
  and per thread. Planner defines what's tracked and where it surfaces.
- **Tool call tracking & approvals**: render tool calls in-thread; approvals
  flow through ACP permission-consent UI (arc step 10). Planner defines the
  in-thread affordances.

### Harness module pattern (locked method)

Each harness is added by a single harness module file. That module dictates
which features are implemented and contains any workarounds or harness-specific
code. **Any workaround must be specifically approved by the dev, one at a time.**
None are approved during planning — only the overall method per harness is
approved. The planner describes the method; the dev approves workarounds
individually during implementation.

## Concrete invariants (locked)

- **ACP protocol**: use the official `agent-client-protocol` Rust crate. The
  host is deterministic — it transports, validates, enforces, returns
  conflicts; it never reasons, plans, edits, or merges for an agent.
- **Chat UI primitives**: install shadcn conversational primitives via
  `pnpm dlx shadcn@latest add message-scroller message bubble attachment marker`
  (see https://www.infoq.com/news/2026/08/shadcn-conversational-primitives/).
  These are the building blocks for the chat surface.
- **Extension model**: true extension, not a built-in. Installable/removable,
  registered through the extension host's canonical APIs. The extension owns
  the assistant panel contribution, chat behavior, and a scoped credential
  consumer capability — not OS secret storage, ACP process lifecycle, or
  provider transport.
- **Placement**: right action items menu, icon present, pops out from the right
  by default. Not in the left action bar.
- **Styling**: Tailwind utilities + `--tn-*` tokens across all AI surfaces.
  shadcn primitives are Tailwind-based; this is non-negotiable for the chat UI.
  (Supersedes any prior CSS Modules guidance for AI.)
- **ACP reference implementation**: during dev and planning, clone
  https://github.com/agentclientprotocol/rust-sdk as a reference — it has
  examples of host/client patterns. Delete the clone when done; do not vendor
  it or add it as a dependency.

## Architectural invariants

- `packages/core/src/ai/` is platform-neutral: values/contracts only, no
  React/Tauri/SDK/filesystem/secret-store imports.
- All renderer IPC goes through `apps/desktop/src/native/`; components never
  call Tauri directly.
- Rust owns provider calls, credentials, network policy, ACP process/session
  lifecycle, and permission enforcement.
- Secrets stay in the extension-owned native secret store. AI consumes a scoped
  boundary; no duplicate keychain, no fallback, no renderer secret reads.
- Cloud model/context consent is explicit and separate from ACP capability
  permission. A stored credential or installed agent is not consent.
- Local-only flows work offline; remote flows are visibly consented and
  cancellable.
- Tauri Mobile reuses the same React/core/native adapters; desktop
  PATH/process assumptions must be explicit and degrade gracefully.

## STOP gates (product questions for Opus 5 to resolve)

- Streaming MVP: unavailable state shape, mid-run agent switching, retry/abort
  label exposure, whether a user thread owns an ACP session.
- History: global vs workspace-scoped, create/rename/delete/clear UX, whether
  deleting history closes an ACP session, tool-activity visibility, mobile
  retention on logout/uninstall.
- Provider UI: supported providers/endpoints, connectivity probe policy, model
  switching scope (turn vs thread), copy/layout for unavailable/error/narrow/
  mobile states.

No UI mockup or implementation of these surfaces until answers are recorded.

## Current state (as inspected)

- ✅ Assistant panel foundation exists (visual shell only).
- ⬜ `AssistantPanel.tsx` is a visual-only placeholder; composer disabled; no
  runtime behavior.
- ⬜ `panelRegistry.tsx` has an `assistant` panel contribution (left-side
  framing — will need to move to right action items menu per invariants).
- ⬜ Rust has `agent-client-protocol = "1.2"` in `Cargo.toml`/lock but no ACP
  module, commands, events, or lifecycle.
- ⬜ No `packages/core/src/ai/`, provider gateway, secret consumer, history
  adapter, or consent records exist.

## What Opus 5 owns

Everything not listed above: file paths, Tauri command/event names, DTO shapes,
test matrices, acceptance checkboxes, story decomposition, dependency edges,
and the actual planning of each arc step. This fable is the head-start, not the
plan.
