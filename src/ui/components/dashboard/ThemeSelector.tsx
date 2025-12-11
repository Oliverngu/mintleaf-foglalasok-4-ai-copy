import React, { useEffect, useMemo, useState } from 'react';
import { Unit } from '../../../core/models/data';
import { ThemeMode } from '../../../core/theme/ThemeManager';

interface ThemeSelectorProps {
  activeUnit?: Unit | null;
  value?: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'mintleaf_theme_mode';

const THEME_OPTIONS: { id: ThemeMode; label: string; description: string; preview: string[] }[] = [
  {
    id: 'mintleaf',
    label: 'MintLeaf',
    description: 'Alapértelmezett világos téma',
    preview: ['#ecfdf3', '#22c55e', '#0f172a'],
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Sötét mód éjjeli használathoz',
    preview: ['#0f172a', '#1e293b', '#3b82f6'],
  },
  {
    id: 'branded',
    label: 'Branded',
    description: 'Egység arculata',
    preview: [],
  },
];

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

  const brandedPreview = useMemo(() => {
    const primaryColor =
      activeUnit?.brandColorConfigs?.find(cfg => cfg.target === 'primary')?.color ||
      (activeUnit as any)?.brandColors?.[0];
    const surfaceColor =
      activeUnit?.brandColorConfigs?.find(cfg => cfg.target === 'surface')?.color ||
      (activeUnit as any)?.brandColors?.[4];

    return [surfaceColor || '#ffffff', primaryColor || '#15803d', '#0f172a'];
  }, [activeUnit]);

  const renderPreview = (colors: string[]) => (
    <div className="flex w-full h-12 rounded-lg overflow-hidden border border-gray-200">
      {colors.map((color, idx) => (
        <div
          key={`${color}-${idx}`}
          className="flex-1"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      ))}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Téma kiválasztása</h3>
          <p className="text-sm text-gray-500">Válassz saját megjelenést. Csak rád vonatkozik.</p>
        </div>
        {activeUnit?.logoUrl && (
          <img src={activeUnit.logoUrl} alt={activeUnit.name} className="h-10 w-10 object-contain" />
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {THEME_OPTIONS.map(option => {
          const isActive = selectedTheme === option.id;
          const previewColors = option.id === 'branded' ? brandedPreview : option.preview;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedTheme(option.id)}
              className={`text-left p-3 rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm ${
                isActive ? 'border-green-500 ring-1 ring-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-800">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </div>
                {isActive && (
                  <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    Aktív
                  </span>
                )}
              </div>
              <div className="mt-3">{renderPreview(previewColors)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ThemeSelector;
