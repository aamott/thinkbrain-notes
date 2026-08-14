- name: panelRegistry exports used only by tests — renderDesktopPanel, getLeft/RightPanelContributions, isBuiltInLeft/RightPanel
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/panels/panelRegistry.tsx
- lines: 124-142, 345-371
- description: |
    Five exported helpers have no production callers (verified by grep across
    the whole repo excluding test files):

    - `renderDesktopPanel` (line 345) — production popouts call
      `contribution.factory(context)` directly; this helper is only used in
      `panelRegistry.test.tsx` (lines 142, 335, 338).
    - `getLeftPanelContributions` (line 364) — production uses the
      subscription hook `useLeftPanelContributions`; this synchronous getter is
      only used in `panelRegistry.test.tsx` (lines 101, 108) and
      `DesktopShell.test.tsx` (lines 47, 51).
    - `getRightPanelContributions` (line 369) — same pattern; only used in
      `panelRegistry.test.tsx` (lines 101, 108).
    - `isBuiltInLeftPanel` (line 124) and `isBuiltInRightPanel` (line 137) —
      only used in `panelRegistry.test.tsx` (lines 201-215). No production code
      needs to distinguish a built-in panel id from an extension panel id at
      runtime today.

    These are not part of any documented public extension API surface (the
    extension host uses `desktopPanelRegistry.register`/`get`/`entries` and the
    `useLeftPanelContributions`/`useRightPanelContributions` hooks). They can
    either be moved into the test files that use them, or dropped in favor of
    the registry's own `entries()`/`get()` methods in tests.

    Estimated savings: ~30 lines / ~250 tokens if moved to test helpers or
    inlined at call sites.
- verification: |
    `grep -rn "renderDesktopPanel\|getLeftPanelContributions\|getRightPanelContributions" .`
    — only matches in panelRegistry.tsx (definitions) and *.test.tsx files.
    `grep -rn "isBuiltInLeftPanel\|isBuiltInRightPanel" . --glob='!*.test.*'`
    — no matches outside the definition file.
- resolution: Deferred — high cost, low reward. Finding is stale: 4 of 5 named exports (renderDesktopPanel, getLeftPanelContributions, getRightPanelContributions, isBuiltInRightPanel) no longer exist in panelRegistry.tsx. The remaining export, isBuiltInLeftPanel, has a production caller in DesktopShell.tsx (line 724) and is not dead. Nothing to remove.
