import { BaseTheme, ThemeBases, ThemeMode } from './types';

export type ThemePalette = {
  surface: string;
  surfaceCard: string;
  text: string;
  border: string;
};

export const DEFAULT_THEME: Record<ThemeMode, ThemePalette> = {
  light: {
    surface: '#ffffff',
    surfaceCard: 'rgba(255,255,255,0.92)',
    text: '#0f172a',
    border: '#e2e8f0',
  },
  dark: {
    surface: '#1e293b',
    surfaceCard: '#1f2937',
    text: '#f8fafc',
    border: '#334155',
  },
};

export const normalizeColor = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'transparent') return null;

  const hexRegex = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  if (hexRegex.test(trimmed)) return trimmed;

  const rgbRegex = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i;
  if (rgbRegex.test(trimmed)) return trimmed;

  const rgbaMatch = trimmed.match(
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i
  );
  if (rgbaMatch) {
    const alpha = parseFloat(rgbaMatch[4]);
    if (alpha > 0) {
      return trimmed;
    }
    return null;
  }

  return null;
};

const pickColor = (...values: Array<string | undefined | null>): string | null => {
  for (const v of values) {
    const normalized = normalizeColor(v);
    if (normalized) return normalized;
  }
  return null;
};

export const resolveThemePalette = ({
  mode,
  globalTheme,
  unitTheme,
}: {
  mode: ThemeMode;
  globalTheme?: Partial<BaseTheme>;
  unitTheme?: Partial<BaseTheme>;
}): ThemePalette => {
  const defaults = DEFAULT_THEME[mode];

  const surface =
    pickColor(unitTheme?.surface, globalTheme?.surface) ?? defaults.surface;

  const surfaceCard =
    pickColor(
      unitTheme?.surfaceCard,
      unitTheme?.surface,
      globalTheme?.surfaceCard,
      globalTheme?.surface
    ) ?? defaults.surfaceCard;

  const text =
    pickColor(
      unitTheme?.textMain,
      unitTheme?.text,
      globalTheme?.textMain,
      globalTheme?.text
    ) ?? defaults.text;

  const border =
    pickColor(unitTheme?.border, globalTheme?.border) ?? defaults.border;

  return {
    surface: surface || defaults.surface,
    surfaceCard: surfaceCard || defaults.surfaceCard,
    text: text || defaults.text,
    border: border || defaults.border,
  };
};

export const mergeThemeBases = (
  base: ThemeBases | undefined | null,
  fallback: ThemeBases
): ThemeBases => ({
  light: { ...fallback.light, ...(base?.light || {}) },
  dark: { ...fallback.dark, ...(base?.dark || {}) },
});
