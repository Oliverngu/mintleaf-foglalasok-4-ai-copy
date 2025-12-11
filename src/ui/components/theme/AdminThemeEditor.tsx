import React, { useMemo, useState } from 'react';
import { ThemeBases } from '../../../core/theme/types';
import { DEFAULT_BASES, saveBases } from '../../../core/theme/storage';

interface AdminThemeEditorProps {
  bases: ThemeBases;
  onChangeBases: (next: ThemeBases) => void;
}

const colorFields = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'headerBg', label: 'Header BG' },
  { key: 'sidebarBg', label: 'Sidebar BG' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'textMain', label: 'Text Main' },
  { key: 'textSecondary', label: 'Text Secondary' },
  { key: 'border', label: 'Border' },
] as const;

const AdminThemeEditor: React.FC<AdminThemeEditorProps> = ({ bases, onChangeBases }) => {
  const [activeTab, setActiveTab] = useState<'light' | 'dark'>('light');
  const [draft, setDraft] = useState<ThemeBases>(bases);

  const current = useMemo(() => draft[activeTab], [draft, activeTab]);

  const updateField = (key: typeof colorFields[number]['key'], value: string) => {
    const next = {
      ...draft,
      [activeTab]: {
        ...draft[activeTab],
        [key]: value,
      },
    } as ThemeBases;
    setDraft(next);
  };

  const handleSave = () => {
    onChangeBases(draft);
    saveBases(draft);
  };

  const handleReset = () => {
    setDraft(DEFAULT_BASES);
    onChangeBases(DEFAULT_BASES);
    saveBases(DEFAULT_BASES);
  };

  return (
    <div className="p-4 bg-white rounded-xl shadow-md border border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">Admin Theme Editor</h3>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-lg text-sm font-medium ${activeTab === 'light' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setActiveTab('light')}
            type="button"
          >
            Light
          </button>
          <button
            className={`px-3 py-1 rounded-lg text-sm font-medium ${activeTab === 'dark' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setActiveTab('dark')}
            type="button"
          >
            Dark
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {colorFields.map(field => (
          <label key={field.key} className="flex items-center justify-between gap-3 text-sm text-gray-700">
            <span>{field.label}</span>
            <input
              type="color"
              value={current[field.key]}
              onChange={e => updateField(field.key, e.target.value)}
              className="h-9 w-16 rounded cursor-pointer border border-gray-200"
            />
          </label>
        ))}
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
        >
          Reset defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default AdminThemeEditor;
