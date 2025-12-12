import React, { useState, useEffect } from 'react';
import { ThemeBases, ThemeColors } from '../../../core/theme/types';
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

  const updateColor = (key: keyof ThemeColors, value: string) => {
    const newConfig = {
      ...localConfig,
      [activeTab]: { ...localConfig[activeTab], [key]: value }
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
          <ColorPicker label="Primary" value={currentColors.primary || '#15803d'} onChange={(c) => updateColor('primary', c)} />
          <ColorPicker label="Secondary" value={currentColors.secondary || '#15803d'} onChange={(c) => updateColor('secondary', c)} />
          <ColorPicker label="Background" value={currentColors.background || '#f1f5f9'} onChange={(c) => updateColor('background', c)} />
          <ColorPicker label="Surface (Card)" value={currentColors.surface || '#ffffff'} onChange={(c) => updateColor('surface', c)} />
          <ColorPicker label="Header Bg" value={currentColors.headerBg || '#15803d'} onChange={(c) => updateColor('headerBg', c)} />
          <ColorPicker label="Text Main" value={currentColors.textMain || '#000000'} onChange={(c) => updateColor('textMain', c)} />
      </div>
      
      {/* MENTÉS GOMB A VÉGÉN - Ez írja be az adatbázisba */}
      {/* Ezt a logikát az App.tsx-be vagy ide kell rakni setDoc-cal, de a live preview már működni fog */}
    </div>
  );
};

export default AdminThemeEditor;
