import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { parseThemeFile, type AppThemeSetting, type ThemeBase } from "@thinkbrain/core";
import { useSettingsStore } from "./settingsStore";
import { readThemeFile } from "./themeAdapter";
import { injectThemeOverrides, removeThemeOverrides } from "./themeInjection";
import { useEffectiveValue } from "./useEffectiveValue";

// Support system, light, dark, and potentially custom imported themes later.
// `AppTheme` extends `AppThemeSetting` with the `(string & {})` escape hatch so
// future custom themes can flow through the same context without a breaking
// change, while persistence still uses the strict `AppThemeSetting` union.
export type AppTheme = AppThemeSetting | (string & {});

export interface ThemeProviderState {
  readonly theme: AppTheme;
  readonly setTheme: (theme: AppTheme) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  // Fail loudly if `useTheme` is consumed outside a `ThemeProvider`. A silent
  // no-op here would mask the missing-provider bug (theme changes would
  // appear to do nothing). Throwing surfaces it immediately at the call site.
  setTheme: () => {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
});

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeProviderState {
  // The context always has a default value (with a throwing `setTheme`), so
  // `useContext` never returns `undefined` here — the missing-provider case is
  // surfaced by the throwing default setter when the consumer calls it.
  return useContext(ThemeProviderContext);
}

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Theme used until the settings store finishes loading (defaults to "system"). */
  readonly defaultTheme?: AppTheme;
}

/**
 * A React context provider that applies the selected theme to the root element.
 *
 * Theme is read from the Zustand settings store (`appearance.theme` effective
 * value). On mount (inside Tauri), the provider triggers `loadSettings` so
 * the store hydrates from the native app
 * settings file. Theme changes are **staged** into the store via `stageChange`
 * (per epic design decision #4: single Save button); the DOM attribute updates
 * immediately because the provider re-renders on store change, but persistence
 * is deferred to `saveSettings()` in the settings tab.
 *
 * In non-Tauri contexts (tests, plain browser previews) the native load is
 * skipped and the `defaultTheme` prop is used.
 *
 * The theme is applied via the `data-thinkbrain-theme` attribute on the root
 * element so CSS can branch on light/dark/system without JS resolution. The
 * "system" value is handled in CSS through `@media (prefers-color-scheme)`.
 *
 * Custom theme files (`appearance.themeFile`): when set to a non-null path,
 * the provider reads the file via the native fs bridge, parses it with
 * `parseThemeFile`, and injects its token overrides via `injectThemeOverrides`.
 * The theme file's `base` field takes precedence over the user's `theme`
 * dropdown — the effective base is computed synchronously from the cached
 * file base, and a single effect writes the `data-thinkbrain-theme` attribute.
 * If parsing fails, diagnostics are logged loudly, overrides are removed, and
 * the user's selected theme drives the attribute again. When `themeFile` is
 * cleared, overrides are removed and the user's selected theme drives the
 * attribute.
 *
 * **Single source of truth:** The effective base is computed in one place
 * (`effectiveTheme` below) from `{ userTheme, themeFileBase }`. One effect
 * writes the DOM attribute. A separate effect handles the async file
 * read/parse and updates `themeFileBase` state — it never touches the DOM
 * attribute directly. This eliminates the effect-race and stale-base bugs
 * that arise when two effects both write the same attribute.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const stageChange = useSettingsStore((s) => s.stageChange);

  // The hook subscribes to the raw value maps before resolving the value so
  // staged or loaded changes trigger a render.
  const themeFromStore = useEffectiveValue("appearance.theme");
  // Resolve the display theme: use the store value once loaded, else the prop
  // default. The store value is `unknown` (typed as the registry default), so
  // coerce to the AppTheme string union.
  const theme: AppTheme = loaded && typeof themeFromStore === "string"
    ? (themeFromStore as AppTheme)
    : defaultTheme;

  // A staged non-string value (e.g. null) clears the file.
  const themeFileFromStore = useEffectiveValue("appearance.themeFile");
  const themeFile: string | null =
    loaded && typeof themeFileFromStore === "string" && themeFileFromStore.length > 0
      ? themeFileFromStore
      : null;

  // The parsed theme file's base, cached from the last successful async read.
  // When non-null, it takes precedence over the user's `theme` selection — the
  // custom theme commits to a base palette, and the scoped override selector
  // only matches when `data-thinkbrain-theme` equals the file's base.
  // When null (no file, parse failure, or still loading), the user's `theme`
  // selection drives the attribute. This is the single source of truth for the
  // effective base — no other code path writes the attribute.
  const [themeFileBase, setThemeFileBase] = useState<ThemeBase | null>(null);

  // The effective theme: when a themeFile is active, its cached base takes
  // precedence over the user's selection. When no file is active (or it hasn't
  // loaded yet), the user's selection drives. Computed synchronously so the
  // DOM attribute is always consistent with the React tree — no async gap.
  // The `themeFile !== null` guard short-circuits stale `themeFileBase` values
  // when the file is cleared, so the effect doesn't need to call
  // `setThemeFileBase(null)` synchronously (which would trip the
  // `react-hooks/set-state-in-effect` lint rule).
  const effectiveTheme: AppTheme = themeFile !== null ? (themeFileBase ?? theme) : theme;

  // Track the user's theme selection in a ref so the async file-read effect can
  // reference it in log messages without depending on it (which would trigger a
  // redundant disk re-read on every theme toggle).
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  // Load settings from native storage on mount (Tauri only). The ref guard
  // prevents double-load in StrictMode or fast re-mounts.
  const loadStartedRef = useRef(false);
  useEffect(() => {
    if (!isTauri()) return;
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    loadSettings(null).catch((error: unknown) => {
      // Fail loudly: a settings load failure should be visible, not silent.
      console.error("[ThemeProvider] Failed to load settings from native store:", error);
    });
  }, [loadSettings]);

  // Single effect that writes the `data-thinkbrain-theme` attribute. This is
  // the ONLY place the attribute is written — no race, no stale base. The
  // effective theme is computed synchronously above, so the DOM always matches
  // the React state.
  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.thinkbrainTheme = effectiveTheme;
  }, [effectiveTheme]);

  // Async effect: read and parse the theme file, inject/remove overrides, and
  // update `themeFileBase` state. This effect does NOT touch the DOM attribute
  // — the attribute effect above picks up `themeFileBase` changes via the
  // synchronous `effectiveTheme` computation. This separation eliminates the
  // race where two effects both write the attribute.
  //
  // Depends only on `themeFile` — not `theme`. A user theme toggle while a
  // themeFile is active does NOT re-read the file from disk; the effective
  // base stays at the file's base (the file takes precedence). When the file
  // is cleared or changes, the effect re-runs to load/clear overrides.
  useEffect(() => {
    // No custom theme file: clear overrides. The `effectiveTheme` computation
    // above already short-circuits to the user's `theme` when `themeFile` is
    // null, so we don't need to reset `themeFileBase` here — the stale value
    // is ignored. This avoids calling `setThemeFileBase` synchronously in the
    // effect body (which would trip `react-hooks/set-state-in-effect`).
    if (themeFile === null) {
      removeThemeOverrides();
      return;
    }

    // Capture the path at effect time so a fast change mid-read doesn't write
    // stale overrides. The cleanup-on-rerun pattern below handles cancellation.
    let cancelled = false;

    readThemeFile(themeFile)
      .then((raw): void => {
        if (cancelled) return;
        // Non-Tauri contexts (tests, web preview) resolve to null — no-op.
        if (raw === null) return;

        const result = parseThemeFile(raw);
        if (result.theme === null) {
          // Fail loudly: surface every diagnostic so the user can fix the file.
          for (const diag of result.diagnostics) {
            console.error(
              `[ThemeProvider] Theme file "${themeFile}" failed to parse: ` +
                `[${diag.severity}] ${diag.code}: ${diag.message}` +
                (diag.path ? ` (at "${diag.path}")` : "")
            );
          }
          removeThemeOverrides();
          // Reset the base so the user's theme drives the attribute again.
          setThemeFileBase(null);
          return;
        }

        // Inject the overrides scoped to the file's base palette.
        injectThemeOverrides(result.theme);
        // Cache the file's base so `effectiveTheme` picks it up synchronously.
        // The attribute effect will write the new base on the next render.
        // Read `theme` from the ref (not a dep) so this effect doesn't re-run
        // on every theme toggle — the file path/contents haven't changed.
        if (result.theme.base !== themeRef.current) {
          console.info(
            `[ThemeProvider] Custom theme file "${themeFile}" uses base ` +
              `"${result.theme.base}"; overriding user-selected theme "${themeRef.current}".`
          );
        }
        setThemeFileBase(result.theme.base);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Fail loudly: a thrown read/parse error should be visible, not silent.
        console.error(
          `[ThemeProvider] Failed to load custom theme file "${themeFile}":`,
          error
        );
        removeThemeOverrides();
        setThemeFileBase(null);
      });

    return () => {
      // Mark this run as superseded so a slow file read doesn't write stale
      // overrides after the user changed the path. We do NOT remove the
      // overrides here — the next effect run (or the null branch above)
      // handles cleanup, so a re-render with the same path doesn't flicker.
      cancelled = true;
    };
  }, [themeFile]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: AppTheme) => {
      // Stage the change into the settings store. The DOM updates immediately
      // (this component re-renders on store change), but persistence is deferred
      // to `saveSettings()` in the settings tab per the single-Save design.
      stageChange("appearance.theme", newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
