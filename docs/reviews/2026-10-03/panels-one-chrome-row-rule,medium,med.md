- name: One-chrome-row rule is adopted; Extensions and History still carry body chrome
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/Popout.tsx
- lines: 100-125; affected: extensions/ExtensionsPanel.tsx 106-119, sync/HistoryPanel.tsx 243-257
- description: |
  Rule adopted: exactly one chrome row per popout — PanelTitle (or the
  panel's own row when `ownsChrome`, i.e. the explorer). The workspace
  selector no longer gets its own row; in panel-headers placement its
  trigger mounts inside the title slot for `showWorkspaceSelector` panels
  (explorer draws it inline, search/journal via the portal outlet).
  Conflicts' duplicate h3 and hand-rolled ⋯ are gone — its options live in
  a menu-shaped PanelAction. Remaining deltas:
  - extensions: "Add from folder…" toolbar → a PanelTitle `plus` action.
  - history: keep the contextual file-name row (it names the open file,
    not the panel) but slim it to one line.
  Search and journal need nothing: their rows are functional, and journal's
  action row is the pattern done right.
- verification: Read each panel's top-of-panel JSX; counted header rows.
  Mockup section 2 at /tmp/explorer-mockup/index.html shows before/after.
