import React from 'react';
import { Unit } from '../../../core/models/data';
import AppleLogo from '../icons/AppleLogo'; // A MintLeaf Logo

export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit?: Unit | null;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ 
  currentTheme, 
  onThemeChange, 
  activeUnit,
  useBrandTheme,
  onBrandChange
}) => {

  const handleSwitch = (callback: () => void) => {
    document.documentElement.classList.add('no-transition');
    callback();
  };

  // Alap gomb stílus
  const btnBase = "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2 overflow-hidden";

  return (
    <div className="flex items-center gap-2 p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
      
      {/* 1. LIGHT MODE GOMB (MintLeaf stílus) */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange('light'))} 
        className={`${btnBase} ${currentTheme === 'light' 
          ? 'border-green-600 shadow-md scale-110 z-10 bg-white' 
          : 'border-transparent opacity-70 hover:opacity-100 hover:bg-white/50'}`}
        title="Világos téma"
      >
        <div className="text-green-700 p-1.5">
           <AppleLogo />
        </div>
      </button>

      {/* 2. DARK MODE GOMB (MintLeaf Dark stílus) */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange('dark'))} 
        className={`${btnBase} ${currentTheme === 'dark' 
          ? 'border-blue-500 shadow-md scale-110 z-10 bg-slate-900' // Dark active
          : 'border-transparent opacity-70 hover:opacity-100 bg-slate-800 hover:bg-slate-700'}`} // Dark inactive
        title="Sötét téma"
      >
        <div className="text-white p-1.5">
           <AppleLogo />
        </div>
      </button>

      {/* Elválasztó */}
      <div className="w-px h-5 bg-gray-300/50 mx-1"></div>

      {/* 3. BRAND KAPCSOLÓ */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={`${btnBase} ${useBrandTheme && activeUnit
          ? 'border-green-500 shadow-md scale-110 z-10' // BEKAPCSOLVA
          : 'border-transparent opacity-70 hover:opacity-100' // KIKAPCSOLVA
        }`}
        title={useBrandTheme ? `Brand: ${activeUnit?.name}` : "Alapértelmezett MintLeaf téma"}
      >
        {useBrandTheme && activeUnit?.logoUrl ? (
          // HA AKTÍV: UNIT LOGO
          <img src={activeUnit.logoUrl} alt="Unit Logo" className="w-full h-full object-cover" />
        ) : (
          // HA INAKTÍV: MINTLEAF LOGO (Szürke/Semleges)
          <div className="bg-gray-100 w-full h-full flex items-center justify-center text-gray-500 p-1.5">
             <AppleLogo /> 
          </div>
        )}
      </button>

    </div>
  );
};

export default ThemeSelector;
