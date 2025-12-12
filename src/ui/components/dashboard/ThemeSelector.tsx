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

  // --- STÍLUSOK ---
  // w-9 h-9 = 36px (Kompakt méret)
  // rounded-full = Teljesen kerek
  const btnBase = "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 border-2 overflow-hidden shadow-sm";

  return (
    <div className="flex items-center gap-2 p-1 bg-white/30 backdrop-blur-md rounded-full border border-white/20 shadow-sm">
      
      {/* 1. MÓD VÁLTÓ (EGYETLEN GOMB: NAP/HOLD HELYETT LOGÓ) */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange(isLight ? 'dark' : 'light'))} 
        className={`${btnBase} ${isLight 
          ? 'bg-white border-green-100 text-green-600 hover:bg-green-50'   // Light: Fehér gomb, Zöld logó
          : 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700' // Dark: Sötét gomb, Fehér logó
        }`}
        title={isLight ? "Váltás sötét módra" : "Váltás világos módra"}
      >
        {/* PONTOS IGAZÍTÁS: p-2, hogy a logó ne érjen a szélére */}
        <div className="w-5 h-5">
           <AppleLogo />
        </div>
      </button>

      {/* Elválasztó */}
      <div className="w-px h-5 bg-white/40 mx-0.5"></div>

      {/* 2. BRAND KAPCSOLÓ (Unit Logo) */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={`${btnBase} ${useBrandTheme && activeUnit
          ? 'border-green-500 ring-2 ring-green-500/20 z-10' // AKTÍV (Zöld keret)
          : 'border-transparent opacity-60 hover:opacity-100 grayscale hover:grayscale-0 bg-white/50' // INAKTÍV
        }`}
        title={useBrandTheme ? `Brand kikapcsolása (${activeUnit?.name})` : "Brand bekapcsolása"}
      >
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt="Brand" className="w-full h-full object-cover" />
        ) : (
          // Ha nincs Unit Logo -> Szürke MintLeaf
          <div className="w-5 h-5 text-gray-500">
             <AppleLogo /> 
          </div>
        )}
      </button>

    </div>
  );
};

export default ThemeSelector;
