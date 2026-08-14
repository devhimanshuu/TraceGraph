'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'tg_theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Toggles the `.dark` class that drives the design-system tokens. */
function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

/**
 * Light/dark theme, persisted in localStorage and defaulting to dark (the
 * app's designed look). The root layout's inline pre-paint script applies the
 * saved theme before first paint (no flash); this provider keeps React state
 * in sync, applies the `.dark` class, and powers the nav toggle.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage once (guarded for SSR — the provider
  // also renders on the server, where there is no `window`).
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  });

  // Single effect owns both side effects: the DOM class and persistence.
  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return value;
}
