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
  useBrandTheme = false,
  adminConfig 
}) => {
  
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('no-transition');
    const _forceReflow = root.offsetHeight;

    // 1. CLASS
    if (themeMode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');

    // 2. TAKARÍTÁS
    root.style.removeProperty('--ui-header-image');
    root.style.removeProperty('--ui-sidebar-image');
    root.style.removeProperty('--ui-bg-image');
    root.style.removeProperty('--ui-header-blend-mode');

    const isLight = themeMode === 'light';
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    // 3. BASE CONFIG ALKALMAZÁSA (Admin által beállított értékek)
    // Ha nincs config (pl. első betöltés), használjuk a fallbacket.
    
    // Színek
    root.style.setProperty('--color-primary', config?.primary || (isLight ? '#15803d' : '#3b82f6'));
    root.style.setProperty('--color-secondary', config?.secondary || (isLight ? '#15803d' : '#3b82f6'));
    root.style.setProperty('--color-background', config?.background || (isLight ? '#f1f5f9' : '#020617'));
    root.style.setProperty('--color-surface', config?.surface || (isLight ? '#ffffff' : '#1e293b'));
    root.style.setProperty('--color-surface-static', '#ffffff');
    root.style.setProperty('--color-header-bg', config?.headerBg || (isLight ? '#15803d' : '#0f172a'));
    root.style.setProperty('--color-sidebar-bg', config?.sidebarBg || (isLight ? '#ffffff' : '#0f172a'));
    root.style.setProperty('--color-sidebar-text', isLight ? '#334155' : '#e2e8f0');
    root.style.setProperty('--color-text-main', isLight ? '#0f172a' : '#f1f5f9');
    root.style.setProperty('--color-text-secondary', isLight ? '#64748b' : '#94a3b8');
    root.style.setProperty('--color-border', isLight ? '#e2e8f0' : '#334155');

    // Képek (Admin Default)
    const defHeader = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    const defBg = config?.backgroundImage ? `url('${config.backgroundImage}')` : 'none';
    const defSidebar = config?.sidebarImage ? `url('${config.sidebarImage}')` : 'none';

    root.style.setProperty('--ui-header-image', defHeader);
    root.style.setProperty('--ui-bg-image', defBg);
    root.style.setProperty('--ui-sidebar-image', defSidebar);
    root.style.setProperty('--ui-header-blend-mode', 'normal');

    // 4. BRAND OVERRIDE (Csak ha BE van kapcsolva!)
    if (activeUnit && useBrandTheme) {
      const colors = activeUnit.brandColors;

      if (colors?.primary) {
        root.style.setProperty('--color-header-bg', colors.primary);
        root.style.setProperty('--color-primary', colors.primary);
        if (defHeader !== 'none') root.style.setProperty('--ui-header-blend-mode', 'overlay');
      }
      if (colors?.secondary) root.style.setProperty('--color-secondary', colors.secondary);
      if (colors?.background) root.style.setProperty('--color-background', colors.background);

      // Képek
      if (activeUnit.uiHeaderImageUrl) {
         root.style.setProperty('--ui-header-image', `url('${activeUnit.uiHeaderImageUrl}')`);
         root.style.setProperty('--ui-header-blend-mode', 'normal');
      }
      if (activeUnit.uiBackgroundImageUrl) {
         root.style.setProperty('--ui-bg-image', `url('${activeUnit.uiBackgroundImageUrl}')`);
      }
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove('no-transition'));
    });

  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};

export default ThemeManager;
