import React, { useLayoutEffect } from 'react';
import { Unit } from '../models/data';

interface ThemeManagerProps {
  activeUnit: Unit | null;
  themeMode: 'light' | 'dark';
  useBrandTheme?: boolean;
  adminConfig?: any;
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

    // 2. TAKARÍTÁS (Minden UI-specifikus változó törlése)
    // Ez biztosítja, hogy ne maradjon bent a Unit képe, ha kikapcsoljuk a brandet
    root.style.removeProperty('--ui-header-image');
    root.style.removeProperty('--ui-sidebar-image');
    root.style.removeProperty('--ui-bg-image');
    root.style.removeProperty('--ui-header-blend-mode');

    const isLight = themeMode === 'light';
    const config = isLight ? adminConfig?.light : adminConfig?.dark;

    // 3. ALAPÉRTELMEZETT (BASE) TÉMA BEÁLLÍTÁSA
    // Ezek mindig beállítódnak, függetlenül a brand kapcsolótól
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

    // 4. DEFAULT KÉPEK (Admin Config)
    // Alapból ezeket töltjük be. Ha nincs brand, ezek maradnak.
    const defaultHeaderImg = config?.headerImage ? `url('${config.headerImage}')` : 'none';
    const defaultSidebarImg = config?.sidebarImage ? `url('${config.sidebarImage}')` : 'none';
    const defaultBgImg = config?.backgroundImage ? `url('${config.backgroundImage}')` : 'none';

    root.style.setProperty('--ui-header-image', defaultHeaderImg);
    root.style.setProperty('--ui-sidebar-image', defaultSidebarImg);
    root.style.setProperty('--ui-bg-image', defaultBgImg);
    
    // Alapból NINCS keverés (normál kép)
    root.style.setProperty('--ui-header-blend-mode', 'normal'); 

    // 5. BRAND FELÜLÍRÁS (Csak ha BE van kapcsolva a gomb)
    if (activeUnit && useBrandTheme) {
      const colors = activeUnit.brandColors;

      // Színek felülírása
      if (colors?.primary) {
        root.style.setProperty('--color-header-bg', colors.primary);
        root.style.setProperty('--color-primary', colors.primary);
        
        // TINT LOGIKA: Csak brand módban keverjük a színt a képpel
        if (defaultHeaderImg !== 'none') {
           root.style.setProperty('--ui-header-blend-mode', 'overlay'); 
        }
      }
      if (colors?.secondary) root.style.setProperty('--color-secondary', colors.secondary);
      if (colors?.background) root.style.setProperty('--color-background', colors.background);

      // Képek felülírása (Ha a Unitnak van sajátja, az nyer)
      if (activeUnit.uiHeaderImageUrl) {
         root.style.setProperty('--ui-header-image', `url('${activeUnit.uiHeaderImageUrl}')`);
         root.style.setProperty('--ui-header-blend-mode', 'normal'); // Saját képnél nincs tint
      }
      if (activeUnit.uiBackgroundImageUrl) {
         root.style.setProperty('--ui-bg-image', `url('${activeUnit.uiBackgroundImageUrl}')`);
      }
    }

    // 6. ANIMÁCIÓ VISSZAKAPCSOLÁSA
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transition');
      });
    });

  }, [activeUnit, themeMode, useBrandTheme, adminConfig]);

  return null;
};

export default ThemeManager;
