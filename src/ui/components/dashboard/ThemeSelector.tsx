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
  currentTheme,
  onThemeChange,
  activeUnit,
  useBrandTheme,
  onBrandChange,
}) => {
  const handleSwitch = (cb: () => void) => {
    document.documentElement.classList.add('no-transition');
    cb();
  };

  const isLight = currentTheme === 'light';

  return (
    <div className="flex items-center gap-2">
      {/* Mode Switch */}
      <button
        onClick={() => handleSwitch(() => onThemeChange(isLight ? 'dark' : 'light'))}
        className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-200 shadow-sm ${
          isLight ? 'bg-white/80 border-white/70 text-green-700' : 'bg-slate-800 border-slate-700 text-white'
        }`}
        type="button"
      >
        <span className="flex items-center justify-center w-5 h-5">
          <AppleLogo />
        </span>
      </button>

      {/* Brand Switch */}
      <button
        onClick={() => handleSwitch(() => onBrandChange(!useBrandTheme))}
        disabled={!activeUnit}
        className={`w-9 h-9 rounded-full overflow-hidden border transition-all duration-200 shadow-sm flex items-center justify-center ${
          useBrandTheme && activeUnit
            ? 'border-green-500 ring-1 ring-green-500'
            : 'border-slate-200 bg-white/80 text-slate-500'
        } ${!activeUnit ? 'opacity-60 cursor-not-allowed' : ''}`}
        type="button"
      >
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt="Unit logo" className="w-full h-full object-cover" />
        ) : (
          <span className="flex items-center justify-center w-5 h-5">
            <AppleLogo />
          </span>
        )}
      </button>
    </div>
  );
};
export default ThemeSelector;
