import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

// Support system, light, dark, and potentially custom imported themes later.
export type AppTheme = "system" | "light" | "dark" | (string & {});

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
  readonly defaultTheme?: AppTheme;
  readonly storageKey?: string;
}

/**
 * A React context provider that applies the selected theme to the root element.
 * It uses the `data-thinkbrain-theme` attribute to avoid JS branching and
 * allow CSS variables to handle light/dark/system natively.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "thinkbrain-ui-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem(storageKey) as AppTheme) || defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.thinkbrainTheme = theme;
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme: AppTheme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
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
