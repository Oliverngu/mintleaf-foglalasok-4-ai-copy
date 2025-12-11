import React, { useEffect } from 'react';
import { BrandColorConfig, BrandTarget, Unit } from '../models/data';

export type ThemeMode = 'mintleaf' | 'dark' | 'branded';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: ThemeMode;
}

const DEFAULT_PALETTE = {
  primary: '#15803d',
  primaryHover: '#166534',
  secondary: '#166534',
  accent: '#22c55e',
  surface: '#ecfdf3',
  background: '#f8fafc',
  text: '#0f172a',
  textMain: '#0f172a',
  textOnPrimary: '#ffffff',
  sidebarBg: '#0f172a',
  sidebarActive: '#1f2937',
  sidebarText: '#ffffff',
  headerImage: 'none',
  backgroundImage: 'none',
};

const setCssVariables = (palette: typeof DEFAULT_PALETTE) => {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--color-primary', palette.primary);
  rootStyle.setProperty('--color-primary-hover', palette.primaryHover);
  rootStyle.setProperty('--color-secondary', palette.secondary);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-surface-brand', palette.surface);
  rootStyle.setProperty('--color-surface', palette.surface);
  rootStyle.setProperty('--color-background', palette.background);
  rootStyle.setProperty('--color-text', palette.text);
  rootStyle.setProperty('--color-text-body', palette.textMain);
  rootStyle.setProperty('--color-text-main', palette.textMain);
  rootStyle.setProperty('--color-sidebar-bg', palette.sidebarBg);
  rootStyle.setProperty('--color-sidebar-active', palette.sidebarActive);
  rootStyle.setProperty('--color-sidebar-text', palette.sidebarText);
  rootStyle.setProperty('--color-text-on-primary', palette.textOnPrimary);
  rootStyle.setProperty('--ui-header-image', palette.headerImage);
  rootStyle.setProperty('--ui-bg-image', palette.backgroundImage);
};

const clearCssVariables = () => {
  const rootStyle = document.documentElement.style;
  const keys = [
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
    '--color-sidebar-bg',
    '--color-sidebar-active',
    '--color-sidebar-text',
    '--color-text-on-primary',
    '--ui-header-image',
    '--ui-bg-image',
  ];

  keys.forEach(key => rootStyle.removeProperty(key));
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

const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const srgb = [r, g, b].map(v => {
    const channel = v / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
};

const getContrastText = (hexColor: string | undefined, fallback = DEFAULT_PALETTE.textOnPrimary) => {
  const rgb = hexColor ? hexToRgb(hexColor) : null;
  if (!rgb) return fallback;

  const lum = luminance(rgb);
  return lum > 0.5 ? '#0f172a' : '#ffffff';
};

const LEGACY_TARGETS: BrandTarget[] = [
  'primary',
  'secondary',
  'accent',
  'background',
  'surface',
];

const mapLegacyColorsToConfigs = (colors: string[]): BrandColorConfig[] =>
  colors.slice(0, 5).map((color, idx) => ({
    id: `legacy-${idx}`,
    color,
    target: LEGACY_TARGETS[idx] || 'accent',
  }));

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

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit, themeMode }) => {
  useEffect(() => {
    clearCssVariables();

    if (themeMode === 'mintleaf') {
      return;
    }

    const basePalette = { ...DEFAULT_PALETTE };

    if (themeMode === 'dark') {
      const darkPalette = {
        ...basePalette,
        background: '#0f172a',
        surface: '#1e293b',
        textMain: '#f8fafc',
        text: '#f8fafc',
        primary: '#3b82f6',
        primaryHover: '#1d4ed8',
        textOnPrimary: '#ffffff',
        sidebarBg: '#0b1220',
        sidebarActive: '#111827',
        sidebarText: '#e2e8f0',
        headerImage: 'none',
        backgroundImage: 'none',
      };

      setCssVariables(darkPalette);
      return;
    }

    if (themeMode === 'branded' && activeUnit?.uiTheme === 'brand') {
      const configs =
        activeUnit.brandColorConfigs?.length
          ? activeUnit.brandColorConfigs
          : (activeUnit as any).brandColors?.length
          ? mapLegacyColorsToConfigs((activeUnit as any).brandColors)
          : [];

      if (activeUnit.uiHeaderImageUrl) {
        basePalette.headerImage = `url('${activeUnit.uiHeaderImageUrl}')`;
      }
      if (activeUnit.uiBackgroundImageUrl) {
        basePalette.backgroundImage = `url('${activeUnit.uiBackgroundImageUrl}')`;
      }

      if (configs.length) {
        const palette = { ...basePalette };

        configs.forEach(cfg => {
          if (!cfg.color) return;

          switch (cfg.target) {
            case 'primary':
              palette.primary = cfg.color;
              palette.primaryHover = adjustLightness(cfg.color, -10);
              palette.textOnPrimary = getContrastText(cfg.color);
              break;
            case 'secondary':
              palette.secondary = cfg.color;
              break;
            case 'accent':
              palette.accent = cfg.color;
              break;
            case 'background':
              palette.background = cfg.color;
              palette.textMain = getContrastText(cfg.color, basePalette.textMain);
              palette.text = palette.textMain;
              break;
            case 'surface':
              palette.surface = cfg.color;
              break;
            case 'sidebar':
              palette.sidebarBg = cfg.color;
              palette.sidebarActive = adjustLightness(cfg.color, -8);
              palette.sidebarText = getContrastText(cfg.color, basePalette.sidebarText);
              break;
            case 'text':
              palette.text = cfg.color;
              palette.textMain = cfg.color;
              break;
            default:
              break;
          }
        });

        setCssVariables(palette);
        return;
      }
    }

    setCssVariables(basePalette);
  }, [activeUnit, themeMode]);

  return null;
};

export default ThemeManager;
