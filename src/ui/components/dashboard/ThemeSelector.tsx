import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../../../core/models/data';
import { ThemeMode } from '../../../core/theme/types';

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
    strokeWidth={1.7}
    className={className}
  >
    <path
      d="M12 3c-3.75 0-7.5 2.25-7.5 6.375 0 5.25 5.25 11.25 7.5 11.25s7.5-6 7.5-11.25C19.5 5.25 15.75 3 12 3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9.75 12.75 12 15l2.25-2.25M12 8.25v6.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z" />
  </svg>
);

const ThemeSelector: React.FC<ThemeSelectorProps> = ({ activeUnit, value, onThemeChange }) => {
  const initial = useMemo<ThemeMode>(() => {
    if (value) return value;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return 'light';
  }, [value]);

  const [selected, setSelected] = useState<ThemeMode>(initial);

  useEffect(() => {
    if (value && value !== selected) {
      setSelected(value);
    }
  }, [value, selected]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selected);
    } catch (error) {
      console.error('Failed to persist theme selection', error);
    }
    onThemeChange(selected);
  }, [selected, onThemeChange]);

  const brandColor = useMemo(
    () =>
      activeUnit?.brandColorConfigs?.find(cfg => cfg.target === 'primary')?.color ||
      (activeUnit as any)?.brandColors?.[0],
    [activeUnit]
  );

  const renderButton = (id: ThemeMode, content: React.ReactNode, label: string, extraClasses = '') => {
    const isActive = selected === id;
    return (
      <button
        type="button"
        onClick={() => setSelected(id)}
        aria-label={label}
        className={`w-9 h-9 rounded-xl transition-all duration-200 flex items-center justify-center border-2 ${
          isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-110 shadow-lg border-transparent' : 'border-transparent opacity-70 hover:opacity-100'
        } ${extraClasses}`}
      >
        {content}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {renderButton(
        'light',
        <div className="w-full h-full flex items-center justify-center bg-white rounded-[10px]">
          <LeafIcon className="w-5 h-5 text-green-600" />
        </div>,
        'Világos téma'
      )}
      {renderButton(
        'dark',
        <div className="w-full h-full flex items-center justify-center bg-slate-800 rounded-[10px]">
          <MoonIcon className="w-5 h-5 text-yellow-400" />
        </div>,
        'Sötét téma'
      )}
      <div className="w-9 h-9 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden">
        {activeUnit?.logoUrl ? (
          <img src={activeUnit.logoUrl} alt={activeUnit.name} className="w-full h-full object-cover" />
        ) : brandColor ? (
          <div className="w-full h-full" style={{ backgroundColor: brandColor }} aria-hidden="true" />
        ) : (
          <div className="w-full h-full bg-gray-200" aria-hidden="true" />
        )}
      </div>
    </div>
  );
};

export default ThemeSelector;
