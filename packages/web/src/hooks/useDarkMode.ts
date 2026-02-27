import { useCallback, useEffect, useState } from 'react';

const DARK_MODE_KEY = 'cph-dark-mode';

/**
 * Dark mode hook that toggles the 'dark' class on <html>
 * and persists the preference to localStorage.
 *
 * On first load, it checks:
 *   1. localStorage preference
 *   2. System preference (prefers-color-scheme: dark)
 *   3. Defaults to dark (since this is a professional tool)
 */
export function useDarkMode(): {
  isDark: boolean;
  toggle: () => void;
  setDark: (dark: boolean) => void;
} {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Check localStorage first
    const stored = localStorage.getItem(DARK_MODE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    // Fall back to system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    // Default to dark
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(DARK_MODE_KEY, String(isDark));
  }, [isDark]);

  const toggle = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const setDark = useCallback((dark: boolean) => {
    setIsDark(dark);
  }, []);

  return { isDark, toggle, setDark };
}
