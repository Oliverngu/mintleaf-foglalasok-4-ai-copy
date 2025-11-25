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

      // !!! nincs FE email küldés, backend intézi !!!

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

      // !!! nincs FE email küldés, backend intézi !!!

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-red-600">Hiba</h2>
          <p className="text-gray-800 mt-2">{error}</p>
        </div>
      </div>
    );
  if (!booking || !unit) return null;

  const getStatusChip = (status: Booking['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    } as const;
    const text = (t as any)[`status_${status}`] || status;
    return (
      <span
        className={`px-3 py-1 text-sm font-bold rounded-full ${styles[status]}`}
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

  const formattedDate = booking.startTime
    .toDate()
    .toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const formattedTime = `${booking.startTime
    .toDate()
    .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} - ${booking.endTime
    .toDate()
    .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const contactEmail = booking.contact?.email || booking.email || '—';
  const contactPhone = booking.contact?.phoneE164
    ? maskPhone(booking.contact.phoneE164)
    : booking.phone || 'N/A';
  const occasion = booking.occasion || booking.customData?.occasion || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex flex-col items-center p-4 sm:p-6 md:p-10">
      <div className="w-full max-w-3xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/30 via-transparent to-yellow-200/30 blur-3xl" />
        <header className="relative text-center mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-2">{unit.name}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-emerald-900 drop-shadow-sm">{t.manageTitle}</h1>
          <p className="text-emerald-800/80 mt-3 max-w-xl mx-auto leading-relaxed">
            {t.reservationDetails}
          </p>
        </header>

        <main className="relative bg-white/80 backdrop-blur-xl border border-white/60 shadow-2xl rounded-3xl p-8 sm:p-10 space-y-8">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-emerald-100">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-700 font-semibold mb-1">
                {t.referenceCode}
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-800 font-mono text-sm rounded-full border border-emerald-100">
                <CalendarIcon className="w-4 h-4" />
                {booking.referenceCode?.substring(0, 8).toUpperCase()}
              </div>
            </div>
            {getStatusChip(booking.status)}
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <DetailRow label={t.name} value={booking.name} highlight />
              <DetailRow label={t.headcount} value={`${booking.headcount} fő`} />
              {occasion && <DetailRow label={t.occasion || 'Alkalom'} value={occasion} />}
            </div>
            <div className="space-y-4">
              <DetailRow label={t.date} value={formattedDate} />
              <DetailRow label={t.startTime} value={formattedTime} />
              {booking.reservationMode && (
                <DetailRow
                  label={t.reservationModeLabel || 'Mód'}
                  value={
                    booking.reservationMode === 'auto'
                      ? t.reservationModeAuto || 'Automatikus'
                      : t.reservationModeRequest || 'Kérelem'
                  }
                />
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <DetailRow label={t.email} value={contactEmail} />
              <DetailRow label={t.phone} value={contactPhone} />
            </div>
            <div className="space-y-4">
              {booking.customData?.bookingRef && (
                <DetailRow label={t.referenceCode} value={booking.customData.bookingRef} />
              )}
              {booking.customData?.occasionOther && (
                <DetailRow label={t.occasionOther || 'Egyéb alkalom'} value={booking.customData.occasionOther} />
              )}
            </div>
          </section>

          {booking.notes && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-900">
              <p className="text-xs uppercase tracking-widest font-semibold mb-2">
                {t.notes || 'Megjegyzés'}
              </p>
              <p className="leading-relaxed">{booking.notes}</p>
            </div>
          )}

          {booking.status === 'pending' && (
            <div className="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 text-yellow-900">
              <p className="font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                {t.pendingApproval}
              </p>
              <p className="text-sm mt-1 leading-relaxed">{t.pendingApprovalHint}</p>
            </div>
          )}

          {booking.status === 'pending' &&
            adminToken &&
            booking.adminActionToken !== adminToken && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm">
                {t.invalidAdminToken}
              </div>
            )}

          {booking.status === 'pending' &&
            adminToken &&
            booking.adminActionToken === adminToken && (
              <div className="p-4 rounded-2xl bg-emerald-900 text-emerald-50 space-y-3">
                <p className="font-semibold text-lg">{t.adminActionTitle}</p>
                {actionMessage && (
                  <p className="text-sm bg-emerald-800/50 p-3 rounded-xl border border-emerald-700">
                    {actionMessage}
                  </p>
                )}
                {actionError && (
                  <p className="text-sm bg-red-500/20 p-3 rounded-xl border border-red-300 text-red-50">
                    {actionError}
                  </p>
                )}
                {!actionMessage && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleAdminDecision('approve')}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 text-white font-semibold rounded-xl shadow-lg hover:bg-emerald-400 transition disabled:opacity-60"
                      disabled={isProcessingAction}
                    >
                      {t.adminApprove}
                    </button>
                    <button
                      onClick={() => handleAdminDecision('reject')}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-white text-emerald-950 font-semibold rounded-xl shadow-lg hover:bg-emerald-50 transition disabled:opacity-60"
                      disabled={isProcessingAction}
                    >
                      {t.adminReject}
                    </button>
                  </div>
                )}
              </div>
            )}

          {booking.status !== 'cancelled' ? (
            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-emerald-100">
              <button
                disabled
                className="w-full bg-gray-200 text-gray-500 font-semibold py-3 px-6 rounded-xl cursor-not-allowed"
              >
                {t.modifyReservation}
              </button>
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="w-full bg-red-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-red-700 shadow-md"
              >
                {t.cancelReservation}
              </button>
            </div>
          ) : (
            <div className="pt-4 border-t border-emerald-100 text-center">
              <p className="text-lg font-semibold text-red-700">
                {t.reservationCancelledSuccess}
              </p>
            </div>
          )}
        </main>

        {isCancelModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <h2 className="text-xl font-bold text-gray-800">
                {t.areYouSureCancel}
              </h2>
              <p className="text-gray-600 my-4">
                {t.cancelConfirmationBody}
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setIsCancelModalOpen(false)}
                  className="bg-gray-200 text-gray-800 font-bold py-2 px-6 rounded-lg hover:bg-gray-300"
                >
                  {t.noKeep}
                </button>
                <button
                  onClick={handleCancelReservation}
                  className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-red-700"
                >
                  {t.yesCancel}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div className="flex items-start gap-3">
    <div className="mt-1 w-2 h-2 rounded-full bg-emerald-500" />
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-1">
        {label}
      </p>
      <p
        className={`${
          highlight ? 'text-xl font-semibold text-emerald-950' : 'text-base font-medium text-emerald-900'
        } leading-snug`}
      >
        {value}
      </p>
    </div>
  </div>
);

export default ManageReservationPage;
