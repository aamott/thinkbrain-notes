import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { parseThemeFile } from "@thinkbrain/core";
import { type AppTheme, ThemeProviderContext, type ThemeProviderState } from "./theme-context";
import { useSettingsStore } from "./settingsStore";
import { readTextFileNative } from "../native/fs";
import { injectThemeOverrides, removeThemeOverrides } from "./themeInjection";

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
 * dropdown — the `data-thinkbrain-theme` attribute is forced to the file's
 * base so the scoped override selector matches. If parsing fails, diagnostics
 * are logged loudly and overrides are removed. When `themeFile` is cleared,
 * overrides are removed and the user's selected theme drives the attribute
 * again.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  // Subscribe to the raw state fields that determine the effective theme, then
  // compute it inline. Calling `getEffectiveValue` inside a selector does NOT
  // reliably trigger re-renders: Zustand compares the selector's returned
  // value (a primitive string) and the method only reads current state at
  // selection time, so subsequent mutations to `stagedChanges`/`appValues`
  // wouldn't necessarily re-run the selector with the new state. Subscribing
  // to the underlying fields guarantees re-renders whenever any of them
  // change. Resolution order mirrors `getEffectiveValue`: staged > appValues > default.
  const staged = useSettingsStore((s) => s.stagedChanges);
  const appValues = useSettingsStore((s) => s.appValues);
  const loaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const stageChange = useSettingsStore((s) => s.stageChange);

  const themeFromStore =
    "appearance.theme" in staged
      ? staged["appearance.theme"]
      : "appearance.theme" in appValues
        ? appValues["appearance.theme"]
        : "system";

  // Resolve the display theme: use the store value once loaded, else the prop
  // default. The store value is `unknown` (typed as the registry default), so
  // coerce to the AppTheme string union.
  const theme: AppTheme = loaded && typeof themeFromStore === "string"
    ? (themeFromStore as AppTheme)
    : defaultTheme;

  // Resolve the effective themeFile path with the same staged > appValues >
  // default pattern. Default is null (no custom theme). A staged non-string
  // value (e.g. null) clears the file.
  const themeFileFromStore =
    "appearance.themeFile" in staged
      ? staged["appearance.themeFile"]
      : "appearance.themeFile" in appValues
        ? appValues["appearance.themeFile"]
        : null;
  const themeFile: string | null =
    loaded && typeof themeFileFromStore === "string" && themeFileFromStore.length > 0
      ? themeFileFromStore
      : null;

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
  // When a custom themeFile is active, the themeFile effect below overrides
  // this attribute with the file's base palette (and logs an info message if
  // there's a conflict with the user's selected theme). The two effects are
  // ordered so the themeFile effect runs after this one on initial mount, but
  // React does not guarantee effect ordering across re-renders — instead, the
  // themeFile effect re-applies the attribute after injecting overrides, so
  // the final DOM state is always consistent.
  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.thinkbrainTheme = theme;
  }, [theme]);

  // Apply (or clear) custom theme overrides from `appearance.themeFile`.
  //
  // When themeFile is set: read the file via the native fs bridge, parse it,
  // and inject the overrides. The file's `base` field forces the
  // `data-thinkbrain-theme` attribute so the scoped override selector matches.
  // When themeFile is null/empty: remove any injected overrides and let the
  // theme effect above drive the attribute.
  //
  // The effect re-runs whenever `themeFile` or `theme` (the user's selection)
  // changes. `theme` is included so we can log a clear conflict message when
  // the user's selected base differs from the file's base.
  useEffect(() => {
    // No custom theme file: clear overrides and let the theme effect own the
    // attribute. The theme effect already ran (or will run) for this render.
    if (themeFile === null) {
      removeThemeOverrides();
      return;
    }

    // Capture the path at effect time so a fast change mid-read doesn't write
    // stale overrides. The cleanup-on-rerun pattern below handles cancellation.
    let cancelled = false;
    const root = window.document.documentElement;

    readTextFileNative(themeFile)
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
          return;
        }

        // Inject the overrides scoped to the file's base palette.
        injectThemeOverrides(result.theme);

        // Force the root attribute to the file's base so the scoped selector
        // matches. Log an info message when this overrides the user's choice
        // so the behavior is discoverable, not magical.
        if (root.dataset.thinkbrainTheme !== result.theme.base) {
          console.info(
            `[ThemeProvider] Custom theme file "${themeFile}" uses base ` +
              `"${result.theme.base}"; overriding user-selected theme "${theme}".`
          );
          root.dataset.thinkbrainTheme = result.theme.base;
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Fail loudly: a thrown read/parse error should be visible, not silent.
        console.error(
          `[ThemeProvider] Failed to load custom theme file "${themeFile}":`,
          error
        );
        removeThemeOverrides();
      });

    return () => {
      // Mark this run as superseded so a slow file read doesn't write stale
      // overrides after the user changed the path. We do NOT remove the
      // overrides here — the next effect run (or the null branch above)
      // handles cleanup, so a re-render with the same path doesn't flicker.
      cancelled = true;
    };
  }, [themeFile, theme]);

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
