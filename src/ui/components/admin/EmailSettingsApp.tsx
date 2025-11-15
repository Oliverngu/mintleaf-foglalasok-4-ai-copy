import React, { useState, useEffect, useMemo } from 'react';
import { User, Unit } from '../../../core/models/data';
import { db, serverTimestamp, Timestamp } from '../../../core/firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { KNOWN_TYPE_IDS, EmailTypeId } from '../../../core/email/emailTypes';
import LoadingSpinner from '../../../../components/LoadingSpinner';

// Interfaces for the Firestore document structure
interface TemplateOverride {
  subject: string;
  html: string;
  text: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

interface EmailSettingsDocument {
  enabledTypes: { [key in EmailTypeId]?: boolean };
  adminRecipients: {
    booking_created_admin?: string[];
    leave_request_created?: string[];
  };
  templateOverrides: { [key in EmailTypeId]?: TemplateOverride };
}

// Props for the component
interface EmailSettingsAppProps {
  currentUser: User;
  allUnits: Unit[];
}

// The main component
const EmailSettingsApp: React.FC<EmailSettingsAppProps> = ({ currentUser, allUnits }) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [settings, setSettings] = useState<EmailSettingsDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Determine which units the admin can manage
  const availableUnits = useMemo(() => {
    if (currentUser.role === 'Admin') {
      return [{ id: 'default', name: 'Globális (alapértelmezett)' }, ...allUnits];
    }
    return allUnits.filter(u => currentUser.unitIds?.includes(u.id));
  }, [currentUser, allUnits]);

  // Auto-select unit if only one is available
  useEffect(() => {
    if (availableUnits.length === 1) {
      setSelectedUnitId(availableUnits[0].id);
    }
  }, [availableUnits]);

  // Fetch settings document when unit changes
  useEffect(() => {
    if (!selectedUnitId) {
      setSettings(null);
      return;
    }
    const fetchSettings = async () => {
      setIsLoading(true);
      setError('');
      try {
        const docRef = doc(db, 'email_settings', selectedUnitId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            enabledTypes: data.enabledTypes || {},
            adminRecipients: data.adminRecipients || {},
            templateOverrides: data.templateOverrides || {},
          });
        } else {
          // Create a default structure if the document doesn't exist
          setSettings({
            enabledTypes: {},
            adminRecipients: {},
            templateOverrides: {},
          });
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
        setError("Hiba a beállítások betöltésekor.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [selectedUnitId]);

  const handleSave = async () => {
    if (!selectedUnitId || !settings) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const docRef = doc(db, 'email_settings', selectedUnitId);
      await setDoc(docRef, settings, { merge: true });
      setSuccess('Beállítások sikeresen elmentve!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Hiba a beállítások mentésekor.");
    } finally {
      setIsSaving(false);
    }
  };

  // Check for Admin role
  if (currentUser.role !== 'Admin' && currentUser.role !== 'Unit Admin') {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
        <h3 className="text-xl font-bold text-red-600">Nincs jogosultság</h3>
        <p className="text-gray-600 mt-2">Nincs jogosultságod az email beállítások kezeléséhez.</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Email beállítások</h2>

      {/* Unit Selector */}
      <div className="mb-6">
        <label htmlFor="unit-select" className="block text-sm font-medium text-gray-700">Egység</label>
        <select
          id="unit-select"
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md"
        >
          <option value="" disabled>Válassz egy egységet...</option>
          {availableUnits.map(unit => (
            <option key={unit.id} value={unit.id}>{unit.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? <div className="relative h-64"><LoadingSpinner /></div> : settings && (
        <div className="space-y-8">
          {/* Type Toggles and Recipient Settings */}
          <div className="space-y-4">
            {KNOWN_TYPE_IDS.map(typeId => (
              <EmailTypeSettings
                key={typeId}
                typeId={typeId}
                settings={settings}
                setSettings={setSettings}
                currentUser={currentUser}
              />
            ))}
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4 border-t pt-4">
            {error && <p className="text-red-500 text-sm">{error}</p>}
            {success && <p className="text-green-600 text-sm font-semibold">{success}</p>}
            <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
              {isSaving ? 'Mentés...' : 'Összes mentése'}
            </button>
          </div>
        </div>
      )}

      {/* JÖVŐBELI INTEGRÁCIÓ DOKUMENTÁCIÓJA */}
      <div className="mt-8 pt-4 border-t text-xs text-gray-500">
        <h4 className="font-bold">Jövőbeli integráció</h4>
        <p className="mt-1">
          <strong>Frontend (sendEmail):</strong> A jövőben a `sendEmail` hívás előtt a frontend lekérdezi ezeket a beállításokat. Ha egy típus (`enabledTypes`) ki van kapcsolva, a hívás meg se történik. A `adminRecipients` mezőt a `to` paraméter kitöltésére használja.
        </p>
        <p className="mt-1">
          <strong>Cloudflare Worker:</strong> A Worker a jövőben bővíthető lesz, hogy a `unitId` és `typeId` alapján először a Firestore-ból próbálja meg betölteni a sablon-felülírást (`templateOverrides`), és csak ezután használja a kódban rögzített alapértelmezett sablont. Ehhez a Workernek egy Service Account segítségével kell majd hozzáférnie a Firestore REST API-hoz.
        </p>
      </div>
    </div>
  );
};

// Sub-component for managing settings for a single email type
const EmailTypeSettings: React.FC<{
    typeId: EmailTypeId;
    settings: EmailSettingsDocument;
    setSettings: React.Dispatch<React.SetStateAction<EmailSettingsDocument | null>>;
    currentUser: User;
}> = ({ typeId, settings, setSettings, currentUser }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const isEnabled = settings.enabledTypes[typeId] ?? true; // Default to enabled
    
    const RECIPIENT_TYPES: EmailTypeId[] = ['booking_created_admin', 'leave_request_created'];

    const handleToggle = () => {
        setSettings(prev => {
            if (!prev) return null;
            const newEnabled = { ...prev.enabledTypes, [typeId]: !isEnabled };
            return { ...prev, enabledTypes: newEnabled };
        });
    };

    const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings(prev => {
            if (!prev) return null;
            const emails = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            const newRecipients = { ...prev.adminRecipients, [typeId as 'booking_created_admin' | 'leave_request_created']: emails };
            return { ...prev, adminRecipients: newRecipients };
        });
    };

    const handleTemplateChange = (field: keyof TemplateOverride, value: string) => {
         setSettings(prev => {
            if (!prev) return null;
            const currentTemplate = prev.templateOverrides[typeId] || { subject: '', html: '', text: '' };
            const newTemplate = { ...currentTemplate, [field]: value, updatedAt: serverTimestamp() as Timestamp, updatedBy: currentUser.id };
            const newOverrides = { ...prev.templateOverrides, [typeId]: newTemplate };
            return { ...prev, templateOverrides: newOverrides };
        });
    }
    
    const recipients = (settings.adminRecipients as any)[typeId]?.join(', ') || '';
    const template = settings.templateOverrides[typeId] || { subject: '', html: '', text: '' };

    return (
        <div className="p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-800">{typeId}</div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={isEnabled} onChange={handleToggle} className="h-5 w-5 rounded text-green-600 focus:ring-green-500"/>
                        <span className={`text-sm font-medium ${isEnabled ? 'text-green-700' : 'text-gray-500'}`}>{isEnabled ? 'Aktív' : 'Inaktív'}</span>
                    </label>
                    <button onClick={() => setIsExpanded(p => !p)} className="text-sm text-blue-600 hover:underline">
                        {isExpanded ? 'Bezár' : 'Szerkesztés'}
                    </button>
                </div>
            </div>
            {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-4">
                    {RECIPIENT_TYPES.includes(typeId) && (
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Értesítendő admin emailek (vesszővel elválasztva)</label>
                            <input
                              type="text"
                              value={recipients}
                              onChange={handleRecipientChange}
                              className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
                              placeholder="admin1@email.com, admin2@email.com"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Sablon tárgya (felülbírálás)</label>
                        <input
                            type="text"
                            value={template.subject}
                            onChange={(e) => handleTemplateChange('subject', e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
                            placeholder="Ha üres, az alapértelmezett tárgy lesz használva"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">HTML sablon (felülbírálás)</label>
                        <textarea
                            rows={8}
                            value={template.html}
                            onChange={(e) => handleTemplateChange('html', e.target.value)}
                            className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm"
                            placeholder="Ha üres, az alapértelmezett sablon lesz használva. Használj {{változó}} formátumot."
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default EmailSettingsApp;