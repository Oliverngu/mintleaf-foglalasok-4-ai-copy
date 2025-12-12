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

    // 1. ANIMÁCIÓ STOP
    root.classList.add('no-transition');
    const _forceReflow = root.offsetHeight;

    // 2. TAILWIND CLASS (Dark/Light)
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // 3. TAKARÍTÁS (Minden korábbi UI változó törlése)
    // Ez kritikus: ha kikapcsoljuk a brandet, ezeknek el kell tűnniük!
    root.style.removeProperty('--ui-header-image');
    root.style.removeProperty('--ui-sidebar-image');
    root.style.removeProperty('--ui-bg-image');
    root.style.removeProperty('--ui-header-blend-mode');

    const isLight = themeMode === 'light';
    
    // Config kiválasztása (Admin vagy Hardcoded)
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    // 4. ALAPÉRTELMEZETT (ADMIN/DEFAULT) SZÍNEK BEÁLLÍTÁSA
    // Először mindig ezt állítjuk be. Így ha a brand ki van kapcsolva, ez érvényesül.
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

    // 5. DEFAULT KÉPEK BEÁLLÍTÁSA (Admin által feltöltött)
    // Ha nincs admin kép, akkor 'none' lesz.
    const defaultHeaderImg = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    const defaultBgImg = config?.backgroundImage ? `url('${config.backgroundImage}')` : 'none';

    root.style.setProperty('--ui-header-image', defaultHeaderImg);
    root.style.setProperty('--ui-bg-image', defaultBgImg);
    root.style.setProperty('--ui-header-blend-mode', 'normal'); 

    // 6. BRAND FELÜLÍRÁS (Csak ha a gomb BE van nyomva!)
    if (activeUnit && useBrandTheme) {
      const colors = activeUnit.brandColors;

      // Színek felülírása
      if (colors?.primary) {
        root.style.setProperty('--color-header-bg', colors.primary);
        root.style.setProperty('--color-primary', colors.primary);
        
        // TINT LOGIKA: Ha van default kép (admin), de brand színt használunk -> Keverés
        if (defaultHeaderImg !== 'none') {
           root.style.setProperty('--ui-header-blend-mode', 'overlay'); 
        }
      }
      if (colors?.secondary) root.style.setProperty('--color-secondary', colors.secondary);
      if (colors?.background) root.style.setProperty('--color-background', colors.background);

      // Unit SAJÁT képei (Ezek a legerősebbek)
      if (activeUnit.uiHeaderImageUrl) {
         root.style.setProperty('--ui-header-image', `url('${activeUnit.uiHeaderImageUrl}')`);
         root.style.setProperty('--ui-header-blend-mode', 'normal'); // Saját képnél nincs színezés
      }
      if (activeUnit.uiBackgroundImageUrl) {
         root.style.setProperty('--ui-bg-image', `url('${activeUnit.uiBackgroundImageUrl}')`);
      }
    }

    // 7. ANIMÁCIÓ VISSZAKAPCSOLÁSA
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transition');
      });
    });

  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};

export default ThemeManager;
