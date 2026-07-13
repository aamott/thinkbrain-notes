# AI Chat Panel

## Goal

Populate the deferred desktop right panel with the AI chat / ACP agent
interface. The right panel placeholder already exists in
`apps/desktop/src/App.tsx` (`<aside className="right-panel">`); this story
enables it and wires it to the provider abstraction and ACP host.

## Acceptance Criteria

- [ ] Right panel renders an AI chat surface (message list + input).
- [ ] Chat uses the core provider abstraction; no provider SDK in the
      component.
- [ ] Streaming responses render incrementally.
- [ ] Panel can be shown/hidden (matching the existing UI shell layout).
- [ ] ACP permission requests surface as UI prompts (allow once / always /
      deny).
- [ ] No inline styles; CSS Module co-located with the component.
- [ ] State lives in a Zustand slice following the existing store pattern.

## References

- `apps/desktop/src/App.tsx` — right panel placeholder (line ~115)
- `plans/archive/old-structure/architecture/ui-shell.md` — right panel intent
- `plans/ai.md` — architecture decisions (right panel is the desktop AI surface)
- Depends on: provider abstraction + ACP host integration stories.
