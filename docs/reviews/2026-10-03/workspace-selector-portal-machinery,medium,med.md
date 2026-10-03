- name: Workspace selector placement requires a portal/context apparatus across five files
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/workspace/WorkspaceSelectorPortal.tsx
- lines: 1-80; also DesktopShell.tsx 100-123, LeftPopout.tsx, Popout.tsx 95-97, TitleBar.tsx 137, PhoneDrawer.tsx 76
- description: |
  Moving one dropdown between title bar, panel header, and phone drawer costs:
  a provider + outlet registration context + a render-prop portal, a
  `workspaceSelectorInPanel` prop threaded DesktopShell → LeftPopout → Popout,
  three variant class records (selectorRootClasses/selectorTriggerClasses/
  selectorMenuClasses), a `showWorkspaceSelector` flag on panel contributions,
  and a re-export of WorkspaceSelector through WorkspaceExplorer. Options:
  (a) pick one canonical placement per shell and delete the portal + variant
  system; (b) keep placements but have each shell render <WorkspaceSelector>
  directly with props passed down, which removes the DOM portal entirely;
  (c) at minimum, collapse the three parallel variant Records into one
  Record<variant, {root, trigger, menu}> and move WorkspaceSelector out of
  WorkspaceExplorerView into its own file.
- verification: Grep WorkspaceSelectorOutlet/workspaceSelectorInPanel —
  36 matches across 9 files for a single dropdown's placement.
