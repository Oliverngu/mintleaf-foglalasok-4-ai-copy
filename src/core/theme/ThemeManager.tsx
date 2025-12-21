import React, { useLayoutEffect, useRef } from 'react';
import { Unit } from '../models/data';
import { ThemeMode, ThemeBases } from './types';
import { DEFAULT_BASES } from './storage';
import { normalizeColor, resolveThemePalette, mergeThemeBases } from './utils';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: ThemeMode;
  useBrandTheme?: boolean;
  adminConfig?: ThemeBases;
  unitTheme?: ThemeBases | null;
}

const ThemeManager: React.FC<ThemeManagerProps> = ({
  activeUnit,
  themeMode,
  useBrandTheme,
  adminConfig,
  unitTheme,
}) => {
  const lastAppliedKey = useRef<string>('');

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('no-transition');

    // 1. Reset all relevant CSS variables to avoid stale values
    const resetVars = [
      '--ui-header-image',
      '--ui-sidebar-image',
      '--ui-header-blend-mode',
      '--color-primary',
      '--color-secondary',
      '--color-background',
      '--color-surface',
      '--color-surface-card',
      '--color-header-bg',
      '--color-sidebar-bg',
      '--color-sidebar-hover',
      '--color-accent',
      '--color-input-bg',
      '--color-text-main',
      '--color-text-secondary',
      '--color-border',
      '--color-surface-static',
    ];
    resetVars.forEach(v => root.style.removeProperty(v));

    if (themeMode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');

    const isLight = themeMode === 'light';
    const bases = mergeThemeBases(adminConfig, DEFAULT_BASES);
    const unitBases = unitTheme ? mergeThemeBases(unitTheme, bases) : bases;
    const config = isLight ? bases.light : bases.dark;
    const unitConfig = isLight ? unitBases.light : unitBases.dark;
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    const pick = (
      key: keyof ThemeBases['light'],
      override?: Partial<ThemeBases['light']>
    ) =>
      normalizeColor(override?.[key]) ||
      normalizeColor(unitConfig?.[key]) ||
      normalizeColor(config?.[key]) ||
      DEFAULT_BASES[isLight ? 'light' : 'dark'][key] ||
      '';

    const resolvedPalette = resolveThemePalette({
      mode: isLight ? 'light' : 'dark',
      globalTheme: config,
      unitTheme: unitConfig,
    });

    // 2. Base admin configuration
    set('--color-primary', pick('primary'));
    set('--color-secondary', pick('secondary'));
    set('--color-background', pick('background'));
    set('--color-surface', resolvedPalette.surface);
    set('--color-surface-card', resolvedPalette.surfaceCard);
    set('--color-surface-static', '#ffffff');
    set('--color-header-bg', pick('headerBg'));
    set('--color-sidebar-bg', pick('sidebarBg'));
    set('--color-sidebar-hover', pick('sidebarHover'));
    set('--color-accent', pick('accent'));
    set('--color-input-bg', pick('inputBg'));
    set('--color-text-main', resolvedPalette.text);
    set('--color-text-secondary', pick('textSecondary'));
    set('--color-border', resolvedPalette.border);

    const headerImageValue = config?.headerImage || '';
    let headerImage = headerImageValue ? `url('${headerImageValue}')` : 'none';
    const sidebarImageValue = config?.sidebarImage || '';
    const sidebarImage = sidebarImageValue ? `url('${sidebarImageValue}')` : 'none';
    set('--ui-sidebar-image', sidebarImage);

    // 3. Brand overrides
    if (useBrandTheme && activeUnit) {
      const brandSurface =
        activeUnit.brandColors?.surface || activeUnit.brandColors?.background;
      const brandPrimary = normalizeColor(activeUnit.brandColors?.primary);
      const brandSecondary = normalizeColor(activeUnit.brandColors?.secondary);
      const brandBackground = normalizeColor(activeUnit.brandColors?.background);
      const brandSurfaceResolved = normalizeColor(brandSurface);
      const brandSurfaceCard =
        normalizeColor(activeUnit.brandColors?.surface) ||
        normalizeColor(activeUnit.brandColors?.background);
      if (brandPrimary) {
        set('--color-primary', brandPrimary);
        set('--color-header-bg', brandPrimary);
      }
      if (brandSecondary) set('--color-secondary', brandSecondary);
      if (brandSurfaceResolved) {
        set('--color-surface', brandSurfaceResolved);
      }
      if (brandSurfaceCard) {
        set('--color-surface-card', brandSurfaceCard);
      }
      if (brandBackground) {
        set('--color-background', brandBackground);
        set('--color-sidebar-bg', brandBackground);
      }

      if (activeUnit.uiHeaderImageUrl) {
        headerImage = `url('${activeUnit.uiHeaderImageUrl}')`;
      }
    }

    set('--ui-header-image', headerImage);

    const shouldTintHeader = headerImage !== 'none';
    set('--ui-header-blend-mode', shouldTintHeader ? 'overlay' : 'normal');

    const appliedKey = `${themeMode}-${resolvedPalette.surfaceCard}-${resolvedPalette.text}-${resolvedPalette.border}`;
    if (appliedKey !== lastAppliedKey.current) {
      lastAppliedKey.current = appliedKey;
    }

    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('no-transition'))
    );
  }, [activeUnit, themeMode, useBrandTheme, adminConfig, unitTheme]);

  return null;
};
export default ThemeManager;
