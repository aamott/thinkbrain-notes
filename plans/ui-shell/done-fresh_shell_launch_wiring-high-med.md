# Fresh Shell Launch Wiring

## Goal

Wire the new mockup-v3 shell into the desktop startup path and browser harness
without depending on any deleted translated UI module or stylesheet.

## Acceptance Criteria

- [x] `App` and `main` load only the fresh shell, shared tokens, and the new
      global baseline stylesheet.
- [x] The browser harness checks current title-bar, workspace, panel, theme,
      palette, and keyboard behavior through accessible names.
- [x] The desktop shell contains no imports or references to deleted desktop
      UI/CSS modules.
- [x] A Vite launch/build and narrow desktop checks pass.

## References

- `apps/desktop/src/{App.tsx,main.tsx,shell/,agent/}`
- `apps/desktop/e2e/app.spec.ts`
- `mockup_v3/`
