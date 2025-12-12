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
    
    // 1. Reset
    root.style.removeProperty('--ui-header-image');
    root.style.removeProperty('--ui-header-blend-mode');
    if (themeMode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');

    const isLight = themeMode === 'light';
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    // 2. Base Set
    const set = (k: string, v: string) => root.style.setProperty(k, v);
    set('--color-primary', config?.primary || '#15803d');
    set('--color-secondary', config?.secondary || '#15803d');
    set('--color-background', config?.background || (isLight ? '#f1f5f9' : '#020617'));
    set('--color-surface', config?.surface || (isLight ? '#ffffff' : '#1e293b'));
    set('--color-header-bg', config?.headerBg || (isLight ? '#15803d' : '#0f172a'));
    set('--color-text-main', config?.textMain || (isLight ? '#000000' : '#ffffff'));
    set('--color-border', config?.border || '#e2e8f0');

    // 3. Images
    const defHeader = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    set('--ui-header-image', defHeader);
    set('--ui-header-blend-mode', 'normal');

    // 4. Brand Override
    if (activeUnit && useBrandTheme) {
        if (activeUnit.brandColors?.primary) {
            set('--color-header-bg', activeUnit.brandColors.primary);
            set('--color-primary', activeUnit.brandColors.primary);
            if (defHeader !== 'none') set('--ui-header-blend-mode', 'overlay');
        }
        if (activeUnit.brandColors?.secondary) set('--color-secondary', activeUnit.brandColors.secondary);
        if (activeUnit.brandColors?.background) set('--color-background', activeUnit.brandColors.background);
        
        if (activeUnit.uiHeaderImageUrl) {
            set('--ui-header-image', `url('${activeUnit.uiHeaderImageUrl}')`);
            set('--ui-header-blend-mode', 'normal');
        }
    }

    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-transition')));
  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};
export default ThemeManager;
