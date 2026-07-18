# Mockup v3 Shell Rebuild

## Goal

Create the production desktop workspace shell afresh from `mockup_v3/` without
restoring, importing, inspecting, or reusing any previous desktop UI or CSS.

## Acceptance Criteria

- [x] The title bar, title-bar tabs, action rail, side popouts, editor surface,
      status bar, bottom panel, and keyboard shortcuts express the mockup-v3
      interaction model with accessible semantic controls.
- [x] Every production visual rule lives in co-located CSS Modules and consumes
      `packages/ui` `--tn-*` semantic tokens; production contains no Tailwind
      classes, JSX style props, or copied mockup source.
- [x] The shell uses a scoped CSSOM ref for the two dynamic pane width custom
      properties, with CSS Module fallbacks and min/max constraints.
- [x] Explorer, search, settings, Git, tags, extensions, backlinks, graph,
      browser, terminal, and agent surfaces state their real dependency or an
      honest unavailable condition; mock data is not presented as user data.
- [x] The right assistant slot mounts only the dedicated `agent/AssistantPanel`
      integration boundary.
- [x] Desktop typecheck and build are run, with unrelated baseline failures
      recorded in this epic rather than masked.

## References

- `mockup_v3/`
- `.agents/AGENTS.md`
- `plans/technical-decisions.md`
- `apps/desktop/src/shell/`
