import React from 'react';
import { Unit } from '../../../core/models/data';
// Ha van ThemeMode típusod definiálva máshol, importáld onnan, 
// de itt helyben is definiálom a biztonság kedvéért:
export type ThemeMode = 'light' | 'dark';

interface ThemeSelectorProps {
  currentTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  activeUnit?: Unit | null;
}

// --- IKONOK (Inline SVG a gyors betöltéshez) ---

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

const LeafLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-green-600">
    <path d="M16.5 5.25A9.75 9.75 0 005.25 16.5c2.973 0 5.753-1.013 7.962-2.712C12.44 11.232 10.96 8.356 10.5 5.25v-.75c0-.414.336-.75.75-.75.414 0 .75.336.75.75v.75c.46 3.106 1.94 5.982 4.198 8.538 2.21-1.699 3.802-4.14 3.802-6.788 0-.414-.336-.75-.75-.75-.414 0-.75.336-.75.75z" />
  </svg>
);

// --- KOMPONENS ---

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ currentTheme, onThemeChange, activeUnit }) => {

  const handleSwitch = (mode: ThemeMode) => {
    // 1. AZONNAL letiltjuk az animációkat globálisan
    document.documentElement.classList.add('no-transition');
    
    // 2. Jelezzük a változást (a szülő komponens frissíti a state-et -> ThemeManager reagál)
    onThemeChange(mode);
    
    // MEGJEGYZÉS: A 'no-transition' levételét a ThemeManager végzi el a useLayoutEffect-ben!
    // Itt nem kell setTimeout-ozni, mert az okozza a versenyhelyzetet.
  };

  // Közös gomb stílus
  const btnClass = (isActive: boolean) => `
    w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 border-2
    ${isActive 
      ? 'border-blue-500 bg-white shadow-md scale-110 z-10' 
      : 'border-transparent hover:bg-black/5 opacity-70 hover:opacity-100'}
  `;

  return (
    <div className="flex items-center gap-2 p-1 bg-white/40 backdrop-blur-md rounded-2xl border border-white/20 shadow-sm">
      
      {/* 1. LIGHT MODE GOMB */}
      <button
        onClick={() => handleSwitch('light')}
        className={btnClass(currentTheme === 'light')}
        aria-label="Világos mód"
      >
        <SunIcon />
      </button>

      {/* 2. DARK MODE GOMB */}
      <button
        onClick={() => handleSwitch('dark')}
        className={btnClass(currentTheme === 'dark')}
        aria-label="Sötét mód"
      >
        <MoonIcon />
      </button>

      {/* ELVÁLASZTÓ */}
      <div className="w-px h-5 bg-gray-300/50 mx-1"></div>

      {/* 3. LOGO (BRAND INDICATOR) - Ez csak kijelző, nem gomb */}
      <div className="w-9 h-9 rounded-xl overflow-hidden border border-gray-100 bg-white flex items-center justify-center shadow-sm" title={activeUnit?.name || "MintLeaf"}>
        {activeUnit?.logoUrl ? (
          <img 
            src={activeUnit.logoUrl} 
            alt="Unit Logo" 
            className="w-full h-full object-cover" 
          />
        ) : (
          <LeafLogo />
        )}
      </div>

    </div>
  );
};

export default ThemeSelector;
