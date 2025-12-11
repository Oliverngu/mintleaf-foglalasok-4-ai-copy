import React, { useLayoutEffect } from 'react';
import { Unit } from '../models/data';
import { BrandOverride, ThemeBases, ThemeMode } from './types';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  bases: ThemeBases;
  mode: ThemeMode;
  brandMode?: boolean;
}

const VARIABLE_KEYS = [
  '--color-primary',
  '--color-secondary',
  '--color-header-bg',
  '--color-sidebar-bg',
  '--color-sidebar-hover',
  '--color-background',
  '--color-surface',
  '--color-surface-brand',
  '--color-text',
  '--color-text-body',
  '--color-text-main',
  '--color-text-secondary',
  '--color-border',
  '--color-text-on-primary',
  '--color-primary-hover',
  '--color-sidebar-active',
  '--color-sidebar-text',
  '--color-accent',
  '--color-input-bg',
];

const lightenColor = (hexColor: string, amount = 0.08) => {
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return hexColor;

  const toChannel = (value: string) => parseInt(value, 16);
  const r = toChannel(normalized.slice(0, 2));
  const g = toChannel(normalized.slice(2, 4));
  const b = toChannel(normalized.slice(4, 6));

  const lighten = (channel: number) => Math.min(255, Math.round(channel + 255 * amount));

  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

  return `#${toHex(lighten(r))}${toHex(lighten(g))}${toHex(lighten(b))}`;
};

const getContrastText = (hexColor: string | undefined, fallback = '#ffffff') => {
  if (!hexColor) return fallback;
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return fallback;
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const srgb = [r, g, b].map(channel =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  const lum = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return lum > 0.5 ? '#0f172a' : '#ffffff';
};

const clearVariables = () => {
  const rootStyle = document.documentElement.style;
  VARIABLE_KEYS.forEach(key => rootStyle.removeProperty(key));
};

const applyPalette = (palette: Required<ThemeBases>['light'], brandOverride?: BrandOverride) => {
  const rootStyle = document.documentElement.style;
  const primaryColor = brandOverride?.secondary || palette.primary;
  const surfaceColor = brandOverride?.surface || palette.surface;

  rootStyle.setProperty('--color-primary', primaryColor);
  rootStyle.setProperty('--color-secondary', brandOverride?.secondary || palette.secondary);
  rootStyle.setProperty('--color-header-bg', brandOverride?.headerBg || palette.headerBg);
  rootStyle.setProperty('--color-sidebar-bg', palette.sidebarBg);
  rootStyle.setProperty('--color-sidebar-active', brandOverride?.secondary || palette.secondary);
  rootStyle.setProperty('--color-sidebar-hover', palette.sidebarHover);
  rootStyle.setProperty('--color-sidebar-text', palette.textMain);
  rootStyle.setProperty('--color-background', brandOverride?.background || palette.background);
  rootStyle.setProperty('--color-surface', surfaceColor);
  rootStyle.setProperty('--color-surface-brand', surfaceColor);
  rootStyle.setProperty('--color-text', palette.textMain);
  rootStyle.setProperty('--color-text-body', palette.textMain);
  rootStyle.setProperty('--color-text-main', palette.textMain);
  rootStyle.setProperty('--color-text-secondary', palette.textSecondary);
  rootStyle.setProperty('--color-border', palette.border);
  rootStyle.setProperty('--color-text-on-primary', getContrastText(primaryColor));
  rootStyle.setProperty('--color-primary-hover', primaryColor);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-input-bg', palette.inputBg);
};

const deriveBrandOverride = (activeUnit: Unit | null): BrandOverride | undefined => {
  if (!activeUnit?.brandColors) return undefined;

  const { primary, secondary, background } = activeUnit.brandColors;
  const override: BrandOverride = {};

  if (primary) override.headerBg = primary;
  if (secondary) override.secondary = secondary;
  if (background) override.background = background;
  if (background) override.surface = lightenColor(background, 0.06);

  return Object.keys(override).length ? override : undefined;
};

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit, bases, mode, brandMode }) => {
  useLayoutEffect(() => {
    document.documentElement.classList.add('no-transition');
    document.body.classList.add('no-transition');
    clearVariables();

    const palette = bases[mode];
    const brandOverride = brandMode ? deriveBrandOverride(activeUnit) : undefined;

    applyPalette(palette, brandOverride);

    // Force paint to avoid flicker before re-enabling transitions
    void getComputedStyle(document.documentElement).getPropertyValue('--color-primary');
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('no-transition');
      document.body.classList.remove('no-transition');
    });

    return () => {
      document.documentElement.classList.remove('no-transition');
      document.body.classList.remove('no-transition');
    };
  }, [activeUnit, bases, mode, brandMode]);

  return null;
};

export default ThemeManager;
