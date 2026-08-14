- name: SettingsNav Application/Workspace group rendering is structurally identical — extract ScopeGroup
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsNav.tsx
- lines: 310-344
- description: |
    The "Application" group (lines 311-325) and the "Workspace" group
    (lines 327-343) render the same structure: a `<li role="treeitem"
    aria-expanded="true">` wrapping a header `<div>` (with the scope label as
    text) and a `<ul role="group">` mapping `ModuleGroup` over a list of
    modules. The only differences are:
      - the header label text ("Application" vs "Workspace")
      - the source list (`appModules` vs `workspaceModules`)
      - the Workspace group is conditionally rendered only when
        `workspaceValues !== null && workspaceModules.length > 0`

    A small `ScopeGroup` component (label + modules + onSelect) would
    collapse the two blocks into one mapped call:

    ```tsx
    <ScopeGroup label="Application" modules={appModules} … />
    {workspaceValues !== null && workspaceModules.length > 0 && (
      <ScopeGroup label="Workspace" modules={workspaceModules} … />
    )}
    ```

    This is a borderline compaction — only 2 call sites and the duplication
    is ~15 lines. The extraction is justified because the two blocks are
    structurally identical (not just similar), the call sites stay readable,
    and the conditional guard reads more naturally as a wrapper around a
    single component than as a duplicated block. Estimated savings: ~12
    lines net (after the new component definition).

    Not a bug; a maintainability nit. If the tree markup ever changes (e.g.
    adding a collapse toggle to scope groups), the duplication would require
    two synchronized edits.
- verification: |
    Read SettingsNav.tsx lines 310-344: the two `<li role="treeitem">`
    blocks differ only in label text and module list source. The
    `ModuleGroup` component (lines 127-154) is already extracted and reused
    by both, confirming the pattern is established in this file.
