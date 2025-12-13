import React, { useLayoutEffect } from 'react';
import { Unit } from '../models/data';
import { ThemeMode, ThemeBases } from './types';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: ThemeMode;
  useBrandTheme?: boolean;
  adminConfig?: ThemeBases;
}

const ThemeManager: React.FC<ThemeManagerProps> = ({ activeUnit, themeMode, useBrandTheme, adminConfig }) => {
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
      '--color-header-bg',
      '--color-sidebar-bg',
      '--color-sidebar-hover',
      '--color-accent',
      '--color-input-bg',
      '--color-text-main',
      '--color-text-secondary',
      '--color-border',
    ];
    resetVars.forEach(v => root.style.removeProperty(v));

    if (themeMode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');

    const isLight = themeMode === 'light';
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    const set = (k: string, v: string) => root.style.setProperty(k, v);

    // 2. Base admin configuration
    set('--color-primary', config?.primary || '#15803d');
    set('--color-secondary', config?.secondary || '#15803d');
    set('--color-background', config?.background || (isLight ? '#f1f5f9' : '#020617'));
    set('--color-surface', config?.surface || (isLight ? '#ffffff' : '#1e293b'));
    set('--color-header-bg', config?.headerBg || (isLight ? '#15803d' : '#0f172a'));
    set('--color-sidebar-bg', config?.sidebarBg || (isLight ? '#ffffff' : '#1e293b'));
    set('--color-sidebar-hover', config?.sidebarHover || (isLight ? '#ecfdf3' : '#334155'));
    set('--color-accent', config?.accent || (isLight ? '#f97316' : '#22d3ee'));
    set('--color-input-bg', config?.inputBg || (isLight ? '#ffffff' : '#0f172a'));
    set('--color-text-main', config?.textMain || (isLight ? '#000000' : '#ffffff'));
    set('--color-text-secondary', config?.textSecondary || (isLight ? '#64748b' : '#94a3b8'));
    set('--color-border', config?.border || '#e2e8f0');

    let headerImage = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    const sidebarImage = config?.sidebarImage ? `url('${config.sidebarImage}')` : 'none';
    set('--ui-sidebar-image', sidebarImage);

    // 3. Brand overrides
    if (useBrandTheme && activeUnit) {
      if (activeUnit.brandColors?.primary) {
        set('--color-primary', activeUnit.brandColors.primary);
        set('--color-header-bg', activeUnit.brandColors.primary);
      }
      if (activeUnit.brandColors?.secondary) set('--color-secondary', activeUnit.brandColors.secondary);
      if (activeUnit.brandColors?.background) {
        set('--color-background', activeUnit.brandColors.background);
        set('--color-sidebar-bg', activeUnit.brandColors.background);
      }

      if (activeUnit.uiHeaderImageUrl) {
        headerImage = `url('${activeUnit.uiHeaderImageUrl}')`;
      }
    }

    set('--ui-header-image', headerImage);

    const shouldTintHeader = headerImage !== 'none';
    set('--ui-header-blend-mode', shouldTintHeader ? 'overlay' : 'normal');

    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transition')));
  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};
export default ThemeManager;
