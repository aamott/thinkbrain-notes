import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { type AppTheme, ThemeProviderContext, type ThemeProviderState } from "./theme-context";
import { useSettingsStore } from "./settingsStore";

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Theme used until the settings store finishes loading (defaults to "system"). */
  readonly defaultTheme?: AppTheme;
}

/**
 * A React context provider that applies the selected theme to the root element.
 *
 * Theme is read from the Zustand settings store (`appearance.theme` effective
 * value) instead of the legacy `themeService`. On mount (inside Tauri), the
 * provider triggers `loadSettings` so the store hydrates from the native app
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
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  // Read the effective theme from the store. Before load, `getEffectiveValue`
  // falls back to the registry default ("system"), so the prop default is only
  // relevant in non-Tauri contexts where the store never loads.
  const themeFromStore = useSettingsStore((s) => s.getEffectiveValue("appearance.theme"));
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const stageChange = useSettingsStore((s) => s.stageChange);

  // Resolve the display theme: use the store value once loaded, else the prop
  // default. The store value is `unknown` (typed as the registry default), so
  // coerce to the AppTheme string union.
  const theme: AppTheme = loaded && typeof themeFromStore === "string"
    ? (themeFromStore as AppTheme)
    : defaultTheme;

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

  // Apply the theme attribute whenever it changes. CSS handles light/dark/system.
  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.thinkbrainTheme = theme;
  }, [theme]);

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
