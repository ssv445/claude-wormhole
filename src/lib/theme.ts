'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'tmux-theme';

export type Theme = 'dark' | 'light';

export const XTERM_THEMES = {
  dark: {
    background: '#09090b',
    foreground: '#e4e4e7',
    cursor: '#e4e4e7',
    selectionBackground: '#3f3f46',
    scrollbarSliderBackground: 'rgba(228, 228, 231, 0.2)',
    scrollbarSliderHoverBackground: 'rgba(228, 228, 231, 0.4)',
    scrollbarSliderActiveBackground: 'rgba(228, 228, 231, 0.5)',
  },
  light: {
    background: '#ffffff',
    foreground: '#1e1e1e',
    cursor: '#1e1e1e',
    selectionBackground: '#b4d5fe',
    scrollbarSliderBackground: 'rgba(30, 30, 30, 0.2)',
    scrollbarSliderHoverBackground: 'rgba(30, 30, 30, 0.4)',
    scrollbarSliderActiveBackground: 'rgba(30, 30, 30, 0.5)',
  },
} as const;

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Read from body class (set by inline script before paint)
    const stored = document.body.classList.contains('light') ? 'light' : 'dark';
    setTheme(stored);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      document.body.classList.toggle('light', next === 'light');
      return next;
    });
  }, []);

  return { theme, toggle };
}
