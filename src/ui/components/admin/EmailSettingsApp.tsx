import React, { useState, useEffect, useMemo, useCallback } from 'react';
// FIX: Corrected import to get EmailSettingsDocument from its source.
import { User, Unit, EmailSettingsDocument } from '../../../core/models/data';
import { db, serverTimestamp, Timestamp } from '../../../core/firebase/config';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
// FIX: Corrected import for KNOWN_TYPE_IDS.
import { KNOWN_TYPE_IDS, EmailTypeId } from '../../../core/email/emailTypes';
// FIX: Corrected imports to get necessary functions from the service.
import { savePartialEmailSettings } from '../../../core/api/emailSettingsService';
import { defaultTemplates } from '../../../core/email/defaultTemplates';
import LoadingSpinner from '../../../../components/LoadingSpinner';

interface TemplateEditorState {
  subject: string;
  html: string;
}

interface EmailSettingsAppProps {
  currentUser: User;
  allUnits: Unit[];
}

const emailTypeGroups: Record<string, EmailTypeId[]> = {
  'Foglalások': ['booking_created_guest', 'booking_created_admin'],
  'Szabadságkérelmek': ['leave_request_created', 'leave_request_approved', 'leave_request_rejected'],
  'Beosztás': ['new_schedule_published'],
  'Felhasználókezelés': ['user_registration_welcome'],
};

const ADMIN_RECIPIENT_TYPES: EmailTypeId[] = ['booking_created_admin', 'leave_request_created'];

const EmailSettingsApp: React.FC<EmailSettingsAppProps> = ({ currentUser, allUnits }) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [settings, setSettings] = useState<EmailSettingsDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingState, setSavingState] = useState<{ key: string | null; error: string; success: string }>({ key: null, error: '', success: '' });

  const [selectedType, setSelectedType] = useState<EmailTypeId | null>(null);
  const [editorState, setEditorState] = useState<TemplateEditorState | null>(null);

  const availableUnits = useMemo(() => {
    if (currentUser.role === 'Admin') {
      return [{ id: 'default', name: 'Globális (alapértelmezett)' }, ...allUnits];
    }
    return allUnits.filter(u => currentUser.unitIds?.includes(u.id));
  }, [currentUser, allUnits]);

  const fetchSettings = useCallback(async () => {
  if (!selectedUnitId) return;
  setIsLoading(true);
  setSavingState({ key: null, error: '', success: '' });
  setSelectedType(null);

  try {
    const docRef = doc(db, 'email_settings', selectedUnitId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      setSettings({
        enabledTypes: {},
        adminRecipients: {},
        templateOverrides: {},
        adminDefaultEmail: '',
      });
      return;
    }

    const data = snap.data() as any;

    setSettings({
      enabledTypes: data.enabledTypes || {},
      adminRecipients: data.adminRecipients || {},
      templateOverrides: data.templateOverrides || {},
      adminDefaultEmail: data.adminDefaultEmail || '',
    });
  } catch (err) {
    console.error('Error fetching settings:', err);
    setSavingState((s) => ({ ...s, error: 'Hiba a beállítások betöltésekor.' }));
  } finally {
    setIsLoading(false);
  }
}, [selectedUnitId]);


  useEffect(() => {
    if (availableUnits.length > 0 && !selectedUnitId) {
      setSelectedUnitId(availableUnits[0].id);
    }
  }, [availableUnits, selectedUnitId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (selectedType && settings) {
      const override = settings.templateOverrides?.[selectedType];
      const defaultTpl = defaultTemplates[selectedType];
      setEditorState({
        subject: override?.subject || defaultTpl.subject,
        html: override?.html || defaultTpl.html,
      });
    } else {
      setEditorState(null);
    }
  }, [selectedType, settings]);
  
  const handleSave = useCallback(async (key: string, partialData: Record<string, any>) => {
    if (!selectedUnitId) return;
    setSavingState({ key, error: '', success: '' });
    try {
        await savePartialEmailSettings(selectedUnitId, partialData);
        setSavingState({ key, error: '', success: 'Mentve!' });
        await fetchSettings(); // Refetch to get the latest state
        setTimeout(() => setSavingState({ key: null, error: '', success: '' }), 2000);
    } catch (err) {
        console.error(`Error saving ${key}:`, err);
        setSavingState({ key, error: 'Hiba a mentés során.', success: '' });
    }
  }, [selectedUnitId, fetchSettings]);

  const handleToggle = async (typeId: EmailTypeId) => {
  if (!settings) return;

  const isEnabled = settings.enabledTypes?.[typeId] ?? true;
  const newEnabledState = !isEnabled;

  // Új enabledTypes objektum
  const updatedEnabled = {
    ...(settings.enabledTypes || {}),
    [typeId]: newEnabledState,
  };

  // Optimista UI frissítés
  setSettings(prev =>
    prev ? { ...prev, enabledTypes: updatedEnabled } : prev
  );

  // Firestore-ba NESTED objektumként mentjük
  await handleSave('enabled-types', { enabledTypes: updatedEnabled });
};
  
  const handleSaveAdminSettings = async () => {
  if (!settings) return;

  // 1) Építsünk rendes nested objektumot az adminRecipients-hez
  const adminRecipientsToSave: Record<string, string[]> = {
    ...(settings.adminRecipients || {}),
  };

  ADMIN_RECIPIENT_TYPES.forEach((typeId) => {
    adminRecipientsToSave[typeId] = settings.adminRecipients[typeId] || [];
  });

  // 2) Ezt mentjük el egyben
  const dataToSave: Record<string, any> = {
    adminDefaultEmail: settings.adminDefaultEmail || '',
    adminRecipients: adminRecipientsToSave,
  };

  await handleSave('admin-settings', dataToSave);
};
const handleSaveTemplate = async () => {
  if (!selectedType || !editorState || !settings) return;

  const updatedOverrides = {
    ...(settings.templateOverrides || {}),
    [selectedType]: { ...editorState },
  };

  // Optimista UI update
  setSettings(prev =>
    prev ? { ...prev, templateOverrides: updatedOverrides } : prev
  );

  await handleSave(`template-${selectedType}`, { templateOverrides: updatedOverrides });
};

const handleRestoreDefault = async () => {
  if (!selectedType || !settings) return;

  const updatedOverrides = { ...(settings.templateOverrides || {}) };
  delete updatedOverrides[selectedType];

  // UI frissítés
  setSettings(prev =>
    prev ? { ...prev, templateOverrides: updatedOverrides } : prev
  );

  await handleSave(`template-${selectedType}`, { templateOverrides: updatedOverrides });
};

  if (currentUser.role !== 'Admin' && currentUser.role !== 'Unit Admin') {
    return <div className="p-4"><p>Nincs jogosultságod.</p></div>;
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Email sablonok és beállítások</h2>

      <div className="mb-6">
        <label htmlFor="unit-select" className="block text-sm font-medium text-gray-700">Egység</label>
        <select id="unit-select" value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 border-gray-300 focus:ring-green-500 focus:border-green-500 rounded-md">
          <option value="" disabled>Válassz egy egységet...</option>
          {availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="relative h-64"><LoadingSpinner /></div>}
      
      {!isLoading && settings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Settings & Type List */}
          <div className="space-y-6">
            <div className="p-4 border rounded-lg bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Admin értesítések</h3>
                <div>
                  <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700">Alapértelmezett admin email cím</label>
                  <input id="admin-email" type="email" value={settings.adminDefaultEmail || ''} onChange={e => setSettings(s => s ? { ...s, adminDefaultEmail: e.target.value } : null)} className="mt-1 w-full p-2 border border-gray-300 rounded-md" placeholder="pl. info@etterem.hu" />
                  <p className="text-xs text-gray-500 mt-1">Ez a cím lesz az alapértelmezett címzettje az admin értesítéseknek.</p>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700">További címzettek (típusonként)</label>
                  {ADMIN_RECIPIENT_TYPES.map(typeId => (
                      <div key={typeId} className="mt-2">
                        <label htmlFor={`recipients-${typeId}`} className="text-xs font-semibold text-gray-600">{typeId}</label>
                        <input id={`recipients-${typeId}`} type="text" value={settings.adminRecipients[typeId]?.join(', ') || ''} onChange={e => setSettings(s => s ? { ...s, adminRecipients: { ...s.adminRecipients, [typeId]: e.target.value.split(',').map(em => em.trim()).filter(Boolean) } } : null)} className="w-full p-1 text-sm border border-gray-300 rounded-md" placeholder="email1@cim.hu, email2@cim.hu"/>
                      </div>
                  ))}
                </div>
                 <div className="text-right mt-3">
                    <button onClick={handleSaveAdminSettings} disabled={savingState.key === 'admin-settings'} className="bg-blue-600 text-white text-sm font-semibold py-1.5 px-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
                      {savingState.key === 'admin-settings' ? 'Mentés...' : 'Admin beállítások mentése'}
                    </button>
                 </div>
            </div>

            {Object.entries(emailTypeGroups).map(([groupName, typeIds]) => (
              <div key={groupName}>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{groupName}</h3>
                <div className="space-y-2">
                  {typeIds.map(typeId => (
                    <div key={typeId} className={`p-3 border rounded-lg transition-colors ${selectedType === typeId ? 'bg-green-50 border-green-400' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-700 cursor-pointer" onClick={() => setSelectedType(typeId)}>{typeId}</span>
                        <div className="flex items-center gap-4">
                           <label className="flex items-center gap-2 cursor-pointer" title="Email küldés engedélyezése/tiltása">
                                <input type="checkbox" checked={settings.enabledTypes[typeId] ?? true} onChange={() => handleToggle(typeId)} className="h-5 w-5 rounded text-green-600 focus:ring-green-500"/>
                           </label>
                           <button onClick={() => setSelectedType(typeId)} className="text-sm text-blue-600 hover:underline">Szerkesztés</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Right Column: Editor */}
          <div>
            {selectedType && editorState ? (
              <div className="sticky top-8 space-y-4">
                <h3 className="text-xl font-bold">Sablon: <span className="text-green-700">{selectedType}</span></h3>
                <div>
                  <label className="block text-sm font-medium">Tárgy</label>
                  <input type="text" value={editorState.subject} onChange={e => setEditorState({...editorState, subject: e.target.value})} className="w-full p-2 border rounded-md"/>
                </div>
                <div>
                  <label className="block text-sm font-medium">HTML tartalom</label>
                  <textarea rows={10} value={editorState.html} onChange={e => setEditorState({...editorState, html: e.target.value})} className="w-full p-2 border rounded-md font-mono text-sm"/>
                </div>
                <div className="p-4 border rounded-lg bg-gray-100">
                    <h4 className="font-semibold text-sm mb-2">Élő előnézet</h4>
                    <div className="prose prose-sm max-w-none h-48 overflow-y-auto p-2 bg-white border" dangerouslySetInnerHTML={{ __html: editorState.html }} />
                </div>
                <div className="flex justify-between items-center">
                    <div>
                      {savingState.key === `template-${selectedType}` && savingState.success && <span className="text-green-600 font-semibold text-sm">{savingState.success}</span>}
                      {savingState.key === `template-${selectedType}` && savingState.error && <span className="text-red-600 font-semibold text-sm">{savingState.error}</span>}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={handleRestoreDefault} disabled={savingState.key === `template-${selectedType}`} className="bg-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-300 disabled:bg-gray-400">Alapértelmezett</button>
                        <button onClick={handleSaveTemplate} disabled={savingState.key === `template-${selectedType}`} className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 disabled:bg-gray-400">
                            {savingState.key === `template-${selectedType}` ? 'Mentés...' : 'Sablon mentése'}
                        </button>
                    </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8 border-2 border-dashed rounded-lg text-gray-400 sticky top-8">
                <p>Válassz egy sablont a szerkesztéshez.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailSettingsApp;
