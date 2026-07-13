# AI

> Future epic. Local and remote AI provider abstraction, ACP (Agent Client
> Protocol) integration, and AI-enhanced workflows. Not yet started — low
> urgency stub. Read `plans/app-vision.md`, `plans/technical-decisions.md`
> (AI section), and `.agents/skills/acp/SKILL.md` before starting any story
> here.

## Goal

Make AI an optional, privacy-respecting layer that enhances the note workspace.
Users can plug in local models (Ollama, LM Studio) or optional cloud providers
(OpenAI, Anthropic, Google, OpenRouter), chat with context-aware agents in the
right panel, and let AI assist with search, discovery, and editing — all behind
explicit user consent and never as a required dependency.

## Scope

In scope:

- AI provider abstraction (local + remote) in `packages/core`
- ACP (Agent Client Protocol) host integration — session lifecycle,
  capabilities, permission model
- AI chat UI in the desktop right panel (already scaffolded as a deferred
  placeholder in `App.tsx`)
- Model configuration (provider selection, local-vs-cloud, API keys)
- Context-aware chat based on the active note / workspace
- AI-assisted search and discovery (foundation for the `semantic-search` epic)

Non-goals (deferred or out of scope):

- mandatory AI — AI must always be optional
- proprietary agent communication protocol (use ACP, see the ACP skill)
- agent reasoning duplicated in the host (host stays deterministic)
- embeddings/semantic search as a standalone deliverable (tracked by the
  `semantic-search` epic, which may consume this epic's provider abstraction)
- mobile AI UI (Phase 2, tracked by the `mobile` epic)

## Architecture Decisions

### Provider abstraction lives in `packages/core`

A provider-agnostic interface in `packages/core` abstracts local and remote
model backends. No provider-specific logic leaks into UI components. This
mirrors the hub-and-spoke rule: UI in `apps/desktop` consumes core interfaces,
never a concrete provider SDK directly.

### ACP is the integration mechanism

Agent communication uses Agent Client Protocol (ACP), not a proprietary
protocol. The app acts as the ACP **host**: it exposes capabilities
(filesystem, terminal, permissions, session lifecycle) and stays deterministic.
It never duplicates the agent's reasoning, planning, or editing logic. See
`.agents/skills/acp/SKILL.md` and the spec at
https://github.com/zed-industries/agent-client-protocol. Prefer official ACP
SDKs over hand-rolled transport.

### Right panel is the desktop AI surface

The desktop UI shell already reserves a right panel (`<aside className="right-panel">`
in `apps/desktop/src/App.tsx`, currently a deferred placeholder). This epic
populates it with the ACP agent interface and AI chat. Mobile will later
translate this to a bottom sheet or "Assistant" tab (Phase 2, `mobile` epic).

### Privacy and consent

- AI is optional; cloud providers are optional.
- Local models are fully supported.
- Never send user notes to a remote provider without explicit user action and
  consent.
- No telemetry by default.

### Settings

Model/provider configuration extends the existing JSON settings model
(application + workspace levels). API keys and provider credentials must live
in OS app-data, never in the vault.

## Dependencies

- **`extensions` epic (prerequisite)** — provider abstraction is expected to
  build on the extension API + capability sandbox. Do not start provider work
  until `extensions` is active.
- **UI shell (done)** — the right panel placeholder already exists in
  `apps/desktop/src/App.tsx`; this epic enables it.
- **`semantic-search` epic (dependent)** — may consume this epic's provider
  abstraction for embeddings. Not a blocker for this epic.
- **`mobile` epic (dependent)** — mobile AI UI is Phase 2.

## Status

- ⬜ AI provider abstraction (local + remote) — `packages/core` (see
  `pending-provider_abstraction-low-hard.md`)
- ⬜ ACP host integration — session lifecycle, capabilities, permissions (see
  `pending-acp_integration-low-hard.md`)
- ⬜ AI chat panel — desktop right panel UI (see
  `pending-ai_chat_panel-low-med.md`)
- ⬜ Model configuration — provider selection, local-vs-cloud, credentials (see
  `pending-model_configuration-low-med.md`)
- ⬜ Context-aware chat — active note / workspace context (see
  `pending-context_aware_chat-low-med.md`)
- ⬜ AI-assisted search and discovery — foundation for `semantic-search` (see
  `pending-ai_assisted_search-low-hard.md`)
