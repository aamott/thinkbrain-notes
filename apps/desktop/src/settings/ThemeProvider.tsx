import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { themeService } from "./themeService";
import type { AppThemeSetting } from "@thinkbrain/core";

// Support system, light, dark, and potentially custom imported themes later.
// `AppTheme` extends `AppThemeSetting` with the `(string & {})` escape hatch so
// future custom themes can flow through the same context without a breaking
// change, while persistence still uses the strict `AppThemeSetting` union.
export type AppTheme = AppThemeSetting | (string & {});

interface ThemeProviderState {
  readonly theme: AppTheme;
  readonly setTheme: (theme: AppTheme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => null,
});

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Theme used until native settings finish hydrating (defaults to "system"). */
  readonly defaultTheme?: AppTheme;
}

/**
 * A React context provider that applies the selected theme to the root element.
 *
 * Theme persistence flows through the native settings commands
 * (`themeService` -> `read_app_settings` / `update_app_theme`) rather than
 * `localStorage`, so the host owns a single source of truth. In non-Tauri
 * contexts (tests, plain browser previews) the load/save steps are skipped.
 *
 * The theme is applied via the `data-thinkbrain-theme` attribute on the root
 * element so CSS can branch on light/dark/system without JS resolution. The
 * "system" value is handled in CSS through `@media (prefers-color-scheme)`.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  // Start from the prop default; native settings hydrate in the effect below.
  const [theme, setThemeState] = useState<AppTheme>(defaultTheme);

  // Hydrate the persisted theme from native settings on mount. Skipped outside
  // Tauri (e.g. Node test environment) where `themeService` has no host to call.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    themeService
      .loadTheme()
      .then((persisted) => {
        if (!cancelled) setThemeState(persisted);
      })
      .catch((error: unknown) => {
        // Fail loudly: a theme read failure should be visible, not silent.
        console.error("[ThemeProvider] Failed to load theme from native settings:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the theme attribute whenever it changes. CSS handles light/dark/system.
  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.thinkbrainTheme = theme;
  }, [theme]);

  const value: ThemeProviderState = {
    theme,
    setTheme: (newTheme: AppTheme) => {
      setThemeState(newTheme);
      // Only persist inside the Tauri host; elsewhere there is no settings store.
      if (!isTauri()) return;
      themeService
        .saveTheme(newTheme as AppThemeSetting)
        .catch((error: unknown) => {
          // Fail loudly per project rules: surface persistence failures.
          console.error("[ThemeProvider] Failed to save theme to native settings:", error);
        });
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
