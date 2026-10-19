'use client';

import { useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'starfinch_theme';
const LEGACY_THEME_KEY = 'starprache_theme';
const THEME_CHANGE_EVENT = 'starfinch:theme-change';

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function subscribe(onStoreChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === LEGACY_THEME_KEY) onStoreChange();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function writeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable; the document still keeps the theme this session.
  }
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** One external store for theme state, shared by every client page header. */
export function useTheme(): { theme: Theme | null; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => null);

  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function toggleTheme() {
    const current = theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    writeTheme(current === 'dark' ? 'light' : 'dark');
  }

  return { theme, toggleTheme };
}
