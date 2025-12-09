import React, { useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import XIcon from '../icons/XIcon';

interface EmailTestModalProps {
  unitId: string;
  onClose: () => void;
}

interface EmailPreview {
  typeId: string;
  subject: string;
  html: string;
  payload?: Record<string, any>;
}

interface EmailPreviewResponse {
  previewOnly?: boolean;
  previews?: {
    guest: EmailPreview;
    admin: EmailPreview;
  };
  skippedTypes?: string[];
}

const EmailTestModal: React.FC<EmailTestModalProps> = ({ unitId, onClose }) => {
  const [type, setType] = useState<'booking' | 'feedback'>('booking');
  const [guestEmail, setGuestEmail] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [previews, setPreviews] = useState<EmailPreviewResponse['previews']>();
  const [activeTab, setActiveTab] = useState<'guest' | 'admin'>('guest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOnly, setIsPreviewOnly] = useState(true);

  const callable = useMemo(
    () => httpsCallable(getFunctions(undefined, 'europe-west3'), 'sendTestSystemEmail'),
    []
  );

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await callable({
        unitId,
        type,
        targetGuestEmail: guestEmail || undefined,
        targetAdminEmail: adminEmail || undefined,
        previewOnly: isPreviewOnly,
      });

      const data = res.data as EmailPreviewResponse;
      setPreviews(data.previews);
      if (data?.previews?.admin && activeTab === 'guest') {
        setActiveTab('guest');
      }
    } catch (err: any) {
      setError(err?.message || 'Ismeretlen hiba történt.');
    } finally {
      setLoading(false);
    }
  };

  const currentPreview = activeTab === 'guest' ? previews?.guest : previews?.admin;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <p className="text-sm font-semibold text-blue-600">Teszt Email Rendszer</p>
            <h2 className="text-2xl font-bold text-gray-800">Email sablonok tesztelése</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] divide-y lg:divide-y-0 lg:divide-x">
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email típus</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as 'booking' | 'feedback')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="booking">Foglalási visszaigazolás</option>
                <option value="feedback">Vendég visszajelzés kérés</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Vendég email (opcionális)</label>
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                placeholder="pl. guest@example.com"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Admin email (opcionális)</label>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="pl. admin@example.com"
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
              <input
                type="checkbox"
                checked={isPreviewOnly}
                onChange={e => setIsPreviewOnly(e.target.checked)}
                className="h-4 w-4"
              />
              Csak előnézet (nem küld emailt)
            </label>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? 'Folyamatban...' : isPreviewOnly ? 'Előnézet generálása' : 'Teszt email küldése'}
            </button>

            {previews && (
              <div className="text-xs text-gray-500">
                <p>Előnézet betöltve. Váltás a vendég/admin tabok között lehetséges.</p>
              </div>
            )}
          </div>

          <div className="bg-gray-50 h-full flex flex-col">
            <div className="flex border-b">
              <button
                className={`flex-1 px-4 py-2 font-semibold text-sm ${activeTab === 'guest' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                onClick={() => setActiveTab('guest')}
              >
                Vendég előnézet
              </button>
              <button
                className={`flex-1 px-4 py-2 font-semibold text-sm ${activeTab === 'admin' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
                onClick={() => setActiveTab('admin')}
              >
                Admin előnézet
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {currentPreview ? (
                <iframe
                  title={`${activeTab} preview`}
                  className="w-full h-full border-0"
                  srcDoc={currentPreview.html}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  {loading ? 'Betöltés...' : 'Nincs előnézet. Kérlek generálj előnézetet.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailTestModal;
