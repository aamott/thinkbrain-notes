# Context-Aware Chat

## Goal

Give the AI chat access to the active note and workspace context so responses
are grounded in what the user is working on. Context is supplied by the host
through ACP capabilities; the agent decides how to use it.

## Acceptance Criteria

- [ ] Chat can include the active note's content as context.
- [ ] Chat can include workspace-scoped context (open notes, tags, links).
- [ ] Sending note content to a remote provider requires explicit user
      consent per request or via an "always allow" setting.
- [ ] Context inclusion is toggleable; user can chat with no context.
- [ ] No note content is sent remotely without consent (privacy rule).
- [ ] Local provider context flow works without any network call.

## References

- `plans/ai.md` — scope (context-aware chat), privacy/consent decisions
- `plans/archive/old-structure/deferred/ai.md` — context-aware chat direction
- `plans/archive/ai-synthesized-needs-review/todos/ai.md` — context via ACP
- Depends on: provider abstraction, ACP host integration, AI chat panel.
