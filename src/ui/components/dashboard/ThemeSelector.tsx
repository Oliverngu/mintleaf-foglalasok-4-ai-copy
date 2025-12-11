import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../../../core/models/data';
import { ThemeMode } from '../../../core/theme/ThemeManager';

interface ThemeSelectorProps {
  activeUnit?: Unit | null;
  value?: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'mintleaf_theme_mode';

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ activeUnit, value, onThemeChange }) => {
  const initialTheme = useMemo<ThemeMode>(() => {
    if (value) return value;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'mintleaf' || stored === 'dark' || stored === 'branded') {
        return stored;
      }
    }
    return 'mintleaf';
  }, [value]);

  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>(initialTheme);

  useEffect(() => {
    if (value && value !== selectedTheme) {
      setSelectedTheme(value);
    }
  }, [value, selectedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selectedTheme);
    } catch (error) {
      console.error('Failed to persist theme selection', error);
    }
    onThemeChange(selectedTheme);
  }, [selectedTheme, onThemeChange]);

  const brandColor = useMemo(() => {
    return (
      activeUnit?.brandColorConfigs?.find(cfg => cfg.target === 'primary')?.color ||
      (activeUnit as any)?.brandColors?.[0]
    );
  }, [activeUnit]);

  const renderButton = (
    id: ThemeMode,
    content: React.ReactNode,
    label: string,
    extraClasses = ''
  ) => {
    const isActive = selectedTheme === id;
    return (
      <button
        type="button"
        onClick={() => setSelectedTheme(id)}
        className={`relative w-10 h-10 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
          isActive ? 'ring-2 ring-offset-2 ring-blue-500' : ''
        } ${extraClasses}`}
        aria-label={label}
      >
        {content}
        {isActive && (
          <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold drop-shadow">
            ✓
          </span>
        )}
      </button>
    );
  };

  const brandedContent = () => {
    if (activeUnit?.logoUrl) {
      return <img src={activeUnit.logoUrl} alt={activeUnit.name} className="w-full h-full object-cover" />;
    }

    if (brandColor) {
      return <div className="w-full h-full" style={{ backgroundColor: brandColor }} aria-hidden="true" />;
    }

    return <div className="w-full h-full bg-gray-300" aria-hidden="true" />;
  };

  return (
    <div className="flex items-center gap-2">
      {renderButton('mintleaf', <div className="w-full h-full bg-green-600" aria-hidden="true" />, 'MintLeaf téma')}
      {renderButton('dark', <div className="w-full h-full bg-slate-900" aria-hidden="true" />, 'Sötét téma')}
      {renderButton('branded', brandedContent(), 'Branded téma', brandColor ? '' : '')}
    </div>
  );
};

export default ThemeSelector;
