- name: open-source-control and open-extensions commands marked unavailable but their panels are available
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/commands/commandRegistry.ts
- lines: 179-202
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/panelRegistry.tsx
- lines: 226-234, 245-251
- description: |
    Two commands are declared `unavailable` with prerequisite messages:

    - `open-source-control` (line 187): "Source control is unavailable until Git integration is connected."
    - `open-extensions`   (line 195): "Extensions are unavailable until the extension host is connected."

    But the corresponding panels are registered as available and selectable from
    the activity bar:

    - `source-control` panel (panelRegistry.tsx:226): `availability: () => true`,
      factory renders `<SourceControlPanel rootPath={rootPath} />`.
    - `extensions` panel (panelRegistry.tsx:245): no `availability` fn (defaults
      to true), factory renders `<ExtensionsPanel />`.

    The extension host is also bootstrapped in `main.tsx` (lines 16-23), so the
    "extension host is connected" prerequisite is already satisfied.

    The command palette shows these as "Unavailable" while the activity bar
    lets the user open the same surfaces — contradictory. They should either
    be wired (e.g. a `toggleSourceControl`/`toggleExtensions` command that
    calls `selectLeftPanel`, mirroring `toggle-explorer`) or removed if the
    panel-reveal path is sufficient.

    Note: `DesktopCommandContext.revealPanel` (line 38) only reveals right-side
    panels (`isSelectableRightPanel` check in DesktopShell.tsx:715), so it
    cannot be used as-is for these left-side panels.
- verification: |
    `grep -n "open-source-control\|open-extensions" commandRegistry.ts` shows
    both marked `unavailable`. `grep -n "source-control\|extensions" panelRegistry.tsx`
    shows both panels with `availability: () => true` or no availability fn.
    `main.tsx` lines 16-23 bootstrap the extension host unconditionally.
