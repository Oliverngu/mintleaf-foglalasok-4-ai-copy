import React, { useState, useEffect } from 'react';
import { Unit, Booking } from '../../../core/models/data';
import { db, serverTimestamp } from '../../../core/firebase/config';
import { doc, updateDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { translations } from '../../../lib/i18n';
import CalendarIcon from '../../../../components/icons/CalendarIcon';

type Locale = 'hu' | 'en';

interface ManageReservationPageProps {
  token: string;
  allUnits: Unit[];
}

const ManageReservationPage: React.FC<ManageReservationPageProps> = ({
  token,
  allUnits,
}) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locale, setLocale] = useState<Locale>('hu');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminAction, setAdminAction] = useState<'approve' | 'reject' | null>(
    null
  );
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('adminToken');
    const actionParam = params.get('action');
    if (tokenParam) {
      setAdminToken(tokenParam);
    }
    if (actionParam === 'approve' || actionParam === 'reject') {
      setAdminAction(actionParam);
    }
  }, []);

  useEffect(() => {
    const fetchBooking = async () => {
      setLoading(true);
      try {
        let foundBooking: Booking | null = null;
        let foundUnit: Unit | null = null;

        for (const unit of allUnits) {
          const bookingRef = doc(db, 'units', unit.id, 'reservations', token);
          const bookingSnap = await getDoc(bookingRef);
          if (bookingSnap.exists()) {
            foundBooking = {
              id: bookingSnap.id,
              ...bookingSnap.data(),
            } as Booking;
            foundUnit = unit;
            break;
          }
        }

        if (!foundBooking) {
          setError('A foglalás nem található.');
        } else {
          setBooking(foundBooking);
          setUnit(foundUnit);

          const urlParams = new URLSearchParams(window.location.search);
          const langOverride = urlParams.get('lang');
          if (langOverride === 'en' || langOverride === 'hu') {
            setLocale(langOverride);
          } else {
            setLocale(foundBooking.locale || 'hu');
          }
        }
      } catch (err: any) {
        console.error('Error fetching reservation:', err);
        setError(
          'Hiba a foglalás betöltésekor. Ellenőrizze a linket, vagy próbálja meg később.'
        );
      } finally {
        setLoading(false);
      }
    };

    if (allUnits.length > 0) {
      fetchBooking();
    }
  }, [token, allUnits]);

  const writeDecisionLog = async (status: 'confirmed' | 'cancelled') => {
    if (!booking || !unit) return;
    try {
      const logsRef = collection(db, 'units', unit.id, 'reservation_logs');
      await addDoc(logsRef, {
        bookingId: booking.id,
        unitId: unit.id,
        type: status === 'confirmed' ? 'updated' : 'cancelled',
        createdAt: serverTimestamp(),
        createdByUserId: null,
        createdByName: 'Email jóváhagyás',
        source: 'internal',
        message:
          status === 'confirmed'
            ? 'Foglalás jóváhagyva e-mailből'
            : 'Foglalás elutasítva e-mailből',
      });
    } catch (logErr) {
      console.error('Failed to write admin decision log', logErr);
    }
  };

  const handleAdminDecision = async (decision: 'approve' | 'reject') => {
    if (!booking || !unit) return;
    if (!adminToken || booking.adminActionToken !== adminToken) {
      setActionError(t.invalidAdminToken);
      return;
    }
    setIsProcessingAction(true);
    setActionError('');
    try {
      const nextStatus = decision === 'approve' ? 'confirmed' : 'cancelled';
      const reservationRef = doc(
        db,
        'units',
        unit.id,
        'reservations',
        booking.id
      );
      const update: Record<string, any> = {
        status: nextStatus,
        adminActionHandledAt: serverTimestamp(),
        adminActionSource: 'email',
      };
      if (nextStatus === 'cancelled') {
        update.cancelledBy = 'admin';
      }
      await updateDoc(reservationRef, update);
      await writeDecisionLog(nextStatus);

      setBooking(prev => (prev ? { ...prev, status: nextStatus } : null));
      setActionMessage(
        decision === 'approve' ? t.reservationApproved : t.reservationRejected
      );
    } catch (actionErr) {
      console.error('Error handling admin decision:', actionErr);
      setActionError(t.actionFailed);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!booking || !unit) return;
    try {
      const reservationRef = doc(
        db,
        'units',
        unit.id,
        'reservations',
        booking.id
      );
      await updateDoc(reservationRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'guest',
      });

      try {
        const logsRef = collection(db, 'units', unit.id, 'reservation_logs');
        await addDoc(logsRef, {
          bookingId: booking.id,
          unitId: unit.id,
          type: 'cancelled',
          createdAt: serverTimestamp(),
          createdByUserId: null,
          createdByName: booking.name,
          source: 'guest',
          message: 'Vendég lemondta a foglalást a vendégportálon.',
        });
      } catch (logErr) {
        console.error('Failed to log guest cancellation', logErr);
      }

      setBooking(prev =>
        prev ? { ...prev, status: 'cancelled' } : null
      );
      setIsCancelModalOpen(false);
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setError('Hiba a lemondás során.');
    }
  };

  const t = translations[locale];

  useEffect(() => {
    if (
      booking &&
      booking.status === 'pending' &&
      adminAction &&
      adminToken &&
      booking.adminActionToken === adminToken
    ) {
      handleAdminDecision(adminAction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, adminAction, adminToken]);

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-4 text-center" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="bg-white/80 p-8 rounded-2xl shadow-xl border border-white/60">
          <h2
            className="text-2xl font-bold text-red-600"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Hiba
          </h2>
          <p className="text-gray-800 mt-2">{error}</p>
        </div>
      </div>
    );
  if (!booking || !unit) return null;

  const getStatusChip = (status: Booking['status']) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800 border border-amber-200',
      confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      cancelled: 'bg-rose-100 text-rose-800 border border-rose-200',
    } as const;
    const text = (t as any)[`status_${status}`] || status;
    return (
      <span
        className={`px-3 py-1 text-sm font-bold rounded-full shadow-sm ${styles[status]}`}
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {text}
      </span>
    );
  };

  const maskPhone = (phoneE164: string): string => {
    if (!phoneE164 || phoneE164.length < 10) return phoneE164;
    const last4 = phoneE164.slice(-4);
    return phoneE164.slice(0, -7) + '••• •' + last4;
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex flex-col items-center p-4 sm:p-6 md:p-10"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_30%)]" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-4xl">
        <div className="flex items-center justify-end gap-3 text-sm font-medium mb-4">
          <button
            onClick={() => setLocale('hu')}
            className={`px-3 py-1 rounded-full transition-colors ${
              locale === 'hu'
                ? 'bg-white/80 shadow text-[var(--color-primary)]'
                : 'text-gray-600 hover:text-[var(--color-primary)]'
            }`}
          >
            Magyar
          </button>
          <button
            onClick={() => setLocale('en')}
            className={`px-3 py-1 rounded-full transition-colors ${
              locale === 'en'
                ? 'bg-white/80 shadow text-[var(--color-primary)]'
                : 'text-gray-600 hover:text-[var(--color-primary)]'
            }`}
          >
            English
          </button>
        </div>

        <header className="text-center mb-8 mt-4">
          <h1
            className="text-4xl sm:text-5xl font-semibold text-gray-900 drop-shadow-sm"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {unit.name}
          </h1>
          <p className="text-lg text-gray-600 mt-1">{t.manageTitle}</p>
        </header>

        <main className="relative overflow-hidden rounded-3xl border border-white/60 shadow-2xl backdrop-blur-xl bg-white/70 p-6 sm:p-10">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{t.reservationDetails}</p>
                <h2
                  className="text-2xl sm:text-3xl font-semibold text-gray-900"
                  style={{ fontFamily: 'Playfair Display, serif' }}
                >
                  {booking.name}
                </h2>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600 items-center">
                  <CalendarIcon className="w-4 h-4" />
                  <span>
                    {booking.startTime
                      .toDate()
                      .toLocaleDateString(locale, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                  </span>
                  <span>•</span>
                  <span>
                    {booking.startTime
                      .toDate()
                      .toLocaleTimeString(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                  </span>
                </div>
              </div>
              {getStatusChip(booking.status)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-800">
              <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500 mb-2">{t.referenceCode}</p>
                <span className="font-mono bg-gray-100 px-3 py-2 rounded-lg text-sm inline-block">
                  {booking.referenceCode?.substring(0, 8).toUpperCase()}
                </span>
              </div>
              <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500 mb-1">{t.headcount}</p>
                <p className="text-xl font-semibold text-gray-900">{booking.headcount}</p>
              </div>
              <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500 mb-1">{t.email}</p>
                <p className="text-gray-900 break-words">{booking.contact?.email}</p>
              </div>
              <div className="bg-white/80 border border-gray-100 rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500 mb-1">{t.phone}</p>
                <p className="text-gray-900">{booking.contact?.phoneE164 ? maskPhone(booking.contact.phoneE164) : 'N/A'}</p>
              </div>
            </div>

            {booking.status === 'pending' && (
              <div className="p-4 border rounded-2xl bg-amber-50 text-amber-900 shadow-sm">
                <p className="font-semibold">{t.pendingApproval}</p>
                <p className="text-sm mt-1">{t.pendingApprovalHint}</p>
              </div>
            )}

            {booking.status === 'pending' &&
              adminToken &&
              booking.adminActionToken !== adminToken && (
                <div className="p-3 border border-red-200 rounded-2xl bg-red-50 text-red-800 text-sm">
                  {t.invalidAdminToken}
                </div>
              )}

            {booking.status === 'pending' &&
              adminToken &&
              booking.adminActionToken === adminToken && (
                <div className="p-4 border rounded-2xl bg-emerald-50 text-emerald-900 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{t.adminActionTitle}</p>
                    <span className="text-xs uppercase tracking-[0.14em] text-emerald-700">Admin</span>
                  </div>
                  {actionMessage && (
                    <p className="text-sm text-emerald-800 bg-white/70 p-3 rounded-xl border border-emerald-200">
                      {actionMessage}
                    </p>
                  )}
                  {actionError && (
                    <p className="text-sm text-red-700 bg-white/70 p-3 rounded-xl border border-red-200">
                      {actionError}
                    </p>
                  )}
                  {!actionMessage && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleAdminDecision('approve')}
                        className="flex-1 bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl hover:shadow-lg disabled:opacity-60 transition"
                        disabled={isProcessingAction}
                      >
                        {t.adminApprove}
                      </button>
                      <button
                        onClick={() => handleAdminDecision('reject')}
                        className="flex-1 bg-rose-600 text-white font-semibold py-3 px-4 rounded-xl hover:shadow-lg disabled:opacity-60 transition"
                        disabled={isProcessingAction}
                      >
                        {t.adminReject}
                      </button>
                    </div>
                  )}
                </div>
              )}

            {booking.status !== 'cancelled' ? (
              <div className="pt-4 flex flex-col sm:flex-row gap-4">
                <button
                  disabled
                  className="w-full bg-gray-200/80 text-gray-500 font-semibold py-3 px-6 rounded-xl cursor-not-allowed border border-gray-200"
                >
                  {t.modifyReservation}
                </button>
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className="w-full bg-rose-600 text-white font-semibold py-3 px-6 rounded-xl hover:shadow-lg"
                >
                  {t.cancelReservation}
                </button>
              </div>
            ) : (
              <div className="pt-4 text-center">
                <p className="text-lg font-semibold text-rose-700">
                  {t.reservationCancelledSuccess}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            <h2
              className="text-xl font-bold text-gray-800"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {t.areYouSureCancel}
            </h2>
            <p className="text-gray-600 my-4">{t.cancelConfirmationBody}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="bg-gray-200 text-gray-800 font-semibold py-2 px-6 rounded-xl hover:bg-gray-300"
              >
                {t.noKeep}
              </button>
              <button
                onClick={handleCancelReservation}
                className="bg-rose-600 text-white font-semibold py-2 px-6 rounded-xl hover:shadow-lg"
              >
                {t.yesCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageReservationPage;
