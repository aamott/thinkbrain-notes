import { createContext, useContext } from "react";
import type { AppThemeSetting } from "@thinkbrain/core";

// Support system, light, dark, and potentially custom imported themes later.
// `AppTheme` extends `AppThemeSetting` with the `(string & {})` escape hatch so
// future custom themes can flow through the same context without a breaking
// change, while persistence still uses the strict `AppThemeSetting` union.
export type AppTheme = AppThemeSetting | (string & {});

export interface ThemeProviderState {
  readonly theme: AppTheme;
  readonly setTheme: (theme: AppTheme) => void;
}

export const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  // Fail loudly if `useTheme` is consumed outside a `ThemeProvider`. A silent
  // no-op here would mask the missing-provider bug (theme changes would
  // appear to do nothing). Throwing surfaces it immediately at the call site.
  setTheme: () => {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
});

export function useTheme(): ThemeProviderState {
  // The context always has a default value (with a throwing `setTheme`), so
  // `useContext` never returns `undefined` here — the missing-provider case is
  // surfaced by the throwing default setter when the consumer calls it.
  return useContext(ThemeProviderContext);
}
