import React, { useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface EmailTestModalProps {
  unitId: string;
  onClose: () => void;
  defaultAdminEmail?: string;
  defaultGuestEmail?: string;
}

type TestTab = 'booking' | 'feedback';

type EmailPreview = {
  subject: string;
  html: string;
};

type TestResponse = {
  previewOnly: boolean;
  sent?: boolean;
  skippedTypes?: string[];
  previews?: {
    guest?: EmailPreview & { typeId?: string };
    admin?: EmailPreview & { typeId?: string };
  };
};

const InlineSpinner = () => (
  <svg
    className="animate-spin h-5 w-5 text-white"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

const EmailTestModal: React.FC<EmailTestModalProps> = ({
  unitId,
  onClose,
  defaultAdminEmail,
  defaultGuestEmail,
}) => {
  const [activeTab, setActiveTab] = useState<TestTab>('booking');
  const [adminEmail, setAdminEmail] = useState(defaultAdminEmail || '');
  const [guestEmail, setGuestEmail] = useState(defaultGuestEmail || '');
  const [previewOnly, setPreviewOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResponse | null>(null);

  const previews = useMemo(() => result?.previews || {}, [result]);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const functions = getFunctions(undefined, 'europe-west3');
      const callable = httpsCallable(functions, 'sendTestSystemEmail');
      const { data } = await callable({
        unitId,
        type: activeTab,
        targetAdminEmail: adminEmail || undefined,
        targetGuestEmail: guestEmail || undefined,
        previewOnly,
      });

      setResult(data as TestResponse);
    } catch (err: any) {
      setError(err?.message || 'Ismeretlen hiba történt a teszt futtatásakor.');
    } finally {
      setLoading(false);
    }
  };

  const renderPreviewCard = (
    label: string,
    preview?: EmailPreview,
  ) => {
    if (!preview) return null;
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-white flex justify-between items-center">
          <div>
            <p className="text-sm font-semibold text-gray-700">{label}</p>
            <p className="text-xs text-gray-500 break-all">{preview.subject}</p>
          </div>
        </div>
        <div className="h-80 bg-white">
          <iframe title={`${label} preview`} srcDoc={preview.html} className="w-full h-full" />
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <p className="text-lg font-semibold text-gray-800">Teszt Email rendszer</p>
            <p className="text-sm text-gray-500">Száraz futtatás (nincs adatbázis írás)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="Bezárás"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pt-4 border-b">
          <div className="flex gap-2">
            {(
              [
                { key: 'booking', label: 'Új Foglalás Szimuláció' },
                { key: 'feedback', label: 'Feedback Kérés Szimuláció' },
              ] as { key: TestTab; label: string }[]
            ).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'text-blue-700 border-blue-700'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Admin Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Vendég Email</label>
              <input
                type="email"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="guest@example.com"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={previewOnly}
              onChange={e => setPreviewOnly(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            Csak HTML Preview kérése
          </label>

          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded">
              <p className="font-semibold text-sm">Hiba</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {result?.skippedTypes?.length ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded">
              Az alábbi típusok ki vannak kapcsolva a beállításokban: {result.skippedTypes.join(', ')}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              onClick={runTest}
              disabled={loading}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <InlineSpinner />}
              Teszt futtatása
            </button>
          </div>

          {loading && (
            <div className="flex justify-center py-6">
              <InlineSpinner />
            </div>
          )}

          {!loading && (previews.guest || previews.admin) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {renderPreviewCard('Vendég email', previews.guest)}
              {renderPreviewCard('Admin email', previews.admin)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailTestModal;
