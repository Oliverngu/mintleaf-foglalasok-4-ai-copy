import React, { useLayoutEffect } from 'react';
import { Unit } from '../models/data';
import { ThemeMode, ThemeBases } from './types';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: ThemeMode;
  useBrandTheme?: boolean;
  adminConfig?: ThemeBases;
}

const ThemeManager: React.FC<ThemeManagerProps> = ({
  activeUnit,
  themeMode,
  useBrandTheme,
  adminConfig,
}) => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('no-transition');

    // 1) Reset all relevant CSS variables to avoid stale values
    const resetVars = [
      '--ui-header-image',
      '--ui-sidebar-image',
      '--ui-header-blend-mode',

      '--color-primary',
      '--color-secondary',
      '--color-background',
      '--color-surface',
      '--color-header-bg',
      '--color-sidebar-bg',
      '--color-sidebar-hover',
      '--color-accent',
      '--color-input-bg',
      '--color-text-main',
      '--color-text-secondary',
      '--color-border',

      // IMPORTANT: global app background vars (body uses these)
      '--app-bg',
      '--app-bg-image',
      '--app-bg-size',
      '--app-bg-position',
      '--app-bg-repeat',
      '--app-bg-attachment',
    ];
    resetVars.forEach(v => root.style.removeProperty(v));

    // 2) Theme mode class
    if (themeMode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    const isLight = themeMode === 'light';
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    const set = (k: string, v: string) => root.style.setProperty(k, v);

    // 3) Base admin configuration
    const basePrimary = config?.primary || '#15803d';
    const baseSecondary = config?.secondary || '#15803d';
    const baseBackground = config?.background || (isLight ? '#f1f5f9' : '#020617');
    const baseSurface = config?.surface || (isLight ? '#ffffff' : '#1e293b');
    const baseHeaderBg = config?.headerBg || (isLight ? '#15803d' : '#0f172a');
    const baseSidebarBg = config?.sidebarBg || (isLight ? '#ffffff' : '#1e293b');
    const baseSidebarHover = config?.sidebarHover || (isLight ? '#ecfdf3' : '#334155');
    const baseAccent = config?.accent || (isLight ? '#f97316' : '#22d3ee');
    const baseInputBg = config?.inputBg || (isLight ? '#ffffff' : '#0f172a');
    const baseTextMain = config?.textMain || (isLight ? '#000000' : '#ffffff');
    const baseTextSecondary = config?.textSecondary || (isLight ? '#64748b' : '#94a3b8');
    const baseBorder = config?.border || '#e2e8f0';

    set('--color-primary', basePrimary);
    set('--color-secondary', baseSecondary);
    set('--color-background', baseBackground);
    set('--color-surface', baseSurface);
    set('--color-header-bg', baseHeaderBg);
    set('--color-sidebar-bg', baseSidebarBg);
    set('--color-sidebar-hover', baseSidebarHover);
    set('--color-accent', baseAccent);
    set('--color-input-bg', baseInputBg);
    set('--color-text-main', baseTextMain);
    set('--color-text-secondary', baseTextSecondary);
    set('--color-border', baseBorder);

    // Header + sidebar images from admin config
    let headerImage = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    const sidebarImage = config?.sidebarImage ? `url('${config.sidebarImage}')` : 'none';
    set('--ui-sidebar-image', sidebarImage);

    // 4) Brand overrides
    let resolvedAppBackground = baseBackground;

    if (useBrandTheme && activeUnit) {
      if (activeUnit.brandColors?.primary) {
        set('--color-primary', activeUnit.brandColors.primary);
        set('--color-header-bg', activeUnit.brandColors.primary);
      }
      if (activeUnit.brandColors?.secondary) {
        set('--color-secondary', activeUnit.brandColors.secondary);
      }
      if (activeUnit.brandColors?.background) {
        resolvedAppBackground = activeUnit.brandColors.background;
        set('--color-background', resolvedAppBackground);
        set('--color-sidebar-bg', resolvedAppBackground);
      }

      if (activeUnit.uiHeaderImageUrl) {
        headerImage = `url('${activeUnit.uiHeaderImageUrl}')`;
      }
    }

    set('--ui-header-image', headerImage);

    const shouldTintHeader = headerImage !== 'none';
    set('--ui-header-blend-mode', shouldTintHeader ? 'overlay' : 'normal');

    // 5) IMPORTANT: bind "global body background" to the resolved background
    // This fixes the "background ends / white gap" issue on desktop.
    set('--app-bg', resolvedAppBackground);

    // Optional defaults (safe; only matter if you later add background images)
    set('--app-bg-image', 'none');
    set('--app-bg-size', 'cover');
    set('--app-bg-position', 'center');
    set('--app-bg-repeat', 'no-repeat');
    set('--app-bg-attachment', 'scroll');

    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('no-transition'))
    );
  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};

export default ThemeManager;
