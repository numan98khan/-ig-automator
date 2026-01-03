import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';
type UiTheme = 'legacy' | 'comic';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  uiTheme: 'legacy',
  setUiTheme: () => null,
};

const ThemeContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'vite-ui-theme',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const uiThemeStorageKey = 'sendfx-ui-theme';
  const [uiTheme, setUiThemeState] = useState<UiTheme>(
    () => (localStorage.getItem(uiThemeStorageKey) as UiTheme) || 'legacy'
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.dataset.uiTheme = uiTheme;
  }, [uiTheme]);

  useEffect(() => {
    const controller = new AbortController();

    const loadUiTheme = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/ui-settings`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = await response.json();
        const nextTheme = payload?.data?.uiTheme || payload?.uiTheme;
        if (nextTheme === 'legacy' || nextTheme === 'comic') {
          localStorage.setItem(uiThemeStorageKey, nextTheme);
          setUiThemeState(nextTheme);
        }
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
      }
    };

    loadUiTheme();

    return () => controller.abort();
  }, []);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    uiTheme,
    setUiTheme: (nextTheme: UiTheme) => {
      localStorage.setItem(uiThemeStorageKey, nextTheme);
      setUiThemeState(nextTheme);
    },
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
}
