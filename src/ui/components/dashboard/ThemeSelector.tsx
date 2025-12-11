import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../../../core/models/data';
import { ThemeMode } from '../../../core/theme/ThemeManager';

interface ThemeSelectorProps {
  activeUnit?: Unit | null;
  value?: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'mintleaf_theme_mode';

const LeafIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    className={className}
  >
    <path d="M5 7.5c0 2.8 3.925 5.25 7 5.25s7-2.45 7-5.25S15.075 2.25 12 2.25 5 4.7 5 7.5Z" />
    <path d="M5 7.5v9c0 2.8 3.925 5.25 7 5.25s7-2.45 7-5.25v-9" />
    <path d="M5 11.25c0 2.8 3.925 5.25 7 5.25s7-2.45 7-5.25" />
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z" />
  </svg>
);

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

  const renderButton = (id: ThemeMode, content: React.ReactNode, label: string, extraClasses = '') => {
    const isActive = selectedTheme === id;
    return (
      <button
        type="button"
        onClick={() => setSelectedTheme(id)}
        aria-label={label}
        className={`w-9 h-9 rounded-xl transition-all duration-200 flex items-center justify-center border-2 ${
          isActive ? 'border-blue-500 scale-110 shadow-lg opacity-100' : 'border-transparent opacity-70 hover:opacity-100'
        } ${extraClasses}`}
      >
        {content}
      </button>
    );
  };

  const brandedContent = () => {
    if (activeUnit?.logoUrl) {
      return (
        <img
          src={activeUnit.logoUrl}
          alt={activeUnit.name}
          className="w-full h-full object-cover rounded-[10px]"
        />
      );
    }

    if (brandColor) {
      return <div className="w-full h-full rounded-[10px]" style={{ backgroundColor: brandColor }} aria-hidden="true" />;
    }

    return <div className="w-full h-full rounded-[10px] bg-gray-300" aria-hidden="true" />;
  };

  return (
    <div className="flex items-center gap-3">
      {renderButton(
        'mintleaf',
        <div className="w-full h-full flex items-center justify-center bg-white rounded-[10px]">
          <LeafIcon className="w-5 h-5 text-green-600" />
        </div>,
        'MintLeaf téma'
      )}
      {renderButton(
        'dark',
        <div className="w-full h-full flex items-center justify-center bg-slate-800 rounded-[10px]">
          <MoonIcon className="w-5 h-5 text-yellow-400" />
        </div>,
        'Sötét téma'
      )}
      {renderButton('branded', <div className="w-full h-full overflow-hidden">{brandedContent()}</div>, 'Branded téma')}
    </div>
  );
};

export default ThemeSelector;
