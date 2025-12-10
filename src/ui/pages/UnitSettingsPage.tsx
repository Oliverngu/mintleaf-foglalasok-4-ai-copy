import React, { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { RolePermissions, Unit, User } from '../../core/models/data';
import EmailSettingsApp from '../components/admin/EmailSettingsApp';
import PoziciokApp from '../components/apps/PoziciokApp';
import JogosultsagokApp from '../components/apps/JogosultsagokApp';
import ReservationSettingsForm from '../components/apps/ReservationSettingsForm';
import { useUnitContext } from '../context/UnitContext';
import ColorPicker from '../components/common/ColorPicker';
import { db } from '../../core/firebase/config';

export type UnitSettingsTab =
  | 'branding'
  | 'email-notifications'
  | 'positions'
  | 'permissions'
  | 'reservations';

interface UnitSettingsPageProps {
  currentUser: User;
  allUnits: Unit[];
  allPermissions: RolePermissions;
  unitPermissions: Record<string, any>;
  activeUnitIds: string[];
  unitId?: string;
}

const DEFAULT_BRAND_COLORS = ['#0F172A', '#22C55E', '#15803D', '#0EA5E9', '#F97316'];

const UnitSettingsPage: React.FC<UnitSettingsPageProps> = ({
  currentUser,
  allUnits,
  allPermissions,
  unitPermissions,
  activeUnitIds,
  unitId
}) => {
  const { selectedUnits } = useUnitContext();
  const [activeTab, setActiveTab] = useState<UnitSettingsTab>('branding');
  const [brandColors, setBrandColors] = useState<string[]>(DEFAULT_BRAND_COLORS);
  const [uiTheme, setUiTheme] = useState<'default' | 'brand'>('default');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const effectiveUnitId = useMemo(() => {
    return (
      unitId ||
      selectedUnits[0] ||
      activeUnitIds[0] ||
      allUnits[0]?.id ||
      null
    );
  }, [unitId, selectedUnits, activeUnitIds, allUnits]);

  const resolvedUnit = useMemo(
    () => allUnits.find(u => u.id === effectiveUnitId),
    [allUnits, effectiveUnitId]
  );

  useEffect(() => {
    if (resolvedUnit) {
      const sourceColors =
        resolvedUnit.brandColors && resolvedUnit.brandColors.length
          ? resolvedUnit.brandColors
          : DEFAULT_BRAND_COLORS;
      const padded = [...DEFAULT_BRAND_COLORS];
      sourceColors.forEach((color, idx) => {
        if (color) {
          if (idx < padded.length) {
            padded[idx] = color;
          } else {
            padded.push(color);
          }
        }
      });
      setBrandColors(padded);
      setUiTheme(resolvedUnit.uiTheme || 'default');
    }
  }, [resolvedUnit]);

  const handleBrandColorChange = (index: number, value: string) => {
    setBrandColors(prev => {
      const next = [...prev];
      while (next.length <= index) {
        next.push(DEFAULT_BRAND_COLORS[next.length] || '#000000');
      }
      next[index] = value;
      return next;
    });
  };

  const handleSaveBranding = async () => {
    if (!effectiveUnitId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateDoc(doc(db, 'units', effectiveUnitId), {
        brandColors,
        uiTheme
      });
      setSaveMessage('Sikeresen elmentve.');
    } catch (error) {
      console.error('Failed to save branding settings', error);
      setSaveMessage('Hiba történt mentés közben.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { id: UnitSettingsTab; label: string }[] = [
    { id: 'branding', label: 'Branding' },
    { id: 'email-notifications', label: 'Email & Értesítések' },
    { id: 'positions', label: 'Pozíciók' },
    { id: 'permissions', label: 'Jogosultságok' },
    { id: 'reservations', label: 'Foglalások' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'branding':
        return (
          <div className="space-y-6 bg-white p-6 rounded-xl shadow-sm border">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold text-gray-800">Téma</h3>
              <div className="flex flex-col gap-2 text-sm text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="uiTheme"
                    value="default"
                    checked={uiTheme === 'default'}
                    onChange={() => setUiTheme('default')}
                  />
                  Alapértelmezett
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="uiTheme"
                    value="brand"
                    checked={uiTheme === 'brand'}
                    onChange={() => setUiTheme('brand')}
                  />
                  Brand UI
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Brand színek</h3>
                <span className="text-sm text-gray-500">Slot 1 - Slot 5</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {brandColors.map((color, idx) => (
                  <ColorPicker
                    key={idx}
                    label={`Slot ${idx + 1}`}
                    value={color}
                    onChange={val => handleBrandColorChange(idx, val)}
                    presetColors={brandColors.filter(Boolean)}
                    hidePresets
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveBranding}
                disabled={isSaving || !effectiveUnitId}
                className="px-4 py-2 bg-green-700 text-white rounded-lg font-semibold disabled:opacity-60"
              >
                {isSaving ? 'Mentés...' : 'Mentés'}
              </button>
              {saveMessage && <span className="text-sm text-gray-600">{saveMessage}</span>}
            </div>
          </div>
        );
      case 'email-notifications':
        return (
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <EmailSettingsApp currentUser={currentUser} allUnits={allUnits} />
          </div>
        );
      case 'positions':
        return (
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <PoziciokApp />
          </div>
        );
      case 'permissions':
        return (
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <JogosultsagokApp
              currentUser={currentUser}
              allPermissions={allPermissions}
              unitPermissions={unitPermissions}
              activeUnitId={effectiveUnitId}
            />
          </div>
        );
      case 'reservations':
        return effectiveUnitId ? (
          <ReservationSettingsForm unitId={effectiveUnitId} layout="page" />
        ) : (
          <div className="p-6 bg-white rounded-xl shadow-sm border">
            Válassz ki egy egységet a foglalási beállítások szerkesztéséhez.
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-800">Üzlet beállítások</h1>
        <p className="text-gray-600">
          Központi hely az egység branding, kommunikációs, pozíció, jogosultsági és
          foglalási beállításainak kezeléséhez.
        </p>
        {resolvedUnit && (
          <p className="text-sm text-gray-500">Aktív egység: {resolvedUnit.name}</p>
        )}
      </div>

      <div className="flex gap-3 border-b pb-2 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-2 px-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[60vh]">{renderContent()}</div>
    </div>
  );
};

export default UnitSettingsPage;
