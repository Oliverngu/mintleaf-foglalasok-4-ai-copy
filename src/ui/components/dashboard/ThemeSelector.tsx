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
    fill="currentColor"
    className={className}
  >
    <path d="M3 13.5C3 7.701 7.701 3 13.5 3H21v7.5C21 16.299 16.299 21 10.5 21H3v-7.5Z" />
    <path
      d="M8 16c3-1.5 5.5-4 6.5-7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
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
        className={`relative w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-gray-200 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
          isActive ? 'ring-2 ring-offset-2 ring-green-500' : ''
        } ${extraClasses}`}
        aria-label={label}
      >
        {content}
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
      {renderButton(
        'mintleaf',
        (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <LeafIcon className="w-5 h-5 text-green-700" />
          </div>
        ),
        'MintLeaf téma'
      )}
      {renderButton(
        'dark',
        (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-yellow-200">
            <MoonIcon className="w-5 h-5" />
          </div>
        ),
        'Sötét téma'
      )}
      {renderButton(
        'branded',
        <div className="w-full h-full overflow-hidden rounded-xl">{brandedContent()}</div>,
        'Branded téma'
      )}
    </div>
  );
};

export default ThemeSelector;
