import React, { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { BrandColorConfig, BrandTarget, RolePermissions, Unit, User } from '../../core/models/data';
import EmailSettingsApp from '../components/admin/EmailSettingsApp';
import PoziciokApp from '../components/apps/PoziciokApp';
import JogosultsagokApp from '../components/apps/JogosultsagokApp';
import ReservationSettingsForm from '../components/apps/ReservationSettingsForm';
import { useUnitContext } from '../context/UnitContext';
import ColorPicker from '../components/common/ColorPicker';
import { db } from '../../core/firebase/config';
import TrashIcon from '../../../components/icons/TrashIcon';
import PlusIcon from '../../../components/icons/PlusIcon';

export type UnitSettingsTab =
  | 'branding'
  | 'email-notifications'
  | 'positions'
  | 'permissions'
  | 'reservations';

const DEFAULT_BRAND_COLORS = ['#0F172A', '#22C55E', '#15803D', '#0EA5E9', '#F97316'];
const LEGACY_TARGETS: BrandTarget[] = [
  'primary',
  'secondary',
  'accent',
  'background',
  'surface',
];

const BRAND_TARGET_OPTIONS: { value: BrandTarget; label: string }[] = [
  { value: 'primary', label: 'Elsődleges (gombok, fejléc)' },
  { value: 'secondary', label: 'Másodlagos (kiemelések)' },
  { value: 'accent', label: 'Accent / CTA' },
  { value: 'background', label: 'Háttér' },
  { value: 'surface', label: 'Kártya / surface' },
  { value: 'sidebar', label: 'Oldalsáv' },
  { value: 'text', label: 'Alap szöveg' },
];

const createDefaultConfigs = (): BrandColorConfig[] =>
  DEFAULT_BRAND_COLORS.map((color, idx) => ({
    id: `default-${idx}`,
    color,
    target: LEGACY_TARGETS[idx] || 'accent',
  }));

const normalizeConfigs = (
  configs?: BrandColorConfig[] | null,
  legacyColors?: string[] | null
): BrandColorConfig[] => {
  if (configs && configs.length) {
    return configs.slice(0, 5).map((cfg, idx) => ({
      id: cfg.id || `brand-${idx}-${Date.now()}`,
      color: cfg.color || DEFAULT_BRAND_COLORS[idx % DEFAULT_BRAND_COLORS.length],
      target: cfg.target || LEGACY_TARGETS[idx] || 'primary',
    }));
  }

  if (legacyColors && legacyColors.length) {
    return legacyColors.slice(0, 5).map((color, idx) => ({
      id: `legacy-${idx}`,
      color,
      target: LEGACY_TARGETS[idx] || 'accent',
    }));
  }

  return createDefaultConfigs();
};

const UnitSettingsPage: React.FC<{
  currentUser: User;
  allUnits: Unit[];
  allPermissions: RolePermissions;
  unitPermissions: Record<string, any>;
  activeUnitIds: string[];
  unitId?: string;
}> = ({
  currentUser,
  allUnits,
  allPermissions,
  unitPermissions,
  activeUnitIds,
  unitId,
}) => {
  const { selectedUnits } = useUnitContext();
  const [activeTab, setActiveTab] = useState<UnitSettingsTab>('branding');
  const [brandConfigs, setBrandConfigs] = useState<BrandColorConfig[]>(
    createDefaultConfigs()
  );
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
      const normalized = normalizeConfigs(
        resolvedUnit.brandColorConfigs,
        (resolvedUnit as any).brandColors || null
      );
      setBrandConfigs(normalized);
      setUiTheme(resolvedUnit.uiTheme || 'default');
    }
  }, [resolvedUnit]);

  const handleBrandColorChange = (id: string, value: string) => {
    setBrandConfigs(prev => prev.map(cfg => (cfg.id === id ? { ...cfg, color: value } : cfg)));
  };

  const handleTargetChange = (id: string, target: BrandTarget) => {
    setBrandConfigs(prev => prev.map(cfg => (cfg.id === id ? { ...cfg, target } : cfg)));
  };

  const handleAddBrandColor = () => {
    setBrandConfigs(prev => {
      if (prev.length >= 5) return prev;
      const nextId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `brand-${Date.now()}-${prev.length}`;
      const nextTarget = LEGACY_TARGETS[prev.length] || 'accent';
      const nextColor = DEFAULT_BRAND_COLORS[prev.length % DEFAULT_BRAND_COLORS.length];
      return [...prev, { id: nextId, color: nextColor, target: nextTarget }];
    });
  };

  const handleRemoveBrandColor = (id: string) => {
    setBrandConfigs(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(cfg => cfg.id !== id);
    });
  };

  const handleSaveBranding = async () => {
    if (!effectiveUnitId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateDoc(doc(db, 'units', effectiveUnitId), {
        brandColorConfigs: brandConfigs,
        uiTheme,
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
    { id: 'reservations', label: 'Foglalások' },
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
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Brand színek</h3>
                  <p className="text-sm text-gray-500">Max. 5 szín, mindhez választható célterület.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddBrandColor}
                  disabled={brandConfigs.length >= 5}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-60"
                >
                  <PlusIcon className="h-5 w-5" />
                  Új szín hozzáadása
                </button>
              </div>

              <div className="space-y-3">
                {brandConfigs.map((config, idx) => (
                  <div
                    key={config.id}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center p-3 rounded-lg border bg-gray-50"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium text-gray-700">Szín {idx + 1}</span>
                      <ColorPicker
                        value={config.color}
                        onChange={val => handleBrandColorChange(config.id, val)}
                        presetColors={brandConfigs.map(cfg => cfg.color)}
                      />
                    </div>

                    <div className="flex flex-col gap-1 w-full">
                      <label className="text-sm font-medium text-gray-700">Célterület</label>
                      <select
                        value={config.target}
                        onChange={e => handleTargetChange(config.id, e.target.value as BrandTarget)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {BRAND_TARGET_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-end w-full">
                      <button
                        type="button"
                        onClick={() => handleRemoveBrandColor(config.id)}
                        disabled={brandConfigs.length <= 1}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 border border-red-100 rounded-lg hover:bg-red-50 disabled:opacity-50"
                        title="Szín törlése"
                      >
                        <TrashIcon className="h-5 w-5" />
                        Törlés
                      </button>
                    </div>
                  </div>
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

      {renderContent()}
    </div>
  );
};

export default UnitSettingsPage;
