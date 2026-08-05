- name: ThemeProvider subscribes to getEffectiveValue result — may not re-render on staged changes
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/ThemeProvider.tsx
- lines: 38-48
- description: |
    `ThemeProvider` selects the theme via:
    ```
    const themeFromStore = useSettingsStore((s) => s.getEffectiveValue("appearance.theme"));
    ```
    `getEffectiveValue` (settingsStore.ts:452-460) is a *function on the store state object*, not a derived value stored in state. Zustand's `useStore(selector)` re-renders when the selector's *return value* changes by `Object.is`. Here the selector returns `s.getEffectiveValue("appearance.theme")`, which internally reads `stagedChanges`, `appValues`, `workspaceValues` at call time.

    This actually DOES work for re-rendering on staged theme changes, because `stageChange` (settingsStore.ts:313-321) calls `set({ stagedChanges: ... })`, producing a new state object, and the selector re-runs `getEffectiveValue` against the new state, returning the new staged value. So the subscription is functionally correct.

    However, there are two subtler issues:

    1. The selector calls a method that reads multiple slices (`stagedChanges`, `appValues`, `workspaceValues`). Zustand v4/v5 default equality is `Object.is` on the *return value* (the theme string), which is fine here because the theme is a primitive string. But this pattern is fragile: if `getEffectiveValue` ever returned an object (e.g. a structured theme config), `Object.is` would fail to detect changes and the provider would not re-render. The selector should ideally select the raw slices and compute the effective value in the component, or use `useShallow`.

    2. Type-safety: line 46-48 coerces `themeFromStore` (typed `unknown`) to `AppTheme` via `as AppTheme` after a `typeof === "string"` check. The `AppTheme` type (theme-context.ts:8) is `AppThemeSetting | (string & {})` — i.e. essentially any string. So the cast is safe today but the `string & {}` escape hatch means a corrupted stored value like `"purple"` (not a real theme) would be applied as `data-thinkbrain-theme="purple"` with no CSS to match, silently rendering unstyled. There is no validation that the stored/staged theme is one of the known `AppThemeSetting` values ("system" | "light" | "dark"). Consider validating against the appearance.theme enum definition before applying.

- verification: |
    Read ThemeProvider.tsx:38-48 — selector calls s.getEffectiveValue(...); result coerced via `as AppTheme`.
    Read settingsStore.ts:452-460 — getEffectiveValue reads stagedChanges/appValues/workspaceValues/registry default.
    Read settingsStore.ts:313-321 — stageChange set()s stagedChanges, triggering selector re-run.
    Read theme-context.ts:8 — AppTheme = AppThemeSetting | (string & {}), so any string is accepted.
