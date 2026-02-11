import { useEffect, useState } from 'react';

function getSystemTheme() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialTheme() {
  if (typeof document === 'undefined') return 'light';
  const fromData = document.documentElement.dataset.theme;
  if (fromData) return fromData;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('appearance') : null;
  if (stored && stored !== 'system') return stored;
  return getSystemTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const handleThemeChange = (event) => {
      if (event?.detail?.theme) {
        setTheme(event.detail.theme);
      } else {
        setTheme(getInitialTheme());
      }
    };
    window.addEventListener('themechange', handleThemeChange);
    return () => window.removeEventListener('themechange', handleThemeChange);
  }, []);

  return theme;
}
