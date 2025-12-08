import React, { useEffect, useMemo, useState } from 'react';
import { functionsBaseUrl } from '../../../core/firebase/config';

interface EmailTestModalProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  defaultAdminEmail?: string;
  defaultGuestEmail?: string;
}

const EmailTestModal: React.FC<EmailTestModalProps> = ({
  open,
  onClose,
  unitId,
  defaultAdminEmail = '',
  defaultGuestEmail = '',
}) => {
  const [activeTab, setActiveTab] = useState<'reservation' | 'feedback'>('reservation');
  const [adminEmail, setAdminEmail] = useState(defaultAdminEmail);
  const [guestEmail, setGuestEmail] = useState(defaultGuestEmail);
  const [locale, setLocale] = useState<'hu' | 'en'>('hu');
  const [previewHtml, setPreviewHtml] = useState('');
  const [payload, setPayload] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab('reservation');
      setAdminEmail(defaultAdminEmail);
      setGuestEmail(defaultGuestEmail);
      setLocale('hu');
      setPreviewHtml('');
      setPayload(null);
      setError(null);
      setSuccessMessage('');
      setShowRaw(false);
    }
  }, [open, defaultAdminEmail, defaultGuestEmail]);

  const endpoint = useMemo(
    () =>
      activeTab === 'reservation'
        ? 'sendTestReservationEmails'
        : 'sendTestFeedbackEmail',
    [activeTab]
  );

  const handleSend = async () => {
    setError(null);
    setSuccessMessage('');

    if (!guestEmail) {
      setError('A vendég email megadása kötelező.');
      return;
    }

    if (activeTab === 'reservation' && !adminEmail) {
      setError('Az admin email megadása kötelező az új foglalás teszthez.');
      return;
    }

    try {
      setLoading(true);
      const body: Record<string, any> = { unitId, guestEmail, locale };
      if (activeTab === 'reservation') {
        body.adminEmail = adminEmail;
      }

      const response = await fetch(`${functionsBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ismeretlen hiba');
      }

      setPreviewHtml(data.previewHtml || '');
      setPayload(data.payload || null);
      setSuccessMessage('Teszt email elküldve.');
    } catch (err: any) {
      setError(err?.message || 'Nem sikerült a teszt email küldése.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Teszt email küldése</h2>
            <p className="text-sm text-gray-500">Foglalási és feedback sablonok élő előnézete</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Bezárás"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 pt-3 border-b">
          <div className="inline-flex bg-gray-100 rounded-xl p-1">
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                activeTab === 'reservation' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('reservation')}
            >
              Új foglalás teszt
            </button>
            <button
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${
                activeTab === 'feedback' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('feedback')}
            >
              Feedback email teszt
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-y-auto">
          <div className="space-y-3 lg:col-span-1">
            {error && (
              <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded-lg text-sm">
                {successMessage}
              </div>
            )}
            {activeTab === 'reservation' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Admin email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@pelda.hu"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Vendég email</label>
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="vendeg@pelda.hu"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nyelv</label>
              <select
                value={locale}
                onChange={e => setLocale(e.target.value as 'hu' | 'en')}
                className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hu">Magyar</option>
                <option value="en">Angol</option>
              </select>
            </div>
            <button
              onClick={handleSend}
              disabled={loading}
              className={`w-full py-2 rounded-lg font-semibold text-white transition ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Küldés...' : 'Teszt küldése'}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <input
                id="showRaw"
                type="checkbox"
                className="h-4 w-4"
                checked={showRaw}
                onChange={e => setShowRaw(e.target.checked)}
              />
              <label htmlFor="showRaw" className="cursor-pointer">
                RAW JSON megjelenítése
              </label>
            </div>
            {showRaw && (
              <div className="bg-gray-900 text-green-200 rounded-lg p-3 text-xs overflow-auto max-h-48">
                <pre className="whitespace-pre-wrap break-all">{JSON.stringify(payload, null, 2)}</pre>
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">HTML előnézet</h3>
              <span className="text-xs text-gray-500">Aktív sablon + brand színek</span>
            </div>
            <div className="border rounded-lg p-3 h-[60vh] overflow-auto bg-gray-50">
              {previewHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <div className="text-sm text-gray-500 h-full flex items-center justify-center">
                  Küldj egy tesztet az előnézethez.
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
