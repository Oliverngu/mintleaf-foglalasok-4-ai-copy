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

  const isLight = currentTheme === 'light';

  // --- KÖZÖS GOMB STÍLUS (Most már rounded-full!) ---
  const btnBase = "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 border-2 overflow-hidden shadow-sm";

  return (
    <div className="flex items-center gap-3 p-1.5 bg-white/30 backdrop-blur-md rounded-full border border-white/20 shadow-sm">
      
      {/* 1. MÓD VÁLTÓ (EGYETLEN GOMB) */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange(isLight ? 'dark' : 'light'))} 
        className={`${btnBase} ${isLight 
          ? 'bg-white border-white text-green-600 hover:bg-gray-50'   // Light Mode (Zöld levél)
          : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700' // Dark Mode (Fehér levél)
        }`}
        title={isLight ? "Váltás sötét módra" : "Váltás világos módra"}
      >
        <div className="p-2 w-full h-full">
           <AppleLogo />
        </div>
      </button>

      {/* Elválasztó */}
      <div className="w-px h-6 bg-white/40 mx-1"></div>

      {/* 2. BRAND KAPCSOLÓ (Unit Logo) */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={`${btnBase} ${useBrandTheme && activeUnit
          ? 'border-green-500 scale-105 z-10 ring-2 ring-green-500/20' // BEKAPCSOLVA (Kiemelt)
          : 'border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0 bg-gray-200' // KIKAPCSOLVA
        }`}
        title={useBrandTheme ? `Brand kikapcsolása (${activeUnit?.name})` : "Brand bekapcsolása"}
      >
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt="Unit Logo" className="w-full h-full object-cover" />
        ) : (
          // Ha nincs Unit Logo, de van Unit -> Szürke MintLeaf
          <div className="w-full h-full flex items-center justify-center text-gray-500 p-2">
             <AppleLogo /> 
          </div>
        )}
      </button>

    </div>
  );
};

export default ThemeSelector;
