import React from 'react';
import { Unit } from '../../../core/models/data';
import AppleLogo from '../icons/AppleLogo'; // MintLeaf Logo

export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit?: Unit | null;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
}

// Ikonok definíciója
const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-orange-500">
    <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-yellow-400">
    <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
  </svg>
);

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ 
  currentTheme, 
  onThemeChange, 
  activeUnit,
  useBrandTheme,
  onBrandChange
}) => {

  // Segédfüggvény a sima váltáshoz
  const handleTransition = (callback: () => void) => {
    document.documentElement.classList.add('no-transition');
    callback();
    // A no-transition levételét a ThemeManager intézi a useLayoutEffect-ben
  };

  const isLight = currentTheme === 'light';

  // --- 1. LIGHT/DARK GOMB STÍLUS ---
  const modeBtnClass = `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2
    ${isLight 
      ? 'bg-white border-orange-100 shadow-sm text-orange-500 hover:bg-orange-50' // Light Mode Aktív
      : 'bg-slate-800 border-slate-700 shadow-sm text-yellow-400 hover:bg-slate-700' // Dark Mode Aktív
    }
  `;

  // --- 2. BRAND GOMB STÍLUS ---
  const brandBtnClass = `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2 overflow-hidden
    ${useBrandTheme && activeUnit
      ? 'border-green-500 shadow-md scale-105 z-10' // AKTÍV (Zöld keret)
      : 'border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0' // INAKTÍV (Szürke, átlátszó)
    }
  `;

  return (
    <div className="flex items-center gap-3 p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
      
      {/* 1. LIGHT/DARK VÁLTÓ (Egyetlen gomb) */}
      <button 
        onClick={() => handleTransition(() => onThemeChange(isLight ? 'dark' : 'light'))} 
        className={modeBtnClass}
        title={isLight ? "Váltás sötét módra" : "Váltás világos módra"}
      >
        {isLight ? <SunIcon /> : <MoonIcon />}
      </button>

      {/* Elválasztó */}
      <div className="w-px h-5 bg-gray-400/30 mx-1"></div>

      {/* 2. BRAND KAPCSOLÓ (Unit Logo) */}
      <button
        onClick={() => handleTransition(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={brandBtnClass}
        title={useBrandTheme ? `Brand kikapcsolása (${activeUnit?.name})` : "Brand bekapcsolása"}
      >
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt="Unit Logo" className="w-full h-full object-cover" />
        ) : (
          // Ha nincs Unit Logo, de van Unit, akkor betűjel vagy MintLeaf
          <div className="bg-gray-200 w-full h-full flex items-center justify-center text-gray-500 p-1.5">
             <AppleLogo /> 
          </div>
        )}
      </button>

    </div>
  );
};

export default ThemeSelector;
