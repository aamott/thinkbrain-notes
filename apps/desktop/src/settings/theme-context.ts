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
  setTheme: () => null,
});

export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
