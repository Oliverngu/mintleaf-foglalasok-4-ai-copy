import React, { useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { RolePermissions, Unit, User } from '../../core/models/data';
import EmailSettingsApp from '../components/admin/EmailSettingsApp';
import PoziciokApp from '../components/apps/PoziciokApp';
import JogosultsagokApp from '../components/apps/JogosultsagokApp';
import ReservationSettingsForm from '../components/apps/ReservationSettingsForm';
import { useUnitContext } from '../context/UnitContext';
import ColorPicker from '../components/common/ColorPicker';
import { db, storage } from '../../core/firebase/config';

export type UnitSettingsTab =
  | 'branding'
  | 'email-notifications'
  | 'positions'
  | 'permissions'
  | 'reservations';

const DEFAULT_BRAND_COLORS = {
  primary: '#15803D',
  secondary: '#3B82F6',
  background: '#F8FAFC',
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
  const [brandColors, setBrandColors] = useState<NonNullable<Unit['brandColors']>>(DEFAULT_BRAND_COLORS);
  const [uiTheme, setUiTheme] = useState<'default' | 'brand'>('default');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [headerImageUrl, setHeaderImageUrl] = useState<string | undefined>();
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | undefined>();
  const [uploadingType, setUploadingType] = useState<'header' | 'background' | null>(null);

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
      setBrandColors(resolvedUnit.brandColors || DEFAULT_BRAND_COLORS);
      setUiTheme(resolvedUnit.uiTheme || 'default');
      setHeaderImageUrl(resolvedUnit.uiHeaderImageUrl || undefined);
      setBackgroundImageUrl(resolvedUnit.uiBackgroundImageUrl || undefined);
    }
  }, [resolvedUnit]);

  const handleBrandColorChange = (
    key: keyof NonNullable<Unit['brandColors']>,
    value: string
  ) => {
    setBrandColors(prev => ({
      ...(prev || DEFAULT_BRAND_COLORS),
      [key]: value,
    }));
  };

  const handleSaveBranding = async () => {
    if (!effectiveUnitId) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateDoc(doc(db, 'units', effectiveUnitId), {
        brandColors,
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

  const handleImageUpload = async (
    type: 'header' | 'background',
    file: File | null | undefined
  ) => {
    if (!file || !effectiveUnitId) return;
    setUploadingType(type);
    try {
      const timestamp = Date.now();
      const path = `units/${effectiveUnitId}/ui_themes/${type === 'header' ? 'header' : 'background'}_${timestamp}_${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      const field = type === 'header' ? 'uiHeaderImageUrl' : 'uiBackgroundImageUrl';
      await updateDoc(doc(db, 'units', effectiveUnitId), { [field]: downloadUrl });

      if (type === 'header') {
        setHeaderImageUrl(downloadUrl);
      } else {
        setBackgroundImageUrl(downloadUrl);
      }
    } catch (error) {
      console.error('Failed to upload image', error);
    } finally {
      setUploadingType(null);
    }
  };

  const handleDeleteImage = async (type: 'header' | 'background') => {
    if (!effectiveUnitId) return;
    const currentUrl = type === 'header' ? headerImageUrl : backgroundImageUrl;
    if (!currentUrl) return;

    try {
      await deleteObject(ref(storage, currentUrl));
    } catch (error) {
      console.warn('Failed to delete image from storage (may not exist)', error);
    }

    const field = type === 'header' ? 'uiHeaderImageUrl' : 'uiBackgroundImageUrl';
    try {
      await updateDoc(doc(db, 'units', effectiveUnitId), { [field]: null });
    } catch (error) {
      console.error('Failed to clear image url from Firestore', error);
    }

    if (type === 'header') {
      setHeaderImageUrl(undefined);
    } else {
      setBackgroundImageUrl(undefined);
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

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Brand színek</h3>
                <p className="text-sm text-gray-500">
                  Három fix szín: fejléc (primary), gombok és aktív menü (secondary), valamint az alkalmazás háttér.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg border bg-gray-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Primary (Fejléc)</span>
                  </div>
                  <ColorPicker
                    value={brandColors.primary || DEFAULT_BRAND_COLORS.primary}
                    onChange={val => handleBrandColorChange('primary', val)}
                    presetColors={Object.values(DEFAULT_BRAND_COLORS)}
                  />
                </div>
                <div className="p-3 rounded-lg border bg-gray-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Secondary (Gombok, Aktív menü)</span>
                  </div>
                  <ColorPicker
                    value={brandColors.secondary || DEFAULT_BRAND_COLORS.secondary}
                    onChange={val => handleBrandColorChange('secondary', val)}
                    presetColors={Object.values(DEFAULT_BRAND_COLORS)}
                  />
                </div>
                <div className="p-3 rounded-lg border bg-gray-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Background</span>
                  </div>
                  <ColorPicker
                    value={brandColors.background || DEFAULT_BRAND_COLORS.background}
                    onChange={val => handleBrandColorChange('background', val)}
                    presetColors={Object.values(DEFAULT_BRAND_COLORS)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Képek és Textúrák</h3>
                  <p className="text-sm text-gray-500">
                    Fejléc és háttér képek feltöltése a units/{effectiveUnitId}/ui_themes/ mappába.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border bg-gray-50 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">Fejléc kép</h4>
                      <p className="text-xs text-gray-500">units/{effectiveUnitId}/ui_themes/header_*.jpg/png</p>
                    </div>
                    {headerImageUrl && (
                      <button
                        type="button"
                        onClick={() => handleDeleteImage('header')}
                        className="text-sm text-red-600 hover:underline"
                        disabled={uploadingType === 'header'}
                      >
                        Törlés
                      </button>
                    )}
                  </div>
                  {headerImageUrl && (
                    <img
                      src={headerImageUrl}
                      alt="Header előnézet"
                      className="w-full h-32 object-cover rounded-md border"
                    />
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm cursor-pointer hover:border-blue-400">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleImageUpload('header', e.target.files?.[0])}
                      disabled={uploadingType === 'header'}
                    />
                    <span className="font-medium text-gray-700">
                      {uploadingType === 'header' ? 'Feltöltés...' : 'Fejléc kép feltöltése'}
                    </span>
                  </label>
                </div>

                <div className="p-3 rounded-lg border bg-gray-50 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800">Háttér kép</h4>
                      <p className="text-xs text-gray-500">units/{effectiveUnitId}/ui_themes/background_*.jpg/png</p>
                    </div>
                    {backgroundImageUrl && (
                      <button
                        type="button"
                        onClick={() => handleDeleteImage('background')}
                        className="text-sm text-red-600 hover:underline"
                        disabled={uploadingType === 'background'}
                      >
                        Törlés
                      </button>
                    )}
                  </div>
                  {backgroundImageUrl && (
                    <img
                      src={backgroundImageUrl}
                      alt="Háttér előnézet"
                      className="w-full h-32 object-cover rounded-md border"
                    />
                  )}
                  <label className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-sm cursor-pointer hover:border-blue-400">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => handleImageUpload('background', e.target.files?.[0])}
                      disabled={uploadingType === 'background'}
                    />
                    <span className="font-medium text-gray-700">
                      {uploadingType === 'background' ? 'Feltöltés...' : 'Háttér kép feltöltése'}
                    </span>
                  </label>
                </div>
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
          <ReservationSettingsForm
            unitId={effectiveUnitId}
            currentUser={currentUser}
            layout="page"
          />
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
