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

  const buttonStyles = {
    primary:
      'inline-flex items-center justify-center px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold shadow-[0_10px_30px_rgba(16,185,129,0.25)] hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 transition disabled:opacity-70 disabled:cursor-not-allowed',
    secondary:
      'inline-flex items-center justify-center px-4 py-3 rounded-xl border border-emerald-100 bg-white/80 text-emerald-800 font-semibold shadow-sm hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition disabled:opacity-70 disabled:cursor-not-allowed',
    danger:
      'inline-flex items-center justify-center px-4 py-3 rounded-xl bg-red-600 text-white font-semibold shadow-[0_10px_30px_rgba(248,113,113,0.25)] hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 transition disabled:opacity-70 disabled:cursor-not-allowed',
  };

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
      pending: 'bg-amber-100 text-amber-800 border border-amber-200',
      confirmed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border border-red-200',
    } as const;
    const text = (t as any)[`status_${status}`] || status;
    return (
      <span
        className={`px-3 py-1 text-sm font-bold rounded-full shadow-sm ${styles[status]}`}
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
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-700 font-semibold">WizardBooking</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-emerald-900 leading-tight">{unit.name}</h1>
          <p className="text-lg text-emerald-800/80">{t.manageTitle}</p>
        </header>

        <main className="p-8 bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.05)] rounded-2xl max-w-xl mx-auto relative overflow-hidden max-h-[calc(100vh-180px)] overflow-y-auto">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-100/20 via-transparent to-emerald-200/10" />
          <div className="relative space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-emerald-900">{t.reservationDetails}</h2>
              <p className="text-sm text-emerald-800/80">
                {booking.status === 'pending' ? t.pendingApprovalHint : t.manageTitle}
              </p>
              <div className="h-px bg-gradient-to-r from-emerald-200 via-emerald-300/50 to-transparent" />
            </div>

            <div className="bg-white/70 border border-emerald-100 rounded-xl shadow-inner p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-emerald-900">{t.reservationDetails}</h3>
                {getStatusChip(booking.status)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-emerald-900/90 text-sm sm:text-base">
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.referenceCode}</p>
                  <span className="font-mono bg-emerald-50 px-2 py-1 rounded border border-emerald-100 text-sm">
                    {booking.referenceCode?.substring(0, 8).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.name}</p>
                  <p>{booking.name}</p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.headcount}</p>
                  <p>{booking.headcount}</p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.date}</p>
                  <p>
                    {booking.startTime
                      .toDate()
                      .toLocaleDateString(locale, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.startTime}</p>
                  <p>
                    {booking.startTime
                      .toDate()
                      .toLocaleTimeString(locale, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.email}</p>
                  <p>{booking.contact?.email}</p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-xs uppercase tracking-wide mb-1">{t.phone}</p>
                  <p>
                    {booking.contact?.phoneE164
                      ? maskPhone(booking.contact.phoneE164)
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {booking.status === 'pending' && (
              <div className="p-4 border border-emerald-100 rounded-xl bg-emerald-50/70 text-emerald-900 shadow-inner">
                <p className="font-semibold">{t.pendingApproval}</p>
                <p className="text-sm mt-1 text-emerald-800/80">{t.pendingApprovalHint}</p>
              </div>
            )}

            {booking.status === 'pending' &&
              adminToken &&
              booking.adminActionToken !== adminToken && (
                <div className="p-3 border border-red-200 rounded-lg bg-red-50 text-red-800 text-sm">
                  {t.invalidAdminToken}
                </div>
              )}

            {booking.status === 'pending' &&
              adminToken &&
              booking.adminActionToken === adminToken && (
                <div className="p-4 border border-emerald-200 rounded-xl bg-white/60 text-emerald-900 space-y-3 shadow-inner">
                  <p className="font-semibold">{t.adminActionTitle}</p>
                  {actionMessage && (
                    <p className="text-sm text-emerald-800 bg-emerald-50/80 p-2 rounded-md border border-emerald-100">
                      {actionMessage}
                    </p>
                  )}
                  {actionError && (
                    <p className="text-sm text-red-700 bg-red-50/80 p-2 rounded-md border border-red-200">
                      {actionError}
                    </p>
                  )}
                  {!actionMessage && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleAdminDecision('approve')}
                        className={buttonStyles.primary}
                        disabled={isProcessingAction}
                      >
                        {t.adminApprove}
                      </button>
                      <button
                        onClick={() => handleAdminDecision('reject')}
                        className={buttonStyles.danger}
                        disabled={isProcessingAction}
                      >
                        {t.adminReject}
                      </button>
                    </div>
                  )}
                </div>
              )}

            {booking.status !== 'cancelled' ? (
              <div className="pt-4 border-t border-emerald-100 flex flex-col sm:flex-row gap-4">
                <button
                  disabled
                  className={`${buttonStyles.secondary} w-full cursor-not-allowed text-emerald-500`}
                >
                  {t.modifyReservation}
                </button>
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className={`${buttonStyles.danger} w-full`}
                >
                  {t.cancelReservation}
                </button>
              </div>
            ) : (
              <div className="pt-6 border-t border-emerald-100 text-center">
                <p className="text-lg font-semibold text-red-700">
                  {t.reservationCancelledSuccess}
                </p>
              </div>
            )}
          </div>
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
                  className={buttonStyles.secondary}
                >
                  {t.noKeep}
                </button>
                <button
                  onClick={handleCancelReservation}
                  className={buttonStyles.danger}
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

export default ManageReservationPage;
