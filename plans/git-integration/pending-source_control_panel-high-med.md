# Source-Control Sidebar Panel

## Goal

Add the source-control panel to the activity bar and left sidebar so users can
view status, stage/unstage, and commit — wiring together all the Git service
helpers into a single UI surface.

## Acceptance Criteria

- [ ] `ActivePanel` union in `appStore` gains a `"source"` value.
- [ ] The disabled "Source" activity-bar button in `App.tsx` is enabled and
      switches the sidebar to the source-control panel.
- [ ] `ActiveSidePanel` renders the new `SourceControlPanel` for
      `activePanel === "source"`.
- [ ] Panel states: Git not installed, not a repo (offer init), repo (show
      status + staging + commit + branch).
- [ ] Panel uses CSS Modules (`*.module.css`), no inline styles.
- [ ] Status list refreshes on panel open and after each mutating action.
- [ ] E2E / manual: open workspace → view Git status in the panel.

## Relevant Files

- `apps/desktop/src/App.tsx` — enable "Source" button, render panel
- `apps/desktop/src/stores/appStore.ts` — add `"source"` to `ActivePanel`
- `apps/desktop/src/git/SourceControlPanel.tsx` — new panel component
- `apps/desktop/src/git/SourceControlPanel.module.css` — new styles
- `apps/desktop/src/styles.css` — shared shell layout (reference)

## Notes

This is the integration story that ties the service helpers together. It
depends on the availability check, repo detection, status, stage/unstage,
commit, and branch list stories. Can be built incrementally alongside them
(skeleton first, then wired actions).
