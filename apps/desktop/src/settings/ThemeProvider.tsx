import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { parseThemeFile, type AppThemeSetting, type ThemeBase } from "@thinkbrain/core";
import { useSettingsStore } from "./settingsStore";
import { readThemeFile } from "./themeAdapter";
import { injectThemeOverrides, removeThemeOverrides } from "./themeInjection";
import { resolveThemeBase } from "./themeResolution";
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
 * React context provider that applies the selected theme to the root element.
 *
 * Theme is read from the Zustand settings store (`appearance.theme` effective
 * value). On mount (inside Tauri), the provider triggers `loadSettings` to
 * hydrate from the native settings file. Theme changes are **staged** via
 * `stageChange` (single-Save design); the DOM updates immediately, persistence
 * is deferred to `saveSettings()`.
 *
 * The `data-thinkbrain-theme` attribute is always a concrete `light` or
 * `dark` — `"system"` is resolved via `matchMedia` and tracked live. Custom
 * theme files (`appearance.themeFile`) override the base palette: the file's
 * `base` takes precedence over the user's dropdown, and token overrides are
 * injected via `injectThemeOverrides`.
 *
 * **Single source of truth:** `effectiveTheme` is computed synchronously from
 * `{ userTheme, themeFileBase, osThemeBase }`. One effect writes the DOM
 * attribute; a separate async effect reads/parses the theme file and updates
 * `themeFileBase` state (never touching the DOM directly). This eliminates
 * effect races and stale-base bugs.
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

  // Cached base from the last successful theme-file read. When non-null, it
  // takes precedence over the user's selection — the custom theme commits to
  // a base palette, and the scoped override selector only matches when the
  // attribute equals the file's base.
  const [themeFileBase, setThemeFileBase] = useState<ThemeBase | null>(null);

  // OS color-scheme preference for live `"system"` resolution. Only consulted
  // when no theme file is active and the user selected "system".
  const [osThemeBase, setOsThemeBase] = useState<"light" | "dark">(() =>
    resolveThemeBase("system")
  );

  // Subscribe to OS theme changes. The listener only fires `setOsThemeBase`
  // when the current theme resolves through the "system" path — otherwise
  // it's a no-op to avoid wasted re-renders. A ref tracks `resolvedTheme`
  // since the listener is set up once with empty deps.
  const resolvedThemeRef = useRef<AppTheme | null>(null);
  // `themeRef` lets the async file-read effect log the user's selection
  // without depending on `theme` (which would trigger redundant disk reads).
  const themeRef = useRef(theme);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent): void => {
      const current = resolvedThemeRef.current;
      if (current === "light" || current === "dark") return;
      setOsThemeBase(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  // Effective theme: theme file's base > user's selection > OS preference.
  // `"system"` resolves to `osThemeBase` so the attribute is always concrete.
  // The `themeFile !== null` guard short-circuits stale `themeFileBase` when
  // the file is cleared (avoids `setThemeFileBase(null)` in the effect body,
  // which would trip `react-hooks/set-state-in-effect`).
  const resolvedTheme: AppTheme = themeFile !== null ? (themeFileBase ?? theme) : theme;
  const effectiveTheme: "light" | "dark" =
    resolvedTheme === "light" || resolvedTheme === "dark"
      ? (resolvedTheme as "light" | "dark")
      : osThemeBase;

  // Keep refs in sync for the matchMedia listener guard and the async
  // file-read effect's log messages. Both refs avoid adding `theme`/
  // `resolvedTheme` as effect deps (which would cause redundant disk reads
  // or re-renders).
  useEffect(() => {
    resolvedThemeRef.current = resolvedTheme;
    themeRef.current = theme;
  }, [resolvedTheme, theme]);

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

  // Single effect that writes the DOM attribute — the only place it's set.
  useEffect(() => {
    window.document.documentElement.dataset.thinkbrainTheme = effectiveTheme;
  }, [effectiveTheme]);

  // Async effect: read/parse the theme file, inject/remove overrides, and
  // update `themeFileBase`. Does NOT touch the DOM attribute — the effect
  // above picks up `themeFileBase` changes via `effectiveTheme`. Depends only
  // on `themeFile` (not `theme`) so a theme toggle while a file is active
  // doesn't trigger a disk re-read.
  useEffect(() => {
    if (themeFile === null) {
      removeThemeOverrides();
      return;
    }

    let cancelled = false;

    readThemeFile(themeFile)
      .then((raw): void => {
        if (cancelled || raw === null) return;

        const result = parseThemeFile(raw);
        if (result.theme === null) {
          for (const diag of result.diagnostics) {
            console.error(
              `[ThemeProvider] Theme file "${themeFile}" failed to parse: ` +
                `[${diag.severity}] ${diag.code}: ${diag.message}` +
                (diag.path ? ` (at "${diag.path}")` : "")
            );
          }
          removeThemeOverrides();
          setThemeFileBase(null);
          return;
        }

        injectThemeOverrides(result.theme);
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
        console.error(
          `[ThemeProvider] Failed to load custom theme file "${themeFile}":`,
          error
        );
        removeThemeOverrides();
        setThemeFileBase(null);
      });

    return () => {
      // Cancel stale reads and reset `themeFileBase` so a previous file's
      // base can't leak through `themeFileBase ?? theme` before the next read
      // completes. In cleanup (not the effect body) to avoid tripping
      // `react-hooks/set-state-in-effect`. Overrides are NOT removed here —
      // the next effect run handles that, avoiding flicker on same-path
      // re-renders.
      cancelled = true;
      setThemeFileBase(null);
    };
  }, [themeFile]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: AppTheme) => {
      // Stage into the store; DOM updates immediately, persistence is
      // deferred to `saveSettings()` per the single-Save design.
      stageChange("appearance.theme", newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
