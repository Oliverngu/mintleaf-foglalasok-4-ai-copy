import React, { useLayoutEffect } from 'react';
import { BrandColorConfig, BrandTarget, Unit } from '../models/data';

export type ThemeMode = 'mintleaf' | 'dark' | 'branded';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: ThemeMode;
}

type Palette = {
  primary: string;
  primaryHover: string;
  accent: string;
  surface: string;
  background: string;
  textMain: string;
  textSecondary: string;
  textOnPrimary: string;
  sidebarBg: string;
  sidebarActive: string;
  sidebarText: string;
  headerBg: string;
  border: string;
};

const THEME_VARIABLE_KEYS = [
  '--color-primary',
  '--color-primary-hover',
  '--color-secondary',
  '--color-accent',
  '--color-surface-brand',
  '--color-surface',
  '--color-background',
  '--color-text',
  '--color-text-body',
  '--color-text-main',
  '--color-text-secondary',
  '--color-sidebar-bg',
  '--color-sidebar-active',
  '--color-sidebar-text',
  '--color-text-on-primary',
  '--color-header-bg',
  '--color-border',
  '--ui-header-image',
  '--ui-bg-image',
];

const clearCssVariables = () => {
  const rootStyle = document.documentElement.style;
  THEME_VARIABLE_KEYS.forEach(key => rootStyle.removeProperty(key));
};

const setCssVariables = (palette: Palette) => {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--color-primary', palette.primary);
  rootStyle.setProperty('--color-primary-hover', palette.primaryHover);
  rootStyle.setProperty('--color-secondary', palette.primary);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-surface-brand', palette.surface);
  rootStyle.setProperty('--color-surface', palette.surface);
  rootStyle.setProperty('--color-background', palette.background);
  rootStyle.setProperty('--color-text', palette.textMain);
  rootStyle.setProperty('--color-text-body', palette.textMain);
  rootStyle.setProperty('--color-text-main', palette.textMain);
  rootStyle.setProperty('--color-text-secondary', palette.textSecondary);
  rootStyle.setProperty('--color-sidebar-bg', palette.sidebarBg);
  rootStyle.setProperty('--color-sidebar-active', palette.sidebarActive);
  rootStyle.setProperty('--color-sidebar-text', palette.sidebarText);
  rootStyle.setProperty('--color-text-on-primary', palette.textOnPrimary);
  rootStyle.setProperty('--color-header-bg', palette.headerBg);
  rootStyle.setProperty('--color-border', palette.border);
  rootStyle.removeProperty('--ui-header-image');
  rootStyle.removeProperty('--ui-bg-image');
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) return null;
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map(c => c + c)
          .join('')
      : normalized;

  const int = parseInt(expanded, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
};

const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hslToHex = (h: number, s: number, l: number) => {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  h /= 360;
  s /= 100;
  l /= 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    const hex = val.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

  const toHex = (c: number) => Math.round(c * 255)
    .toString(16)
    .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const adjustLightness = (hex: string, delta: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { r, g, b } = rgb;
  const baseHsl = rgbToHsl(r, g, b);
  const nextL = Math.max(0, Math.min(100, baseHsl.l + delta));
  return hslToHex(baseHsl.h, baseHsl.s, nextL);
};

const getContrastText = (hexColor: string | undefined, fallback = '#ffffff') => {
  const rgb = hexColor ? hexToRgb(hexColor) : null;
  if (!rgb) return fallback;

  const srgb = [rgb.r, rgb.g, rgb.b].map(v => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return lum > 0.5 ? '#0f172a' : '#ffffff';
};

const LEGACY_TARGETS: BrandTarget[] = ['primary', 'secondary', 'accent', 'background', 'surface'];

const mapLegacyColorsToConfigs = (colors: string[]): BrandColorConfig[] =>
  colors.slice(0, 5).map((color, idx) => ({
    id: `legacy-${idx}`,
    color,
    target: LEGACY_TARGETS[idx] || 'accent',
  }));

const MINTLEAF_PALETTE: Palette = {
  primary: '#15803d',
  primaryHover: adjustLightness('#15803d', -10),
  accent: '#15803d',
  surface: '#ffffff',
  background: '#f1f5f9',
  textMain: '#0f172a',
  textSecondary: '#64748b',
  textOnPrimary: '#ffffff',
  sidebarBg: '#ffffff',
  sidebarActive: '#e2e8f0',
  sidebarText: '#0f172a',
  headerBg: '#15803d',
  border: '#e2e8f0',
};

const DARK_PALETTE: Palette = {
  primary: '#3b82f6',
  primaryHover: adjustLightness('#3b82f6', -12),
  accent: '#3b82f6',
  surface: '#1e293b',
  background: '#020617',
  textMain: '#f1f5f9',
  textSecondary: '#94a3b8',
  textOnPrimary: '#ffffff',
  sidebarBg: '#0f172a',
  sidebarActive: '#1e293b',
  sidebarText: '#f1f5f9',
  headerBg: '#0f172a',
  border: '#334155',
};

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit, themeMode }) => {
  const resolveBrandedPalette = (): Palette => {
    if (!activeUnit || activeUnit.uiTheme !== 'brand') return MINTLEAF_PALETTE;

    const configs: BrandColorConfig[] = activeUnit.brandColorConfigs?.length
      ? activeUnit.brandColorConfigs
      : (activeUnit as any).brandColors?.length
      ? mapLegacyColorsToConfigs((activeUnit as any).brandColors)
      : [];

    const palette: Palette = { ...MINTLEAF_PALETTE };

    configs.forEach(cfg => {
      if (!cfg.color) return;

      switch (cfg.target) {
        case 'primary':
          palette.primary = cfg.color;
          palette.primaryHover = adjustLightness(cfg.color, -10);
          palette.textOnPrimary = getContrastText(cfg.color);
          palette.headerBg = cfg.color;
          break;
        case 'secondary':
        case 'accent':
          palette.accent = cfg.color;
          break;
        case 'background':
          palette.background = cfg.color;
          palette.textMain = getContrastText(cfg.color, palette.textMain);
          palette.textSecondary = adjustLightness(palette.textMain, 25);
          break;
        case 'surface':
          palette.surface = cfg.color;
          break;
        case 'sidebar':
          palette.sidebarBg = cfg.color;
          palette.sidebarActive = adjustLightness(cfg.color, -8);
          palette.sidebarText = getContrastText(cfg.color, palette.sidebarText);
          break;
        case 'text':
          palette.textMain = cfg.color;
          palette.textSecondary = adjustLightness(cfg.color, 20);
          break;
        default:
          break;
      }
    });

    return palette;
  };

  useLayoutEffect(() => {
    clearCssVariables();

    let palette: Palette = MINTLEAF_PALETTE;

    if (themeMode === 'dark') {
      palette = DARK_PALETTE;
    } else if (themeMode === 'branded') {
      palette = resolveBrandedPalette();
    }

    setCssVariables(palette);
  }, [activeUnit, themeMode]);

  return null;
};

export default ThemeManager;
