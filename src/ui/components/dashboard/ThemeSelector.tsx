import React from 'react';
import { Unit } from '../../../core/models/data';
import AppleLogo from '../icons/AppleLogo';

export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit?: Unit | null;
  useBrandTheme: boolean;
  onBrandChange: (enabled: boolean) => void;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ 
  currentTheme, onThemeChange, activeUnit, useBrandTheme, onBrandChange
}) => {
  const handleSwitch = (cb: () => void) => {
    document.documentElement.classList.add('no-transition');
    cb();
  };
  const isLight = currentTheme === 'light';
  
  // FIX: w-8 h-8, flex center, no padding on button itself
  const btnBase = "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 border-2 shadow-sm focus:outline-none";

  return (
    <div className="flex items-center gap-2 p-1 bg-white/30 backdrop-blur-md rounded-full border border-white/20">
      
      {/* 1. Módváltó */}
      <button 
        onClick={() => handleSwitch(() => onThemeChange(isLight ? 'dark' : 'light'))} 
        className={`${btnBase} ${isLight ? 'bg-white border-white text-green-600' : 'bg-slate-800 border-slate-700 text-white'}`}
      >
        <div className="w-4 h-4 flex items-center justify-center"><AppleLogo /></div>
      </button>

      <div className="w-px h-4 bg-white/50"></div>

      {/* 2. Brand kapcsoló */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={`${btnBase} overflow-hidden ${useBrandTheme && activeUnit ? 'border-green-500 ring-1 ring-green-500' : 'border-transparent bg-white/50 grayscale opacity-70'}`}
      >
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} className="w-full h-full object-cover" alt="" />
        ) : (
          <div className="w-4 h-4 text-gray-600 flex items-center justify-center"><AppleLogo /></div>
        )}
      </button>
    </div>
  );
};
export default ThemeSelector;
