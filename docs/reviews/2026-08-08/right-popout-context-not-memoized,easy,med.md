- name: RightPopout does not memoize DesktopPanelContext, re-rendering all kept-mounted right panels on every parent render
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/RightPopout.tsx
- lines: 28-46
- description: |
    `RightPopout` constructs a fresh `context: DesktopPanelContext` object literal on
    every render (lines 31-46). Unlike `LeftPopout` (which wraps the same object in
    `useMemo` with an explicit comment that a fresh object would re-render every
    kept-mounted panel — LeftPopout.tsx:31-37), `RightPopout` does not memoize.
    Because right-side panels with `keepMounted: true` (outline, properties,
    assistant) are rendered inline via `renderDesktopPanel(panelContribution,
    context)` (line 78) without a `memo` boundary, every parent render (e.g. from
    `documentContents` changes, activity-bar switches, or shell state updates)
    re-renders all kept-mounted right panels even when `context` is unchanged.

    The outline and properties panels process `documentContents` and would recompute
    on every such render. The assistant panel is behind a lazy/Suspense boundary so
    it is less affected, but the outline and properties panels are not.

    `LeftPopout` also wraps each panel in a `memo`-ized `MountedPanel` component
    (LeftPopout.tsx:86-105); `RightPopout` renders plain `<div>` wrappers with no
    memoization (RightPopout.tsx:72-80), so there is no render boundary to cut
    updates either.
- verification: |
    Read RightPopout.tsx (lines 28-84) and confirmed `context` is a plain object
    literal rebuilt each render with no `useMemo`, and panels are rendered in plain
    `<div>` wrappers with no `memo`. Read LeftPopout.tsx (lines 30-37, 86-105) and
    confirmed the deliberate `useMemo` on `context` and the `memo`-wrapped
    `MountedPanel` component that RightPopout lacks.
