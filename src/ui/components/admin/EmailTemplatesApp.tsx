import React, { useState, useEffect, useMemo } from 'react';
import { User, Unit } from '../../../core/models/data';
import { db, serverTimestamp, Timestamp } from '../../../core/firebase/config';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
// FIX: Imported KNOWN_TYPE_IDS from the correct module.
import { KNOWN_TYPE_IDS, EmailTypeId } from '../../../core/email/emailTypes';
import LoadingSpinner from '../../../../components/LoadingSpinner';

interface EmailTemplatesAppProps {
  currentUser: User;
  allUnits: Unit[];
}

interface TemplateData {
  subject: string;
  html: string;
  text: string;
}

// FIX: Renamed component to match filename.
const EmailTemplatesApp: React.FC<EmailTemplatesAppProps> = ({ currentUser, allUnits }) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [selectedTypeId, setSelectedTypeId] = useState<EmailTypeId | ''>('');
  const [templateData, setTemplateData] = useState<TemplateData>({ subject: '', html: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (currentUser.role !== 'Admin' && currentUser.role !== 'Unit Admin') {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
        <h3 className="text-xl font-bold text-red-600">Nincs jogosultság</h3>
        <p className="text-gray-600 mt-2">Nincs jogosultságod az email sablonok kezeléséhez.</p>
      </div>
    );
  }
  
  const availableUnits = useMemo(() => {
    if (currentUser.role === 'Admin') {
      return [{ id: 'default', name: 'Globális (alapértelmezett)' }, ...allUnits];
    }
    return allUnits.filter(u => currentUser.unitIds?.includes(u.id));
  }, [currentUser, allUnits]);

  useEffect(() => {
    if (availableUnits.length === 1) {
      setSelectedUnitId(availableUnits[0].id);
    }
  }, [availableUnits]);

  useEffect(() => {
    if (!selectedUnitId || !selectedTypeId) {
      setTemplateData({ subject: '', html: '', text: '' });
      return;
    }
    const fetchTemplate = async () => {
      setIsLoading(true);
      setError('');
      try {
        const docRef = doc(db, 'email_templates', selectedUnitId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const allTemplates = docSnap.data().templates || {};
          const specificTemplate = allTemplates[selectedTypeId];
          if (specificTemplate) {
            setTemplateData({
              subject: specificTemplate.subject || '',
              html: specificTemplate.html || '',
              text: specificTemplate.text || '',
            });
          } else {
            setTemplateData({ subject: '', html: '', text: '' });
          }
        } else {
          setTemplateData({ subject: '', html: '', text: '' });
        }
      } catch (err) {
        console.error("Error fetching template:", err);
        setError("Hiba a sablon betöltésekor.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplate();
  }, [selectedUnitId, selectedTypeId]);

  const handleSave = async () => {
    if (!selectedUnitId || !selectedTypeId) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      const docRef = doc(db, 'email_templates', selectedUnitId);
      const payload = {
        templates: {
          [selectedTypeId]: {
            ...templateData,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.id,
          }
        }
      };
      await setDoc(docRef, payload, { merge: true });
      setSuccess('Sablon sikeresen elmentve!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error("Error saving template:", err);
      setError("Hiba a sablon mentésekor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTemplateDataChange = (field: keyof TemplateData, value: string) => {
    setTemplateData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Email sablonok szerkesztése</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
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
        <div>
          <label htmlFor="type-select" className="block text-sm font-medium text-gray-700">Sablon típusa</label>
          <select
            id="type-select"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value as EmailTypeId)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md"
            disabled={!selectedUnitId}
          >
            <option value="" disabled>Válassz egy típust...</option>
            {KNOWN_TYPE_IDS.map(typeId => (
              <option key={typeId} value={typeId}>{typeId}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedUnitId && selectedTypeId && (
        <>
          {isLoading ? <div className="relative h-64"><LoadingSpinner /></div> : (
            <div className="space-y-4 border-t pt-6">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-700">Tárgy</label>
                <input
                  id="subject"
                  type="text"
                  value={templateData.subject}
                  onChange={(e) => handleTemplateDataChange('subject', e.target.value)}
                  className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  placeholder="Email tárgya"
                />
              </div>
              <div>
                <label htmlFor="html" className="block text-sm font-medium text-gray-700">HTML tartalom</label>
                <textarea
                  id="html"
                  rows={10}
                  value={templateData.html}
                  onChange={(e) => handleTemplateDataChange('html', e.target.value)}
                  className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm"
                  placeholder="<html>...</html>"
                />
              </div>
              <div>
                <label htmlFor="text" className="block text-sm font-medium text-gray-700">Egyszerű szöveges tartalom</label>
                <textarea
                  id="text"
                  rows={5}
                  value={templateData.text}
                  onChange={(e) => handleTemplateDataChange('text', e.target.value)}
                  className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm"
                  placeholder="Sima szöveges verzió"
                />
              </div>
              <div className="flex items-center justify-end gap-4">
                {error && <p className="text-red-500 text-sm">{error}</p>}
                {success && <p className="text-green-600 text-sm font-semibold">{success}</p>}
                <button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:bg-gray-400">
                  {isSaving ? 'Mentés...' : 'Mentés'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
/**
 * =============================================================================
 * JÖVŐBELI WORKER INTEGRÁCIÓ (DOKUMENTÁCIÓ)
 * =============================================================================
 *
 * Ez a komponens jelenleg csak a Firestore adatbázisba menti a sablonokat.
 * A Cloudflare Worker (ami az emaileket küldi) még nem használja ezeket.
 * A jövőbeli integráció a következőképpen fog működni:
 *
 * 1. A Worker megkapja a frontendtől a `typeId`-t és az opcionális `unitId`-t.
 *
 * 2. Ha van `unitId`, a Worker lekérdezi a `email_templates/{unitId}` dokumentumot
 *    a Firestore-ból. Ha a dokumentumban létezik a kért `typeId` alatt sablon,
 *    akkor azt fogja használni.
 *
 * 3. Ha nincs egység-specifikus sablon, a Worker lekérdezi a globális alapértelmezett
 *    sablonokat az `email_templates/default` dokumentumból. Ha itt létezik a
 *    megfelelő `typeId` alatti sablon, azt használja.
 *
 * 4. Ha a Firestore-ban sehol sem található a sablon, a Worker visszanyúl a kódban
 *    definiált (hard-coded) alapértelmezett sablonhoz.
 *
 * A Worker Firestore-hoz való hozzáférését egy service account JSON kulcs
 * segítségével, a Firebase REST API-n keresztül kell majd megvalósítani.
 * A kulcsot biztonságosan, a Worker titkosított környezeti változói között
 * kell tárolni.
 */
export default EmailTemplatesApp;
