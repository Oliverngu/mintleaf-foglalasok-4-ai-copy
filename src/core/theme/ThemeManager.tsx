import React, { useEffect } from 'react';
import { BrandColorConfig, BrandTarget, Unit } from '../models/data';

interface ThemeManagerProps {
  allUnits: Unit[];
  activeUnitIds: string[];
}

const DEFAULT_PALETTE = {
  primary: '#15803d',
  secondary: '#166534',
  accent: '#22c55e',
  surface: '#ecfdf3',
  background: '#f8fafc',
  text: '#0f172a',
  textOnPrimary: '#ffffff',
  sidebarBg: '#0f172a',
  sidebarText: '#ffffff',
};

const setCssVariables = (palette: typeof DEFAULT_PALETTE) => {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--color-primary', palette.primary);
  rootStyle.setProperty('--color-secondary', palette.secondary);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-surface-brand', palette.surface);
  rootStyle.setProperty('--color-background', palette.background);
  rootStyle.setProperty('--color-text', palette.text);
  rootStyle.setProperty('--color-sidebar-bg', palette.sidebarBg);
  rootStyle.setProperty('--color-sidebar-text', palette.sidebarText);
  rootStyle.setProperty('--color-text-on-primary', palette.textOnPrimary);
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

const getContrastText = (hexColor: string | undefined) => {
  const rgb = hexColor ? hexToRgb(hexColor) : null;
  if (!rgb) return DEFAULT_PALETTE.textOnPrimary;

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

const ThemeManager: React.FC<ThemeManagerProps> = ({ allUnits, activeUnitIds }) => {
  useEffect(() => {
    const primaryUnit = activeUnitIds.length
      ? allUnits.find(u => u.id === activeUnitIds[0])
      : undefined;

    const basePalette = { ...DEFAULT_PALETTE };

    if (primaryUnit?.uiTheme === 'brand') {
      const configs =
        primaryUnit.brandColorConfigs?.length
          ? primaryUnit.brandColorConfigs
          : (primaryUnit as any).brandColors?.length
          ? mapLegacyColorsToConfigs((primaryUnit as any).brandColors)
          : [];

      if (configs.length) {
        const targetMap = configs.reduce<Partial<Record<BrandTarget, string>>>(
          (acc, cfg) => {
            if (cfg.color) acc[cfg.target] = cfg.color;
            return acc;
          },
          {}
        );

        const palette = { ...basePalette };

        if (targetMap.primary) {
          palette.primary = targetMap.primary;
          palette.textOnPrimary = getContrastText(targetMap.primary);
        }
        if (targetMap.secondary) {
          palette.secondary = targetMap.secondary;
        }
        if (targetMap.accent) {
          palette.accent = targetMap.accent;
        }
        if (targetMap.surface) {
          palette.surface = targetMap.surface;
        }
        if (targetMap.background) {
          palette.background = targetMap.background;
        }
        if (targetMap.sidebar) {
          palette.sidebarBg = targetMap.sidebar;
          palette.sidebarText = getContrastText(targetMap.sidebar);
        }
        if (targetMap.text) {
          palette.text = targetMap.text;
        }

        setCssVariables(palette);
        return;
      }
    }

    setCssVariables(basePalette);
  }, [allUnits, activeUnitIds]);

  return null;
};

export default ThemeManager;
