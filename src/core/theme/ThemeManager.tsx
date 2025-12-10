import React, { useEffect } from 'react';
import { Unit } from '../models/data';

interface ThemeManagerProps {
  allUnits: Unit[];
  activeUnitIds: string[];
}

const DEFAULT_PALETTE = {
  primary: '#15803d',
  secondary: '#166534',
  accent: '#22c55e',
  surface: '#ecfdf3',
  textOnPrimary: '#ffffff',
};

const setCssVariables = (palette: typeof DEFAULT_PALETTE) => {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--color-primary', palette.primary);
  rootStyle.setProperty('--color-secondary', palette.secondary);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-surface-brand', palette.surface);
  rootStyle.setProperty('--color-text-on-primary', palette.textOnPrimary);
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (![3, 6].includes(normalized.length)) return null;
  const expanded = normalized.length === 3
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

const ThemeManager: React.FC<ThemeManagerProps> = ({ allUnits, activeUnitIds }) => {
  useEffect(() => {
    const primaryUnit = activeUnitIds.length
      ? allUnits.find(u => u.id === activeUnitIds[0])
      : undefined;

    if (primaryUnit?.uiTheme === 'brand' && primaryUnit.brandColors?.length) {
      const brandColors = primaryUnit.brandColors;
      const palette = {
        primary: brandColors[0] || DEFAULT_PALETTE.primary,
        secondary: brandColors[1] || brandColors[0] || DEFAULT_PALETTE.secondary,
        accent: brandColors[2] || brandColors[0] || DEFAULT_PALETTE.accent,
        surface: brandColors[3] || DEFAULT_PALETTE.surface,
        textOnPrimary: getContrastText(brandColors[0]),
      };

      setCssVariables(palette);
    } else {
      setCssVariables(DEFAULT_PALETTE);
    }
  }, [allUnits, activeUnitIds]);

  return null;
};

export default ThemeManager;
