import React, { useEffect, useState } from 'react';
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

const ManageReservationPage: React.FC<ManageReservationPageProps> = ({ token, allUnits }) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locale, setLocale] = useState<Locale>('hu');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminAction, setAdminAction] = useState<'approve' | 'reject' | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('adminToken');
    const actionParam = params.get('action');
    if (tokenParam) setAdminToken(tokenParam);
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
            foundBooking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
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
        setError('Hiba a foglalás betöltésekor. Ellenőrizze a linket, vagy próbálja meg később.');
      } finally {
        setLoading(false);
      }
    };

    if (allUnits.length > 0) fetchBooking();
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
        message: status === 'confirmed' ? 'Foglalás jóváhagyva e-mailből' : 'Foglalás elutasítva e-mailből',
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
      const reservationRef = doc(db, 'units', unit.id, 'reservations', booking.id);
      const update: Record<string, any> = {
        status: nextStatus,
        adminActionHandledAt: serverTimestamp(),
        adminActionSource: 'email',
      };
      if (nextStatus === 'cancelled') update.cancelledBy = 'admin';
      await updateDoc(reservationRef, update);
      await writeDecisionLog(nextStatus);

      setBooking((prev) => (prev ? { ...prev, status: nextStatus } : null));
      setActionMessage(decision === 'approve' ? t.reservationApproved : t.reservationRejected);
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
      const reservationRef = doc(db, 'units', unit.id, 'reservations', booking.id);
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

      setBooking((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      setIsCancelModalOpen(false);
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setError('Hiba a lemondás során.');
    }
  };

  const t = translations[locale];

  useEffect(() => {
    if (booking && booking.status === 'pending' && adminAction && adminToken && booking.adminActionToken === adminToken) {
      handleAdminDecision(adminAction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, adminAction, adminToken]);

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center p-4 text-center font-[Inter] text-emerald-900">
        <div className="bg-white/60 backdrop-blur-xl p-8 rounded-2xl shadow-lg border border-white/60">
          <h2 className="text-2xl font-semibold text-red-700 font-[Playfair Display]">Hiba</h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  if (!booking || !unit) return null;

  const getStatusChip = (status: Booking['status']) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-800 border border-amber-200',
      confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border border-red-200',
    } as const;
    const text = (t as any)[`status_${status}`] || status;
    return <span className={`px-3 py-1 text-sm font-bold rounded-full ${styles[status]}`}>{text}</span>;
  };

  const maskPhone = (phoneE164: string): string => {
    if (!phoneE164 || phoneE164.length < 10) return phoneE164;
    const last4 = phoneE164.slice(-4);
    return phoneE164.slice(0, -7) + '••• •' + last4;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex flex-col items-center p-4 sm:p-6 md:p-8 font-[Inter] text-emerald-900">
      <div className="flex items-center justify-end gap-2 text-sm font-medium w-full max-w-3xl mb-6">
        <button
          onClick={() => setLocale('hu')}
          className={`px-4 py-2 rounded-full transition-all border backdrop-blur-xl ${
            locale === 'hu'
              ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900 font-semibold'
              : 'bg-white/30 border-white/60 text-emerald-700'
          }`}
        >
          Magyar
        </button>
        <button
          onClick={() => setLocale('en')}
          className={`px-4 py-2 rounded-full transition-all border backdrop-blur-xl ${
            locale === 'en'
              ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900 font-semibold'
              : 'bg-white/30 border-white/60 text-emerald-700'
          }`}
        >
          English
        </button>
      </div>

      <header className="text-center mb-8 mt-2">
        <h1 className="text-4xl font-[Playfair Display] text-emerald-900">{unit.name}</h1>
        <p className="text-lg text-emerald-700/80 mt-1">{t.manageTitle}</p>
      </header>

      <main className="w-full max-w-3xl bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.08)] rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 pb-4 border-b border-white/60">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-emerald-700/60">{t.reservationDetails}</p>
            <h2 className="text-3xl font-[Playfair Display] text-emerald-900">{t.manageTitle}</h2>
          </div>
          {getStatusChip(booking.status)}
        </div>

        <div className="space-y-3 text-emerald-800">
          <Detail label={t.referenceCode} value={booking.referenceCode?.substring(0, 8).toUpperCase()} mono />
          <Detail label={t.name} value={booking.name} />
          <Detail label={t.headcount} value={booking.headcount} />
          <Detail
            label={t.date}
            value={booking.startTime
              .toDate()
              .toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          />
          <Detail
            label={t.startTime}
            value={booking.startTime
              .toDate()
              .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          />
          <Detail label={t.email} value={booking.contact?.email || ''} />
          <Detail label={t.phone} value={booking.contact?.phoneE164 ? maskPhone(booking.contact.phoneE164) : 'N/A'} />
        </div>

        {booking.status === 'pending' && (
          <div className="mt-6 p-4 border border-amber-100 rounded-2xl bg-amber-50/70 text-amber-900">
            <p className="font-semibold">{t.pendingApproval}</p>
            <p className="text-sm mt-1">{t.pendingApprovalHint}</p>
          </div>
        )}

        {booking.status === 'pending' && adminToken && booking.adminActionToken !== adminToken && (
          <div className="mt-4 p-3 border border-red-200 rounded-2xl bg-red-50/80 text-red-800 text-sm">{t.invalidAdminToken}</div>
        )}

        {booking.status === 'pending' && adminToken && booking.adminActionToken === adminToken && (
          <div className="mt-6 p-4 border border-emerald-100 rounded-2xl bg-emerald-50/70 space-y-3">
            <p className="font-semibold text-emerald-900">{t.adminActionTitle}</p>
            {actionMessage && (
              <p className="text-sm text-emerald-800 bg-white/70 p-2 rounded-xl border border-emerald-100">{actionMessage}</p>
            )}
            {actionError && (
              <p className="text-sm text-red-700 bg-white/70 p-2 rounded-xl border border-red-100">{actionError}</p>
            )}
            {!actionMessage && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleAdminDecision('approve')}
                  className="flex-1 px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all disabled:opacity-50"
                  disabled={isProcessingAction}
                >
                  {t.adminApprove}
                </button>
                <button
                  onClick={() => handleAdminDecision('reject')}
                  className="flex-1 px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-red-800 rounded-full hover:bg-white/40 transition-all disabled:opacity-50"
                  disabled={isProcessingAction}
                >
                  {t.adminReject}
                </button>
              </div>
            )}
          </div>
        )}

        {booking.status !== 'cancelled' ? (
          <div className="mt-8 pt-6 border-t border-white/60 flex flex-col sm:flex-row gap-4">
            <button
              disabled
              className="w-full px-8 py-3 bg-white/30 backdrop-blur-lg border border-white/50 text-emerald-700/70 rounded-full cursor-not-allowed"
            >
              {t.modifyReservation}
            </button>
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="w-full px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-red-800 rounded-full hover:bg-white/40 transition-all"
            >
              {t.cancelReservation}
            </button>
          </div>
        ) : (
          <div className="mt-8 pt-6 border-t border-white/60 text-center">
            <p className="text-lg font-semibold text-red-700">{t.reservationCancelledSuccess}</p>
          </div>
        )}
      </main>

      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/90 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center text-emerald-900">
            <h2 className="text-xl font-[Playfair Display] text-emerald-900">{t.areYouSureCancel}</h2>
            <p className="text-emerald-700 my-4">{t.cancelConfirmationBody}</p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
              >
                {t.noKeep}
              </button>
              <button
                onClick={handleCancelReservation}
                className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-red-800 rounded-full hover:bg-white/40 transition-all"
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

const Detail: React.FC<{ label: string; value: string | number; mono?: boolean }> = ({ label, value, mono }) => (
  <p className="flex items-center gap-2 text-sm sm:text-base">
    <span className="text-emerald-700/70 w-32 sm:w-40">{label}:</span>
    <span
      className={`flex-1 text-emerald-900 ${
        mono ? 'font-mono px-3 py-1 rounded-full bg-emerald-700/10' : 'font-semibold'
      }`}
    >
      {value}
    </span>
  </p>
);

export default ManageReservationPage;
