import React, { useState, useEffect } from 'react';
import { ThemeBases } from '../../../core/theme/types';
import { normalizeColor } from '../../../core/theme/utils';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ColorPicker from '../common/ColorPicker';

interface AdminThemeEditorProps {
  bases: ThemeBases;
  onChangeBases: (bases: ThemeBases) => void;
  onClose?: () => void;
}

const AdminThemeEditor: React.FC<AdminThemeEditorProps> = ({ bases, onChangeBases, onClose }) => {
  const [activeTab, setActiveTab] = useState<'light' | 'dark'>('light');
  const [localConfig, setLocalConfig] = useState<ThemeBases>(bases);

  useEffect(() => { setLocalConfig(bases); }, [bases]);

  const updateValue = (key: keyof ThemeBases['light'], value: string) => {
    const normalized = normalizeColor(value);
    const nextTab = { ...localConfig[activeTab] };
    if (normalized) {
      nextTab[key] = normalized;
    } else {
      delete nextTab[key];
    }
    const newConfig = {
      ...localConfig,
      [activeTab]: nextTab
    };
    setLocalConfig(newConfig);
    onChangeBases(newConfig); // AZONNALI FRISSÍTÉS
  };

  const currentColors = localConfig[activeTab] || {};

  return (
    <div className="bg-white p-4 rounded-xl shadow-xl border border-gray-200 mt-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-gray-800">Téma Szerkesztő</h3>
        <div className="flex gap-2">
            <button onClick={() => setActiveTab('light')} className={`px-2 py-1 rounded ${activeTab==='light'?'bg-gray-200':''}`}>Light</button>
            <button onClick={() => setActiveTab('dark')} className={`px-2 py-1 rounded ${activeTab==='dark'?'bg-gray-200':''}`}>Dark</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
          <ColorPicker label="Primary" value={currentColors.primary || '#15803d'} onChange={(c) => updateValue('primary', c)} />
          <ColorPicker label="Secondary" value={currentColors.secondary || '#15803d'} onChange={(c) => updateValue('secondary', c)} />
          <ColorPicker label="Background" value={currentColors.background || '#f1f5f9'} onChange={(c) => updateValue('background', c)} />
          <ColorPicker label="Surface (Card)" value={currentColors.surface || '#ffffff'} onChange={(c) => updateValue('surface', c)} />
          <ColorPicker label="Surface Card" value={currentColors.surfaceCard || currentColors.surface || '#ffffff'} onChange={(c) => updateValue('surfaceCard', c)} />
          <ColorPicker label="Header Bg" value={currentColors.headerBg || '#15803d'} onChange={(c) => updateValue('headerBg', c)} />
          <ColorPicker label="Text Main" value={currentColors.textMain || '#000000'} onChange={(c) => updateValue('textMain', c)} />
      </div>

      <div className="mt-6 space-y-2">
        <label className="block text-sm font-medium text-gray-700">Sidebar Image URL</label>
        <input
          type="url"
          value={currentColors.sidebarImage || ''}
          onChange={(e) => updateValue('sidebarImage', e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="https://example.com/sidebar-background.jpg"
        />
      </div>
      
      {/* MENTÉS GOMB A VÉGÉN - Ez írja be az adatbázisba */}
      {/* Ezt a logikát az App.tsx-be vagy ide kell rakni setDoc-cal, de a live preview már működni fog */}
    </div>
  );
};

export default AdminThemeEditor;
