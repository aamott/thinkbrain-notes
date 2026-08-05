- name: theme-context default setTheme is a silent no-op (not fail-loud)
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/theme-context.ts
- lines: 15-18
- description: |
    The default `ThemeProviderContext` value (lines 15-18) is:
    ```
    export const ThemeProviderContext = createContext<ThemeProviderState>({
      theme: "system",
      setTheme: () => null,
    });
    ```
    `useTheme` (lines 20-25) throws if the context is `undefined` — but the default value is NOT undefined, it's the object above. So a component calling `useTheme()` outside a `ThemeProvider` will get `theme: "system"` and a `setTheme` that silently does nothing (returns null). The user's theme change is swallowed with no error, no log.

    This violates the "fail loudly" rule. The guard at line 22 (`if (context === undefined)`) is dead because `createContext` with a non-undefined default never yields undefined.

    Recommended fix: either (a) type the context as `ThemeProviderState | undefined` and create with `createContext<ThemeProviderState | undefined>(undefined)` so the existing throw fires; or (b) make the default `setTheme` throw `"useTheme must be used within a ThemeProvider"` to fail loudly. Option (a) is the standard React pattern and makes the existing guard work.

- verification: |
    Read theme-context.ts:15-18 — createContext initialized with a real object (not undefined), setTheme is `() => null`.
    Read theme-context.ts:20-25 — useTheme checks `context === undefined`, which can never be true given the default above.
