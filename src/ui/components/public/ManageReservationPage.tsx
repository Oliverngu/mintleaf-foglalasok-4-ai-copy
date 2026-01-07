import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Booking, ReservationSetting } from '../../../core/models/data';
import { db, serverTimestamp, Timestamp } from '../../../core/firebase/config';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { translations } from '../../../lib/i18n';
import {
  buildReservationTheme,
  syncThemeCssVariables,
} from '../../../core/ui/reservationTheme';
import PublicReservationLayout from './PublicReservationLayout';

type Locale = 'hu' | 'en';

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  'https://europe-west3-mintleaf-74d27.cloudfunctions.net';

const PlayfulBubbles = () => (
  <>
    <div className="pointer-events-none absolute w-64 h-64 bg-white/40 blur-3xl rounded-full -top-10 -left-10" />
    <div className="pointer-events-none absolute w-52 h-52 bg-white/30 blur-2xl rounded-full top-20 right-10" />
    <div className="pointer-events-none absolute w-40 h-40 bg-white/25 blur-2xl rounded-full bottom-10 left-1/4" />
  </>
);

interface ManageReservationPageProps {
  unitId: string;
  reservationId: string;
  manageToken: string;
  allUnits: Unit[];
}

const ManageReservationPage: React.FC<ManageReservationPageProps> = ({
  unitId,
  reservationId,
  manageToken,
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
  const [hashedAdminToken, setHashedAdminToken] = useState<string | null>(null);
  const [isHashingAdminToken, setIsHashingAdminToken] = useState(false);

  const theme = useMemo(
    () => buildReservationTheme(settings?.theme || null, settings?.uiTheme),
    [settings]
  );

  const isMinimalGlassTheme = settings?.theme?.id === 'minimal_glass';
  const t = translations[locale];

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
    const resolvedUnit =
      allUnits.find((currentUnit) => currentUnit.id === unitId) || null;
    if (resolvedUnit) {
      setUnit(resolvedUnit);
    }
  }, [allUnits, unitId]);

  useEffect(() => {
    const hashToken = async () => {
      if (!adminToken) {
        setHashedAdminToken(null);
        return;
      }
      setIsHashingAdminToken(true);
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(adminToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        setHashedAdminToken(hashHex);
      } catch (hashErr) {
        console.error('Failed to hash admin token', hashErr);
        setHashedAdminToken(null);
      } finally {
        setIsHashingAdminToken(false);
      }
    };

    hashToken();
  }, [adminToken]);

  const isAdminTokenMatch = (
    bookingRecord: Booking | null,
    tokenHash: string | null
  ) => {
    if (!bookingRecord) return false;
    return !!tokenHash && bookingRecord.adminActionTokenHash === tokenHash;
  };

  const isAdminTokenExpired = (bookingRecord: Booking | null) => {
    if (!bookingRecord?.adminActionExpiresAt) return false;
    return bookingRecord.adminActionExpiresAt.toMillis() < Date.now();
  };

  const isAdminTokenExpiredDoc = (reservationData: Booking) => {
    if (!reservationData.adminActionExpiresAt) return false;
    return reservationData.adminActionExpiresAt.toMillis() < Date.now();
  };

  const doesAdminTokenMatchDoc = (
    reservationData: Booking,
    tokenHash: string | null
  ) => {
    return !!tokenHash && reservationData.adminActionTokenHash === tokenHash;
  };

  const isAdminTokenUsed = (bookingRecord: Booking | null) =>
    !!bookingRecord?.adminActionUsedAt;

  const isAdminTokenValid = isAdminTokenMatch(booking, hashedAdminToken);
  const isAdminTokenInvalid =
    !!adminToken &&
    (!isAdminTokenValid || isAdminTokenExpired(booking) || isAdminTokenUsed(booking));

  useEffect(() => {
    const fetchBooking = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${FUNCTIONS_BASE_URL}/guestGetReservation`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              unitId,
              reservationId,
              manageToken,
            }),
          }
        );

        if (!response.ok) {
          if (response.status === 403 || response.status === 404) {
            setError(t.invalidManageLink);
            return;
          }
          throw new Error('FETCH_FAILED');
        }

        const payload = await response.json();
        const foundBooking: Booking = {
          id: payload.id,
          unitId: payload.unitId,
          name: payload.name,
          headcount: payload.headcount,
          startTime: payload.startTime
            ? Timestamp.fromMillis(payload.startTime)
            : Timestamp.fromMillis(Date.now()),
          endTime: payload.endTime
            ? Timestamp.fromMillis(payload.endTime)
            : Timestamp.fromMillis(Date.now()),
          status: payload.status,
          createdAt: Timestamp.fromMillis(Date.now()),
          occasion: payload.occasion || '',
          source: payload.source || '',
          locale: payload.locale || 'hu',
          referenceCode: payload.referenceCode,
          contact: payload.contact || { phoneE164: '', email: '' },
          adminActionTokenHash: payload.adminActionTokenHash || undefined,
          adminActionExpiresAt: payload.adminActionExpiresAt
            ? Timestamp.fromMillis(payload.adminActionExpiresAt)
            : undefined,
          adminActionUsedAt: payload.adminActionUsedAt
            ? Timestamp.fromMillis(payload.adminActionUsedAt)
            : undefined,
        };

        setBooking(foundBooking);
        if (!unit) {
          setUnit({
            id: payload.unitId,
            name: payload.unitName || 'MintLeaf',
          } as Unit);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const langOverride = urlParams.get('lang');
        if (langOverride === 'en' || langOverride === 'hu') {
          setLocale(langOverride);
        } else {
          setLocale(foundBooking.locale || 'hu');
        }
      } catch (err: any) {
        console.error('Error fetching reservation:', err);
        setError(t.actionFailed);
      } finally {
        setLoading(false);
      }
    };

    if (unitId && reservationId && manageToken) {
      fetchBooking();
    } else {
      if (!unitId) {
        setError(
          'Hiányzik az egység azonosítója. Kérjük, használd a teljes foglalási linket.'
        );
      } else {
        setError(t.invalidManageLink);
      }
      setLoading(false);
    }
  }, [manageToken, reservationId, t.actionFailed, t.invalidManageLink, unit, unitId]);

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
    syncThemeCssVariables(theme);
  }, [theme]);

  const writeDecisionLog = async (status: 'confirmed' | 'cancelled') => {
    // Decision logs are written by the backend after token validation.
    void status;
  };

  const handleAdminDecision = async (decision: 'approve' | 'reject') => {
    if (!booking || !unit) return;
    if (!adminToken || isAdminTokenExpired(booking) || isAdminTokenUsed(booking)) {
      setActionError(t.invalidAdminToken);
      return;
    }
    if (!isAdminTokenValid) {
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
      await runTransaction(db, async (transaction) => {
        const reservationSnap = await transaction.get(reservationRef);
        if (!reservationSnap.exists()) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        const reservationData = reservationSnap.data() as Booking;
        if (reservationData.adminActionUsedAt) {
          throw new Error('ADMIN_TOKEN_USED');
        }
        if (reservationData.status === 'cancelled') {
          throw new Error('RESERVATION_ALREADY_CANCELLED');
        }
        if (isAdminTokenExpiredDoc(reservationData)) {
          throw new Error('ADMIN_TOKEN_EXPIRED');
        }
        if (!doesAdminTokenMatchDoc(reservationData, hashedAdminToken)) {
          throw new Error('ADMIN_TOKEN_INVALID');
        }

        const update: Record<string, any> = {
          status: nextStatus,
          adminActionHandledAt: serverTimestamp(),
          adminActionUsedAt: serverTimestamp(),
          adminActionSource: 'email',
        };

        if (nextStatus === 'cancelled') {
          update.cancelledBy = 'admin';
        }

        transaction.update(reservationRef, update);
      });
      await writeDecisionLog(nextStatus);

      // !!! nincs FE email küldés, backend intézi !!!

      setBooking(prev => (prev ? { ...prev, status: nextStatus } : null));
      setActionMessage(
        decision === 'approve' ? t.reservationApproved : t.reservationRejected
      );
    } catch (actionErr) {
      console.error('Error handling admin decision:', actionErr);
      if (actionErr instanceof Error) {
        const errorType = actionErr.message;
        if (
          errorType === 'ADMIN_TOKEN_USED' ||
          errorType === 'RESERVATION_ALREADY_CANCELLED' ||
          errorType === 'ADMIN_TOKEN_EXPIRED' ||
          errorType === 'ADMIN_TOKEN_INVALID'
        ) {
          setActionError(t.invalidAdminToken);
          return;
        }
      }
      setActionError(t.actionFailed);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!booking || !unit) return;
    if (!manageToken) {
      setError(t.invalidManageLink);
      return;
    }
    try {
      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/guestUpdateReservation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unitId: unit.id,
            reservationId: booking.id,
            manageToken,
            action: 'cancel',
            reason: '',
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          setError(t.invalidManageLink);
          return;
        }
        throw new Error('CANCEL_FAILED');
      }

      // !!! nincs FE email küldés, backend intézi !!!

      setBooking(prev =>
        prev ? { ...prev, status: 'cancelled' } : null
      );
      setIsCancelModalOpen(false);
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      setError(t.cancelFailed);
    }
  };

  const baseButtonClasses = useMemo(
    () => ({
      primary: theme.styles.primaryButton,
      secondary: theme.styles.secondaryButton,
      outline: theme.styles.outlineButton,
    }),
    [theme.styles.outlineButton, theme.styles.primaryButton, theme.styles.secondaryButton]
  );

  const decorations = theme.uiTheme === 'playful_bubble' ? <PlayfulBubbles /> : undefined;
  const watermarkText = `${(unit?.name || 'MintLeaf')} reservation system, powered by MintLeaf.`;

  const baseLayoutProps = {
    theme,
    isMinimalGlassTheme,
    decorations,
    watermarkText,
  };

  useEffect(() => {
    if (
      booking &&
      booking.status === 'pending' &&
      adminAction &&
      adminToken &&
      isAdminTokenValid &&
      !isAdminTokenExpired(booking) &&
      !isAdminTokenUsed(booking)
    ) {
      handleAdminDecision(adminAction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, adminAction, adminToken, isAdminTokenValid]);

  if (loading)
    return (
      <PublicReservationLayout
        {...baseLayoutProps}
        header={<LoadingSpinner />}
        body={<div />}
      />
    );
  if (error)
    return (
      <PublicReservationLayout
        {...baseLayoutProps}
        header={
          <h2
            className={`text-xl font-bold text-red-600 ${
              isMinimalGlassTheme ? 'text-[var(--color-text-primary)]' : ''
            }`}
          >
            Hiba
          </h2>
        }
        body={
          <p
            className={`mt-2 ${
              isMinimalGlassTheme ? 'text-[var(--color-text-secondary)]' : 'text-current'
            }`}
          >
            {error}
          </p>
        }
      />
    );
  if (!booking || !unit) return null;

  const getStatusChip = (status: Booking['status']) => {
    const text = (t as any)[`status_${status}`] || status;
    const backgroundColor =
      status === 'pending'
        ? theme.colors.accent + '20'
        : status === 'confirmed'
        ? theme.colors.primary + '20'
        : theme.colors.danger + '20';
    const textColor =
      status === 'pending'
        ? theme.colors.accent
        : status === 'confirmed'
        ? theme.colors.primary
        : theme.colors.danger;
    return (
      <span
        className={`px-3 py-1 text-sm font-bold rounded-full ${theme.radiusClass}`}
        style={{ backgroundColor, color: textColor }}
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

  const headerSection = (
    <>
      <h1
        className={`text-4xl font-bold ${
          isMinimalGlassTheme ? 'text-[var(--color-text-primary)]' : ''
        }`}
        style={{ color: 'var(--color-text-primary)' }}
      >
        {unit.name}
      </h1>
      <p
        className={`text-lg mt-1 ${
          isMinimalGlassTheme ? 'text-[var(--color-text-secondary)]' : ''
        }`}
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {t.manageTitle}
      </p>
    </>
  );

  const bodySection = (
    <div className="flex flex-col gap-4 min-h-full" style={{ color: theme.colors.textPrimary }}>
      <div
        className="flex justify-between items-center pb-4 border-b"
        style={{ borderColor: `${theme.colors.surface}60` }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t.reservationDetails}
        </h2>
        {getStatusChip(booking.status)}
      </div>

      <div className="space-y-3">
        <p>
          <strong>{t.referenceCode}:</strong>{' '}
          <span
            className={`font-mono px-2 py-1 text-sm ${theme.radiusClass}`}
            style={{
              backgroundColor: theme.colors.surface,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.surface}`,
            }}
          >
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
          {booking.contact?.phoneE164 ? maskPhone(booking.contact.phoneE164) : 'N/A'}
        </p>
      </div>

      {booking.status === 'pending' && (
        <div
          className={`mt-6 p-4 ${theme.radiusClass} border`}
          style={{
            backgroundColor: theme.colors.background,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.surface,
          }}
        >
          <p className="font-semibold" style={{ color: theme.colors.textPrimary }}>
            {t.pendingApproval}
          </p>
          <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
            {t.pendingApprovalHint}
          </p>
        </div>
      )}

      {booking.status === 'pending' &&
        adminToken &&
        !isHashingAdminToken &&
        isAdminTokenInvalid && (
          <div
            className={`mt-4 p-3 border ${theme.radiusClass} text-sm`}
            style={{
              backgroundColor: `${theme.colors.danger}10`,
              color: theme.colors.danger,
              borderColor: `${theme.colors.danger}50`,
            }}
          >
            {t.invalidAdminToken}
          </div>
        )}

      {booking.status === 'pending' &&
        adminToken &&
        !isHashingAdminToken &&
        isAdminTokenValid &&
        !isAdminTokenExpired(booking) &&
        !isAdminTokenUsed(booking) && (
          <div
            className={`mt-6 p-4 border ${theme.radiusClass} space-y-3`}
            style={{
              backgroundColor: `${theme.colors.accent}10`,
              color: theme.colors.textPrimary,
              borderColor: `${theme.colors.accent}40`,
            }}
          >
            <p className="font-semibold">{t.adminActionTitle}</p>
            {actionMessage && (
              <p
                className={`text-sm p-2 ${theme.radiusClass} border`}
                style={{
                  color: theme.colors.primary,
                  backgroundColor: theme.colors.surface,
                  borderColor: `${theme.colors.primary}40`,
                }}
              >
                {actionMessage}
              </p>
            )}
            {actionError && (
              <p
                className={`text-sm p-2 ${theme.radiusClass} border`}
                style={{
                  color: theme.colors.danger,
                  backgroundColor: theme.colors.surface,
                  borderColor: `${theme.colors.danger}40`,
                }}
              >
                {actionError}
              </p>
            )}
            {!actionMessage && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleAdminDecision('approve')}
                  className={`${baseButtonClasses.primary} flex-1`}
                  style={{ backgroundColor: theme.colors.primary }}
                  disabled={isProcessingAction}
                >
                  {t.adminApprove}
                </button>
                <button
                  onClick={() => handleAdminDecision('reject')}
                  className={`${baseButtonClasses.primary} flex-1`}
                  style={{ backgroundColor: theme.colors.danger }}
                  disabled={isProcessingAction}
                >
                  {t.adminReject}
                </button>
              </div>
            )}
          </div>
        )}
    </div>
  );

  const footerSection = booking.status !== 'cancelled' ? (
    <div
      className="flex flex-col sm:flex-row gap-4"
      style={{ borderColor: `${theme.colors.surface}60` }}
    >
      <button
        disabled
        className={`${baseButtonClasses.secondary} w-full cursor-not-allowed`}
        style={{
          backgroundColor: theme.colors.surface,
          color: theme.colors.textSecondary,
          opacity: 0.6,
        }}
      >
        {t.modifyReservation}
      </button>
      <button
        onClick={() => setIsCancelModalOpen(true)}
        className={`${baseButtonClasses.primary} w-full`}
        style={{ backgroundColor: theme.colors.danger }}
      >
        {t.cancelReservation}
      </button>
    </div>
  ) : (
    <div className="text-center">
      <p className="text-lg font-semibold" style={{ color: theme.colors.danger }}>
        {t.reservationCancelledSuccess}
      </p>
    </div>
  );

  return (
    <>
      <PublicReservationLayout
        {...baseLayoutProps}
        header={headerSection}
        body={bodySection}
        footer={footerSection}
      />

      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`rounded-2xl shadow-xl w-full max-w-sm p-6 text-center ${theme.radiusClass}`}
            style={{ backgroundColor: theme.colors.surface, color: theme.colors.textPrimary }}
          >
            <h2 className="text-xl font-bold" style={{ color: theme.colors.textPrimary }}>
              {t.areYouSureCancel}
            </h2>
            <p className="my-4" style={{ color: theme.colors.textSecondary }}>
              {t.cancelConfirmationBody}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className={`${baseButtonClasses.secondary}`}
                style={{
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.surface,
                }}
              >
                {t.noKeep}
              </button>
              <button
                onClick={handleCancelReservation}
                className={`${baseButtonClasses.primary}`}
                style={{ backgroundColor: theme.colors.danger }}
              >
                {t.yesCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ManageReservationPage;
