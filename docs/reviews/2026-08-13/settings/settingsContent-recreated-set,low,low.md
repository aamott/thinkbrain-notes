- name: SettingsContent recreates HIDDEN_KEYS_IN_THEME_SECTION Set on every render
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/SettingsContent.tsx
- lines: 155-158
- description: |
    `HIDDEN_KEYS_IN_THEME_SECTION` is declared inside the `SettingsContent`
    component body and re-allocated as a `new Set(...)` on every render. The
    set contents are constant — they do not depend on props or state. Moving
    it to module scope (next to the component) eliminates the per-render
    allocation and GC churn.

    This is a minor perf issue, not a bug. The set is small (2 entries) and
    the `.has()` check is only called for the `appearance.theme` section, so
    the impact is negligible. Still, hoisting a constant is a trivial win
    with no readability cost.

    Fix:
    ```ts
    const HIDDEN_KEYS_IN_THEME_SECTION = new Set([
      "appearance.theme",
      "appearance.themeFile"
    ]);
    ```
    at module scope, then reference it inside the component without `const`.
- verification: |
    Read SettingsContent.tsx lines 155-158: the `new Set(...)` is inside the
    `SettingsContent` function body, after the early-return for
    `activeSection === null` but before the JSX. No closure variable makes
    it depend on render scope.
