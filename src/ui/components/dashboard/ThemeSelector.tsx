import React from 'react';
import { Unit } from '../../../core/models/data';
import AppleLogo from '../icons/AppleLogo'; // A MintLeaf Logo

export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  
  // --- ÚJ PROPOK A BRAND KAPCSOLÓHOZ ---
  activeUnit?: Unit | null;
  useBrandTheme: boolean;           // Be van-e nyomva a gomb?
  onBrandChange: (enabled: boolean) => void; // Kapcsoló funkció
}

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-orange-400">
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

  // Animáció letiltása váltáskor
  const handleSwitch = (callback: () => void) => {
    document.documentElement.classList.add('no-transition');
    callback();
  };

  // Közös stílus a gomboknak
  const btnClass = (isActive: boolean) => `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2
    ${isActive 
      ? 'border-blue-500 bg-white shadow-md scale-110 z-10' 
      : 'border-transparent hover:bg-black/5 opacity-70 hover:opacity-100'}
  `;

  // --- BRAND LOGIC ---
  // Akkor aktív a branding, ha a User bekapcsolta (useBrandTheme) ÉS van kiválasztva Unit
  const isBrandActive = useBrandTheme && !!activeUnit;

  // Stílus a Brand gombhoz
  const brandBtnClass = `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2 overflow-hidden
    ${isBrandActive
      ? 'border-green-500 shadow-md scale-110 z-10' // BEKAPCSOLVA (Zöld keret jelzi az aktív Unitot)
      : 'border-transparent opacity-70 hover:opacity-100 hover:bg-black/5' // KIKAPCSOLVA (MintLeaf)
    }
  `;

  // MintLeaf logó színe (Sötét/Világos mód szerint)
  const mintLeafLogoColor = currentTheme === 'dark' ? 'text-white' : 'text-green-600';

  return (
    <div className="flex items-center gap-2 p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
      
      {/* 1. LIGHT MODE */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange('light'))} 
        className={btnClass(currentTheme === 'light')} 
        aria-label="Világos mód"
      >
        <SunIcon />
      </button>

      {/* 2. DARK MODE */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange('dark'))} 
        className={btnClass(currentTheme === 'dark')} 
        aria-label="Sötét mód"
      >
        <MoonIcon />
      </button>

      {/* Elválasztó */}
      <div className="w-px h-5 bg-gray-300/50 mx-1"></div>

      {/* 3. BRAND TOGGLE (Unit vs MintLeaf) */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit} // Ha nincs unit, nem lehet bekapcsolni
        className={brandBtnClass}
        title={isBrandActive ? `Brand: ${activeUnit?.name}` : "Alapértelmezett téma (MintLeaf)"}
      >
        {isBrandActive && activeUnit?.logoUrl ? (
          // HA BE VAN KAPCSOLVA -> UNIT LOGO
          <img src={activeUnit.logoUrl} alt="Unit Logo" className="w-full h-full object-cover" />
        ) : (
          // HA KI VAN KAPCSOLVA -> MINTLEAF LOGO
          <div className={`p-1.5 ${isBrandActive ? '' : mintLeafLogoColor}`}>
             <AppleLogo /> 
          </div>
        )}
      </button>

    </div>
  );
};

export default ThemeSelector;
