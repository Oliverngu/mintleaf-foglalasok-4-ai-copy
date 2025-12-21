import { ThemeBases, ThemeMode } from './types';

const BASES_KEY = 'mintleaf_theme_bases';
const MODE_KEY = 'mintleaf_theme_mode';

export const DEFAULT_BASES: ThemeBases = {
  light: {
    primary: '#15803d',
    secondary: '#22c55e',
    headerBg: '#15803d',
    sidebarBg: '#ffffff',
    background: '#f1f5f9',
    surface: '#ffffff',
    surfaceCard: '#ffffff',
    accent: '#f97316',
    sidebarHover: '#ecfdf3',
    inputBg: '#ffffff',
    textMain: '#0f172a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
  },
  dark: {
    primary: '#3b82f6',
    secondary: '#a855f7',
    headerBg: '#0f172a',
    sidebarBg: '#1e293b',
    background: '#020617',
    surface: '#1e293b',
    surfaceCard: '#1e293b',
    accent: '#22d3ee',
    sidebarHover: '#334155',
    inputBg: '#0f172a',
    textMain: '#f1f5f9',
    textSecondary: '#94a3b8',
    border: '#334155',
  },
};

export const loadBases = (): ThemeBases => {
  if (typeof window === 'undefined') return DEFAULT_BASES;
  try {
    const stored = localStorage.getItem(BASES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        light: { ...DEFAULT_BASES.light, ...parsed.light },
        dark: { ...DEFAULT_BASES.dark, ...parsed.dark },
      };
    }
  } catch (error) {
    console.warn('Failed to load theme bases, falling back to defaults', error);
  }
  return DEFAULT_BASES;
};

export const saveBases = (bases: ThemeBases) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BASES_KEY, JSON.stringify(bases));
  } catch (error) {
    console.error('Failed to persist theme bases', error);
  }
};

export const loadMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(MODE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
};

export const saveMode = (mode: ThemeMode) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch (error) {
    console.error('Failed to persist theme mode', error);
  }
};
