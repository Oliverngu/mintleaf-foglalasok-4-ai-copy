import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Booking, ReservationSetting } from '../../../core/models/data';
import { db, serverTimestamp } from '../../../core/firebase/config';
import { doc, updateDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { translations } from '../../../lib/i18n';
import CalendarIcon from '../../../../components/icons/CalendarIcon';
import { resolveReservationTheme } from '../../../core/ui/reservationTheme';

type Locale = 'hu' | 'en';

const PlayfulBubbles = () => (
  <>
    <div className="pointer-events-none absolute w-64 h-64 bg-white/40 blur-3xl rounded-full -top-10 -left-10" />
    <div className="pointer-events-none absolute w-52 h-52 bg-white/30 blur-2xl rounded-full top-20 right-10" />
    <div className="pointer-events-none absolute w-40 h-40 bg-white/25 blur-2xl rounded-full bottom-10 left-1/4" />
  </>
);

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
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
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

  const theme = useMemo(() => resolveReservationTheme(settings), [settings]);

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

  useEffect(() => {
    const fetchSettings = async () => {
      if (!unit) return;
      try {
        const settingsRef = doc(db, 'reservation_settings', unit.id);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as ReservationSetting;
          setSettings({
            ...data,
            blackoutDates: data.blackoutDates || [],
            id: unit.id,
            uiTheme: data.uiTheme || 'minimal_glass',
          });
        } else {
          setSettings({
            id: unit.id,
            blackoutDates: [],
            uiTheme: 'minimal_glass',
          } as ReservationSetting);
        }
      } catch (settingsErr) {
        console.error('Error fetching reservation settings:', settingsErr);
        setSettings({
          id: unit.id,
          blackoutDates: [],
          uiTheme: 'minimal_glass',
        } as ReservationSetting);
      }
    };

    fetchSettings();
  }, [unit]);

  useEffect(() => {
    const root = document.documentElement;
    const colorMap: Record<string, string> = {
      primary: theme.primaryColor,
      accent: theme.accentColor,
      surface: theme.surfaceColor,
      background: theme.backgroundColor,
      textPrimary: theme.textPrimaryColor,
      textSecondary: theme.textSecondaryColor,
      success: theme.successColor,
      danger: theme.dangerColor,
    };

    Object.entries(colorMap).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [theme]);

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
  const themeClasses = useMemo(
    () => ({
      wrapper: theme.pageWrapperClass,
      card: `${theme.cardClass} flex flex-col max-h-[90vh] w-full mx-auto`,
      primaryButton: theme.buttonPrimaryClass,
      secondaryButton: theme.buttonSecondaryClass,
    }),
    [theme]
  );

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
      <div
        className={themeClasses.wrapper}
        style={{ color: 'var(--color-text-primary)', fontSize: `${theme.fontSizeScale}rem` }}
      >
        {theme.key === 'bubbly' && <PlayfulBubbles />}
        <div className="flex-1 flex flex-col items-center w-full">
          <div className={themeClasses.card}>
            <LoadingSpinner />
          </div>
        </div>
      </div>
    );
  if (error)
    return (
      <div
        className={themeClasses.wrapper}
        style={{ color: 'var(--color-text-primary)', fontSize: `${theme.fontSizeScale}rem` }}
      >
        {theme.key === 'bubbly' && <PlayfulBubbles />}
        <div className="flex-1 flex flex-col items-center w-full">
          <div className={`${themeClasses.card} text-center`}>
            <h2 className="text-xl font-bold text-red-600">Hiba</h2>
            <p className="mt-2 text-current">{error}</p>
          </div>
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

  return (
    <div
      className={themeClasses.wrapper}
      style={{ color: 'var(--color-text-primary)', fontSize: `${theme.fontSizeScale}rem` }}
    >
      {theme.key === 'bubbly' && <PlayfulBubbles />}
      <div className="flex-1 flex flex-col items-center w-full">
        <div className={themeClasses.card}>
          <header className="text-center mb-8 mt-4">
            <h1 className="text-4xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {unit.name}
            </h1>
            <p className="text-lg mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {t.manageTitle}
            </p>
          </header>

        <main className="w-full flex-1 flex flex-col gap-4">
          <div className="flex justify-between items-center mb-2 pb-4 border-b border-white/20">
            <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {t.reservationDetails}
            </h2>
            {getStatusChip(booking.status)}
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto pr-1" style={{ color: 'var(--color-text-primary)' }}>
            <p>
              <strong>{t.referenceCode}:</strong>{' '}
              <span className="font-mono bg-gray-200 px-2 py-1 rounded text-sm text-gray-800">
                {booking.referenceCode?.substring(0, 8).toUpperCase()}
              </span>
            </p>
            <p>
              <strong>{t.name}:</strong> {booking.name}
            </p>
            <p>
              <strong>{t.headcount}:</strong> {booking.headcount}
            </p>
            <p>
              <strong>{t.date}:</strong>{' '}
              {booking.startTime
                .toDate()
                .toLocaleDateString(locale, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
            </p>
            <p>
              <strong>{t.startTime}:</strong>{' '}
              {booking.startTime
                .toDate()
                .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p>
              <strong>{t.email}:</strong> {booking.contact?.email}
            </p>
            <p>
              <strong>{t.phone}:</strong>{' '}
              {booking.contact?.phoneE164
                ? maskPhone(booking.contact.phoneE164)
                : 'N/A'}
            </p>
          </div>

          {booking.status === 'pending' && (
            <div className="mt-6 p-4 border rounded-xl bg-yellow-50 text-yellow-900">
              <p className="font-semibold">{t.pendingApproval}</p>
              <p className="text-sm mt-1">{t.pendingApprovalHint}</p>
            </div>
          )}

          {booking.status === 'pending' &&
            adminToken &&
            booking.adminActionToken !== adminToken && (
              <div className="mt-4 p-3 border border-red-200 rounded-lg bg-red-50 text-red-800 text-sm">
                {t.invalidAdminToken}
              </div>
            )}

          {booking.status === 'pending' &&
            adminToken &&
            booking.adminActionToken === adminToken && (
              <div className="mt-6 p-4 border rounded-xl bg-green-50 text-green-900 space-y-3">
                <p className="font-semibold">{t.adminActionTitle}</p>
                {actionMessage && (
                  <p className="text-sm text-green-800 bg-white/60 p-2 rounded-md border border-green-200">
                    {actionMessage}
                  </p>
                )}
                {actionError && (
                  <p className="text-sm text-red-700 bg-white/60 p-2 rounded-md border border-red-200">
                    {actionError}
                  </p>
                )}
                {!actionMessage && (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => handleAdminDecision('approve')}
                      className={`${themeClasses.primaryButton} flex-1 bg-green-600 text-white hover:bg-green-700`}
                      disabled={isProcessingAction}
                    >
                      {t.adminApprove}
                    </button>
                    <button
                      onClick={() => handleAdminDecision('reject')}
                      className={`${themeClasses.primaryButton} flex-1 bg-red-600 text-white hover:bg-red-700`}
                      disabled={isProcessingAction}
                    >
                      {t.adminReject}
                    </button>
                  </div>
                )}
              </div>
            )}

          {booking.status !== 'cancelled' ? (
            <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row gap-4">
              <button
                disabled
                className={`${themeClasses.secondaryButton} w-full bg-gray-300 text-gray-500 cursor-not-allowed`}
              >
                {t.modifyReservation}
              </button>
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className={`${themeClasses.primaryButton} w-full bg-red-600 text-white hover:bg-red-700`}
              >
                {t.cancelReservation}
              </button>
            </div>
          ) : (
            <div className="mt-8 pt-6 border-t text-center">
              <p className="text-lg font-semibold text-red-700">
                {t.reservationCancelledSuccess}
              </p>
            </div>
          )}
        </main>
      </div>
      </div>

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
                className={`${themeClasses.secondaryButton} bg-gray-200 text-gray-800 hover:bg-gray-300`}
              >
                {t.noKeep}
              </button>
              <button
                onClick={handleCancelReservation}
                className={`${themeClasses.primaryButton} bg-red-600 text-white hover:bg-red-700`}
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
