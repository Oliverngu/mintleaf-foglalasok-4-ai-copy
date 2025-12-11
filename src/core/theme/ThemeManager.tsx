import React, { useLayoutEffect } from 'react';
import { Unit, BrandColorConfig } from '../models/data';
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

  rootStyle.setProperty('--color-primary', palette.primary);
  rootStyle.setProperty('--color-secondary', brandOverride?.secondary || palette.secondary);
  rootStyle.setProperty('--color-header-bg', brandOverride?.headerBg || palette.headerBg);
  rootStyle.setProperty('--color-sidebar-bg', palette.sidebarBg);
  rootStyle.setProperty('--color-sidebar-active', palette.secondary);
  rootStyle.setProperty('--color-sidebar-hover', palette.sidebarHover);
  rootStyle.setProperty('--color-sidebar-text', palette.textMain);
  rootStyle.setProperty('--color-background', brandOverride?.background || palette.background);
  rootStyle.setProperty('--color-surface', palette.surface);
  rootStyle.setProperty('--color-surface-brand', palette.surface);
  rootStyle.setProperty('--color-text', palette.textMain);
  rootStyle.setProperty('--color-text-body', palette.textMain);
  rootStyle.setProperty('--color-text-main', palette.textMain);
  rootStyle.setProperty('--color-text-secondary', palette.textSecondary);
  rootStyle.setProperty('--color-border', palette.border);
  rootStyle.setProperty('--color-text-on-primary', getContrastText(palette.primary));
  rootStyle.setProperty('--color-primary-hover', palette.primary);
  rootStyle.setProperty('--color-accent', palette.accent);
  rootStyle.setProperty('--color-input-bg', palette.inputBg);
};

const deriveBrandOverride = (activeUnit: Unit | null): BrandOverride | undefined => {
  if (!activeUnit) return undefined;
  const configs: BrandColorConfig[] = activeUnit.brandColorConfigs?.length
    ? activeUnit.brandColorConfigs
    : (activeUnit as any).brandColors?.length
    ? (activeUnit as any).brandColors.map((color: string, idx: number) => ({
        id: `legacy-${idx}`,
        color,
        target: idx === 0 ? 'primary' : idx === 1 ? 'secondary' : 'background',
      }))
    : [];

  if (!configs.length) return undefined;

  const override: BrandOverride = {};
  configs.forEach(cfg => {
    if (!cfg.color) return;
    switch (cfg.target) {
      case 'primary':
        override.headerBg = cfg.color;
        break;
      case 'secondary':
        override.secondary = cfg.color;
        break;
      case 'background':
        override.background = cfg.color;
        break;
      default:
        break;
    }
  });

  return Object.keys(override).length ? override : undefined;
};

const disableTransitions = () => {
  const root = document.documentElement;
  const body = document.body;
  const previousRootTransition = root.style.transition;
  const previousBodyTransition = body.style.transition;
  root.style.transition = 'none';
  body.style.transition = 'none';
  return () => {
    requestAnimationFrame(() => {
      root.style.transition = previousRootTransition;
      body.style.transition = previousBodyTransition;
    });
  };
};

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit, bases, mode, brandMode }) => {
  useLayoutEffect(() => {
    const restoreTransitions = disableTransitions();
    clearVariables();

    const palette = bases[mode];
    const brandOverride = brandMode ? deriveBrandOverride(activeUnit) : undefined;

    applyPalette(palette, brandOverride);

    // Force paint to avoid flicker before re-enabling transitions
    void getComputedStyle(document.documentElement).getPropertyValue('--color-primary');
    restoreTransitions();
  }, [activeUnit, bases, mode, brandMode]);

  return null;
};

export default ThemeManager;
