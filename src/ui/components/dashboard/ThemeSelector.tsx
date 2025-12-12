import React from 'react';
import { Unit } from '../../../core/models/data';
import AppleLogo from '../icons/AppleLogo'; // ✅ MintLeaf Logo

export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit?: Unit | null;
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

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ currentTheme, onThemeChange, activeUnit }) => {

  const handleSwitch = (mode: ThemeMode) => {
    document.documentElement.classList.add('no-transition');
    onThemeChange(mode);
  };

  const btnClass = (isActive: boolean) => `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2
    ${isActive 
      ? 'border-blue-500 bg-white shadow-md scale-110 z-10' 
      : 'border-transparent hover:bg-black/5 opacity-70 hover:opacity-100'}
  `;

  // --- LOGIC: Indikátor színe ---
  // Ha Light: Fehér doboz, Zöld logó
  // Ha Dark: Sötét doboz (slate-800), Fehér logó
  const isDark = currentTheme === 'dark';
  
  const indicatorBoxClass = `w-9 h-9 rounded-xl overflow-hidden border flex items-center justify-center shadow-sm transition-colors duration-200
    ${isDark 
      ? 'bg-slate-800 border-slate-700'  // Dark Mode Doboz
      : 'bg-white border-gray-100'       // Light Mode Doboz
    }
  `;

  const mintLeafLogoColor = isDark 
    ? 'text-white'        // Negatív (Fehér)
    : 'text-green-600';   // Eredeti (Zöld)

  return (
    <div className="flex items-center gap-2 p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
      
      {/* Light Mode Gomb */}
      <button onClick={() => handleSwitch('light')} className={btnClass(currentTheme === 'light')} aria-label="Világos mód">
        <SunIcon />
      </button>

      {/* Dark Mode Gomb */}
      <button onClick={() => handleSwitch('dark')} className={btnClass(currentTheme === 'dark')} aria-label="Sötét mód">
        <MoonIcon />
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-gray-300/50 mx-1"></div>

      {/* Brand/Logo Indicator (User Feedback) */}
      <div className={indicatorBoxClass} title={activeUnit?.name || "MintLeaf"}>
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt="Logo" className="w-full h-full object-cover" />
        ) : (
          <div className={`p-1.5 ${mintLeafLogoColor}`}>
             <AppleLogo /> 
          </div>
        )}
      </div>

    </div>
  );
};

export default ThemeSelector;
