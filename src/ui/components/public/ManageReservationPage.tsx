import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Unit, Booking, PublicBookingDTO, ReservationSetting } from '../../../core/models/data';
import { db } from '../../../core/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { translations } from '../../../lib/i18n';
import {
  buildReservationTheme,
  defaultThemeSettings,
  syncThemeCssVariables,
} from '../../../core/ui/reservationTheme';
import PublicReservationLayout from './PublicReservationLayout';
import { normalizeSubmitError, type SubmitError } from '../../utils/normalizeSubmitError';
import { getOnlineStatus } from '../../utils/getOnlineStatus';
import { logTokenPresence } from '../../utils/logTokenPresence';
import { v4 as uuidv4 } from 'uuid';

type Locale = 'hu' | 'en';

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  'https://europe-west3-mintleaf-74d27.cloudfunctions.net';

const MIN_HEADCOUNT = 1;
const MAX_HEADCOUNT = 30;

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
}

const ManageReservationPage: React.FC<ManageReservationPageProps> = ({
  unitId,
  reservationId,
  manageToken,
}) => {
  const [booking, setBooking] = useState<PublicBookingDTO | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locale, setLocale] = useState<Locale>('hu');
  const [actionState, setActionState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [actionError, setActionError] = useState<SubmitError | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminAction, setAdminAction] = useState<'approve' | 'reject' | null>(
    null
  );
  const [actionMessage, setActionMessage] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [hashedAdminToken, setHashedAdminToken] = useState<string | null>(null);
  const [isHashingAdminToken, setIsHashingAdminToken] = useState(false);
  const [modifyHeadcount, setModifyHeadcount] = useState('');
  const [modifyStartTime, setModifyStartTime] = useState('');
  const [modifyEndTime, setModifyEndTime] = useState('');
  const [modifyError, setModifyError] = useState('');
  const [modifySuccess, setModifySuccess] = useState('');
  const [isSavingModification, setIsSavingModification] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const actionErrorRef = useRef<HTMLDivElement | null>(null);

  const theme = useMemo(
    () => buildReservationTheme(settings?.theme || null, settings?.uiTheme),
    [settings]
  );

  const isMinimalGlassTheme = settings?.theme?.id === 'minimal_glass';
  const t = translations[locale];
  const isSubmittingAction = actionState === 'submitting';

  useEffect(() => {
    if (actionError && actionErrorRef.current) {
      actionErrorRef.current.focus();
    }
  }, [actionError]);

  const createTraceId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : uuidv4();

  const reportActionError = (
    traceId: string,
    context: { action: string },
    errorInput: Parameters<typeof normalizeSubmitError>[0]
  ) => {
    const normalized = normalizeSubmitError({
      ...errorInput,
      traceId,
      isOnline: getOnlineStatus(),
      locale,
    });
    setActionError(normalized);
    setActionState('error');
    console.log(
      `[manage-action] error traceId=${traceId} kind=${normalized.kind} message=${normalized.userMessage} action=${context.action}`
    );
  };

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

  const buildPublicUnit = (
    settingsValue: ReservationSetting | null,
    fallbackName: string
  ): Unit => {
    const settingsAny = settingsValue as Record<string, any> | null;
    const name =
      settingsAny?.publicName ||
      settingsAny?.unitName ||
      settingsAny?.brandName ||
      fallbackName ||
      'MintLeaf';
    const logoUrl =
      settingsValue?.theme?.headerLogoUrl || settingsValue?.theme?.timeWindowLogoUrl;
    return {
      id: unitId,
      name,
      logoUrl,
    };
  };

  useEffect(() => {
    if (!unitId) return;
    const fetchSettings = async () => {
      try {
        const settingsRef = doc(db, 'reservation_settings', unitId);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() as ReservationSetting;
          const nextSettings: ReservationSetting = {
            ...data,
            blackoutDates: data.blackoutDates || [],
            id: unitId,
            uiTheme: data.uiTheme || 'minimal_glass',
            theme: {
              ...defaultThemeSettings,
              ...(data.theme || {}),
            },
          };
          setSettings(nextSettings);
          setUnit(prev => prev ?? buildPublicUnit(nextSettings, unitId));
          return;
        }
        const fallbackSettings: ReservationSetting = {
          id: unitId,
          blackoutDates: [],
          uiTheme: 'minimal_glass',
          theme: defaultThemeSettings,
        } as ReservationSetting;
        setSettings(fallbackSettings);
        setUnit(prev => prev ?? buildPublicUnit(fallbackSettings, unitId));
      } catch (settingsErr) {
        console.error('Error fetching reservation settings:', settingsErr);
        const fallbackSettings: ReservationSetting = {
          id: unitId,
          blackoutDates: [],
          uiTheme: 'minimal_glass',
          theme: defaultThemeSettings,
        } as ReservationSetting;
        setSettings(fallbackSettings);
        setUnit(prev => prev ?? buildPublicUnit(fallbackSettings, unitId));
      }
    };

    fetchSettings();
  }, [unitId]);

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
    bookingRecord: PublicBookingDTO | null,
    tokenHash: string | null
  ) => {
    if (!bookingRecord) return false;
    return !!tokenHash && bookingRecord.adminActionTokenHash === tokenHash;
  };

  const isAdminTokenExpired = (bookingRecord: PublicBookingDTO | null) => {
    if (!bookingRecord?.adminActionExpiresAtMs) return false;
    return bookingRecord.adminActionExpiresAtMs < Date.now();
  };

  const isAdminTokenUsed = (bookingRecord: PublicBookingDTO | null) =>
    !!bookingRecord?.adminActionUsedAtMs;

  const isAdminTokenValid = isAdminTokenMatch(booking, hashedAdminToken);
  const isModifyLocked =
    !booking?.startTimeMs || booking?.status !== 'pending';
  const showAdminSection = !!adminToken && !isHashingAdminToken;
  const isAdminActionAvailable =
    showAdminSection &&
    booking?.status === 'pending' &&
    isAdminTokenValid &&
    !isAdminTokenExpired(booking) &&
    !isAdminTokenUsed(booking);

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
        const foundBooking: PublicBookingDTO = {
          id: payload.id,
          unitId: payload.unitId,
          unitName: payload.unitName,
          name: payload.name,
          headcount: payload.headcount,
          startTimeMs: payload.startTimeMs ?? null,
          endTimeMs: payload.endTimeMs ?? null,
          preferredTimeSlot: payload.preferredTimeSlot ?? null,
          seatingPreference: payload.seatingPreference ?? 'any',
          status: payload.status,
          occasion: payload.occasion || '',
          source: payload.source || '',
          locale: payload.locale || 'hu',
          referenceCode: payload.referenceCode,
          cancelReason: payload.cancelReason || '',
          cancelledBy: payload.cancelledBy || undefined,
          contact: payload.contact || { phoneE164: '', email: '' },
          adminActionTokenHash: payload.adminActionTokenHash || null,
          adminActionExpiresAtMs: payload.adminActionExpiresAtMs ?? null,
          adminActionUsedAtMs: payload.adminActionUsedAtMs ?? null,
        };

        setBooking(foundBooking);
        setUnit(prev =>
          prev ??
          ({
            id: payload.unitId,
            name: payload.unitName || 'MintLeaf',
          } as Unit)
        );

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
  }, [manageToken, reservationId, t.actionFailed, t.invalidManageLink, unitId]);

  useEffect(() => {
    syncThemeCssVariables(theme);
  }, [theme]);

  const formatTimeInput = (dateValue: Date | null) => {
    if (!dateValue) return '';
    const hours = String(dateValue.getHours()).padStart(2, '0');
    const minutes = String(dateValue.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const mergeDateAndTime = (baseDate: Date, timeValue: string) => {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const nextDate = new Date(baseDate);
    nextDate.setHours(hours, minutes, 0, 0);
    return nextDate;
  };

  useEffect(() => {
    if (!booking) return;
    const startDate = booking.startTimeMs ? new Date(booking.startTimeMs) : null;
    const endDate = booking.endTimeMs ? new Date(booking.endTimeMs) : null;
    setModifyHeadcount(String(booking.headcount ?? ''));
    setModifyStartTime(formatTimeInput(startDate));
    setModifyEndTime(formatTimeInput(endDate));
    setModifyError('');
    setModifySuccess('');
  }, [booking]);

  const writeDecisionLog = async (status: 'confirmed' | 'cancelled') => {
    // Decision logs are written by the backend after token validation.
    void status;
  };

  const handleAdminDecision = async (decision: 'approve' | 'reject') => {
    if (!booking || !unit) return;
    if (isSubmittingAction) return;
    const traceId = createTraceId();
    const tokenPresence = logTokenPresence(adminToken);
    console.log(
      `[manage-action] start traceId=${traceId} token=${tokenPresence} action=${decision}`
    );
    if (!adminToken || isAdminTokenExpired(booking) || isAdminTokenUsed(booking)) {
      reportActionError(
        traceId,
        { action: decision },
        { error: new Error('invalid token') }
      );
      return;
    }
    if (!isAdminTokenValid) {
      reportActionError(
        traceId,
        { action: decision },
        { error: new Error('invalid token') }
      );
      return;
    }
    setIsProcessingAction(true);
    setActionError(null);
    setActionState('submitting');
    try {
      const nextStatus = decision === 'approve' ? 'confirmed' : 'cancelled';
      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/adminHandleReservationAction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unitId: unit.id,
            reservationId: booking.id,
            adminToken,
            action: decision,
          }),
        }
      );

      if (!response.ok) {
        reportActionError(
          traceId,
          { action: decision },
          { response }
        );
        return;
      }
      await writeDecisionLog(nextStatus);

      // !!! nincs FE email küldés, backend intézi !!!

      setBooking(prev =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              adminActionUsedAtMs: Date.now(),
              cancelledBy: nextStatus === 'cancelled' ? 'admin' : prev.cancelledBy,
            }
          : null
      );
      setActionMessage(
        decision === 'approve' ? t.reservationApproved : t.reservationRejected
      );
      setActionState('success');
      console.log(`[manage-action] success traceId=${traceId} action=${decision}`);
    } catch (actionErr) {
      console.error('Error handling admin decision:', actionErr);
      reportActionError(
        traceId,
        { action: decision },
        { error: actionErr }
      );
    } finally {
      setIsProcessingAction(false);
      setActionState((prev) => (prev === 'submitting' ? 'idle' : prev));
    }
  };

  const handleCancelReservation = async () => {
    if (!booking || !unit) return;
    if (isSubmittingAction) return;
    const traceId = createTraceId();
    const tokenPresence = logTokenPresence(manageToken);
    console.log(
      `[manage-action] start traceId=${traceId} token=${tokenPresence} action=cancel`
    );
    if (!manageToken) {
      reportActionError(
        traceId,
        { action: 'cancel' },
        { error: new Error('invalid link') }
      );
      return;
    }
    setIsCancelling(true);
    setCancelError('');
    setActionError(null);
    setActionState('submitting');
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
            reason: cancelReason.trim(),
          }),
        }
      );

      if (!response.ok) {
        reportActionError(
          traceId,
          { action: 'cancel' },
          { response }
        );
        return;
      }

      // !!! nincs FE email küldés, backend intézi !!!

      setBooking(prev =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              cancelReason: cancelReason.trim(),
              cancelledBy: 'guest',
            }
          : null
      );
      setIsCancelModalOpen(false);
      setCancelReason('');
      setActionState('success');
      console.log(`[manage-action] success traceId=${traceId} action=cancel`);
    } catch (err) {
      console.error('Error cancelling reservation:', err);
      reportActionError(
        traceId,
        { action: 'cancel' },
        { error: err }
      );
    } finally {
      setIsCancelling(false);
      setActionState((prev) => (prev === 'submitting' ? 'idle' : prev));
    }
  };

  const snapToQuarterHour = (date: Date) => {
    const roundedMinutes = Math.floor(date.getMinutes() / 15) * 15;
    const snapped = new Date(date);
    snapped.setMinutes(roundedMinutes, 0, 0);
    return snapped;
  };

  const handleModifyReservation = async () => {
    if (!booking || !unit) return;
    if (isSubmittingAction) return;
    const traceId = createTraceId();
    const tokenPresence = logTokenPresence(manageToken);
    console.log(
      `[manage-action] start traceId=${traceId} token=${tokenPresence} action=modify`
    );
    if (!manageToken) {
      reportActionError(
        traceId,
        { action: 'modify' },
        { error: new Error('invalid link') }
      );
      return;
    }
    setModifyError('');
    setModifySuccess('');
    setActionError(null);

    const nextHeadcount = Number(modifyHeadcount);
    if (!Number.isFinite(nextHeadcount)) {
      setModifyError(t.modifyInvalidHeadcount);
      return;
    }
    if (nextHeadcount < MIN_HEADCOUNT || nextHeadcount > MAX_HEADCOUNT) {
      setModifyError(
        t.modifyHeadcountRange.replace('{min}', String(MIN_HEADCOUNT)).replace(
          '{max}',
          String(MAX_HEADCOUNT)
        )
      );
      return;
    }
    if (!modifyStartTime || !modifyEndTime) {
      setModifyError(t.modifyMissingTime);
      return;
    }
    if (!booking.startTimeMs) {
      setModifyError(t.actionFailed);
      return;
    }
    const baseDate = new Date(booking.startTimeMs);
    const nextStart = snapToQuarterHour(
      mergeDateAndTime(baseDate, modifyStartTime)
    );
    const nextEnd = snapToQuarterHour(
      mergeDateAndTime(baseDate, modifyEndTime)
    );
    setModifyStartTime(formatTimeInput(nextStart));
    setModifyEndTime(formatTimeInput(nextEnd));
    if (nextEnd.getTime() <= nextStart.getTime()) {
      setModifyError(t.errorTime);
      return;
    }

    setActionState('submitting');
    setIsSavingModification(true);
    try {
      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/guestModifyReservation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unitId: unit.id,
            reservationId: booking.id,
            manageToken,
            headcount: nextHeadcount,
            startTimeMs: nextStart.getTime(),
            endTimeMs: nextEnd.getTime(),
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 409) {
          const payload = await response.json().catch(() => ({}));
          if (payload?.error === 'capacity_full') {
            setModifyError(t.errorCapacityFull);
            setActionState((prev) => (prev === 'submitting' ? 'idle' : prev));
            return;
          }
        }
        reportActionError(
          traceId,
          { action: 'modify' },
          { response }
        );
        return;
      }

      const payload = await response.json();
      setBooking(prev =>
        prev
          ? {
              ...prev,
              headcount: payload.headcount ?? nextHeadcount,
              startTimeMs: payload.startTimeMs ?? nextStart.getTime(),
              endTimeMs: payload.endTimeMs ?? nextEnd.getTime(),
            }
          : null
      );
      setModifySuccess(t.modifySuccess);
      setActionState('success');
      console.log(`[manage-action] success traceId=${traceId} action=modify`);
    } catch (err) {
      console.error('Error modifying reservation:', err);
      reportActionError(
        traceId,
        { action: 'modify' },
        { error: err }
      );
    } finally {
      setIsSavingModification(false);
      setActionState((prev) => (prev === 'submitting' ? 'idle' : prev));
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

  const getStartDate = () =>
    booking?.startTimeMs ? new Date(booking.startTimeMs) : null;
  const getEndDate = () =>
    booking?.endTimeMs ? new Date(booking.endTimeMs) : null;
  const getCancelledByLabel = () => {
    if (!booking?.cancelledBy) return '';
    const key = `cancelledBy_${booking.cancelledBy}`;
    return (t as any)[key] || booking.cancelledBy;
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
    <div className="flex flex-col gap-6 min-h-full" style={{ color: theme.colors.textPrimary }}>
      {actionError && (
        <div
          ref={actionErrorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="p-4 bg-red-100 text-red-800 font-semibold rounded-lg text-sm leading-relaxed break-words border border-red-200 shadow-sm flex flex-col gap-3"
        >
          <div>
            <p className="text-base font-bold">{actionError.userTitle}</p>
            <p className="mt-1">{actionError.userMessage}</p>
          </div>
          {actionError.debugId && (
            <p className="text-xs font-medium">
              {locale === 'hu' ? 'Hiba azonosító' : 'Error ID'}: {actionError.debugId}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setActionState('idle');
            }}
            className={`${baseButtonClasses.primary} ${theme.radiusClass} text-sm`}
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {locale === 'hu' ? 'Próbáld újra' : 'Try again'}
          </button>
        </div>
      )}
      <div
        className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pb-4 border-b"
        style={{ borderColor: `${theme.colors.surface}60` }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {t.reservationDetails}
        </h2>
        {getStatusChip(booking.status)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div
            className={`p-4 border ${theme.radiusClass}`}
            style={{
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.surface,
              color: theme.colors.textPrimary,
            }}
          >
            <div className="space-y-3">
              <p>
                <strong>{t.status}:</strong> <span className="ml-2">{getStatusChip(booking.status)}</span>
              </p>
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
                {getStartDate()
                  ? getStartDate()!.toLocaleDateString(locale, {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
              </p>
              <p>
                <strong>{t.startTime}:</strong>{' '}
                {getStartDate()
                  ? getStartDate()!.toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </p>
              <p>
                <strong>{t.endTime}:</strong>{' '}
                {getEndDate()
                  ? getEndDate()!.toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </p>
              <p>
                <strong>{t.email}:</strong> {booking.contact?.email}
              </p>
              <p>
                <strong>{t.phone}:</strong>{' '}
                {booking.contact?.phoneE164 ? maskPhone(booking.contact.phoneE164) : 'N/A'}
              </p>
              <p>
                <strong>{t.preferredTimeSlotLabel}:</strong>{' '}
                {booking.preferredTimeSlot || t.preferenceNotProvided}
              </p>
              <p>
                <strong>{t.seatingPreferenceLabel}:</strong>{' '}
                {booking.seatingPreference && booking.seatingPreference !== 'any'
                  ? ({
                      bar: t.seatingPreferenceBar,
                      table: t.seatingPreferenceTable,
                      outdoor: t.seatingPreferenceOutdoor,
                    } as Record<string, string>)[booking.seatingPreference] ||
                    t.preferenceNotProvided
                  : t.preferenceNotProvided}
              </p>
              {booking.cancelledBy && (
                <p>
                  <strong>{t.cancelledByLabel}:</strong> {getCancelledByLabel()}
                </p>
              )}
              {booking.cancelReason && (
                <p>
                  <strong>{t.cancelReasonLabel}:</strong> {booking.cancelReason}
                </p>
              )}
            </div>
          </div>

          {booking.status === 'pending' && (
            <div
              className={`p-4 ${theme.radiusClass} border`}
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

          {showAdminSection && (
            <div className="space-y-2">
              <div className="text-sm font-semibold" style={{ color: theme.colors.textPrimary }}>
                {t.adminActionsLabel}
              </div>
              <details
                className={`border ${theme.radiusClass} p-4`}
                style={{
                  backgroundColor: `${theme.colors.accent}08`,
                  color: theme.colors.textPrimary,
                  borderColor: `${theme.colors.accent}40`,
                }}
              >
                <summary
                  className="cursor-pointer font-semibold list-none"
                  style={{ color: theme.colors.textPrimary }}
                >
                  {t.adminActionTitle}
                </summary>
                <div className="mt-3 space-y-3">
                  {!isAdminActionAvailable && (
                    <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                      {t.invalidAdminToken}
                    </p>
                  )}
                  {isAdminActionAvailable && actionMessage && (
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
                  {isAdminActionAvailable && !actionMessage && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleAdminDecision('approve')}
                        className={`${baseButtonClasses.primary} flex-1`}
                        style={{ backgroundColor: theme.colors.primary }}
                        disabled={isProcessingAction || isSubmittingAction}
                      >
                        {t.adminApprove}
                      </button>
                      <button
                        onClick={() => handleAdminDecision('reject')}
                        className={`${baseButtonClasses.primary} flex-1`}
                        style={{ backgroundColor: theme.colors.danger }}
                        disabled={isProcessingAction || isSubmittingAction}
                      >
                        {t.adminReject}
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="text-sm font-semibold" style={{ color: theme.colors.textPrimary }}>
              {t.guestActionsLabel}
            </div>
            <div
              className={`p-4 border ${theme.radiusClass}`}
              style={{
                backgroundColor: theme.colors.background,
                borderColor: theme.colors.surface,
                color: theme.colors.textPrimary,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{t.modifySectionTitle}</h3>
                {isModifyLocked && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    {t.modifyLocked}
                  </span>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
                {t.modifySectionHint}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t.headcount}</label>
                  <input
                    type="number"
                    min={MIN_HEADCOUNT}
                    max={MAX_HEADCOUNT}
                    value={modifyHeadcount}
                    onChange={(event) => setModifyHeadcount(event.target.value)}
                    disabled={isModifyLocked || isSavingModification || isSubmittingAction}
                    className={`w-full p-3 border ${theme.radiusClass} focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surface,
                    }}
                  />
                  <p className="text-xs mt-1" style={{ color: theme.colors.textSecondary }}>
                    {t.modifyHeadcountHint
                      .replace('{min}', String(MIN_HEADCOUNT))
                      .replace('{max}', String(MAX_HEADCOUNT))}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.startTime}</label>
                  <input
                    type="time"
                    step={900}
                    min={settings?.bookableWindow?.from}
                    max={settings?.bookableWindow?.to}
                    value={modifyStartTime}
                    onChange={(event) => setModifyStartTime(event.target.value)}
                    disabled={isModifyLocked || isSavingModification || isSubmittingAction}
                    className={`w-full p-3 border ${theme.radiusClass} focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surface,
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t.endTime}</label>
                  <input
                    type="time"
                    step={900}
                    min={modifyStartTime || settings?.bookableWindow?.from}
                    max={settings?.bookableWindow?.to}
                    value={modifyEndTime}
                    onChange={(event) => setModifyEndTime(event.target.value)}
                    disabled={isModifyLocked || isSavingModification || isSubmittingAction}
                    className={`w-full p-3 border ${theme.radiusClass} focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surface,
                    }}
                  />
                </div>
              </div>
              {modifyError && (
                <p className="text-sm mt-3" style={{ color: theme.colors.danger }}>
                  {modifyError}
                </p>
              )}
              {modifySuccess && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm" style={{ color: theme.colors.primary }}>
                    {modifySuccess}
                  </p>
                  <p className="text-xs" style={{ color: theme.colors.textSecondary }}>
                    {t.modifyNextSteps}
                  </p>
                </div>
              )}
              <button
                onClick={handleModifyReservation}
                disabled={isModifyLocked || isSavingModification || isSubmittingAction}
                className={`${baseButtonClasses.primary} w-full mt-4`}
                style={{
                  backgroundColor: isModifyLocked ? theme.colors.surface : theme.colors.primary,
                  color: isModifyLocked ? theme.colors.textSecondary : '#fff',
                  opacity: isModifyLocked ? 0.6 : 1,
                }}
              >
                {isSavingModification ? t.modifySaving : t.modifySave}
              </button>
            </div>

            {booking.status !== 'cancelled' ? (
              <div
                className={`p-4 border ${theme.radiusClass}`}
                style={{
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                }}
              >
                <h3 className="text-lg font-semibold">{t.cancelReservation}</h3>
                <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
                  {t.cancelReservationHint}
                </p>
                {cancelError && (
                  <p className="text-sm mt-3" style={{ color: theme.colors.danger }}>
                    {cancelError}
                  </p>
                )}
                <button
                  onClick={() => setIsCancelModalOpen(true)}
                  className={`${baseButtonClasses.primary} w-full mt-4`}
                  style={{ backgroundColor: theme.colors.danger }}
                  disabled={isCancelling || isSubmittingAction}
                >
                  {isCancelling ? t.cancelling : t.cancelReservation}
                </button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-lg font-semibold" style={{ color: theme.colors.danger }}>
                  {t.reservationCancelledSuccess}
                </p>
                <p className="text-sm mt-2" style={{ color: theme.colors.textSecondary }}>
                  {t.cancelNextSteps}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const footerSection = undefined;

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
            <div className="mb-4 text-left">
              <label className="block text-sm font-medium mb-1">
                {t.cancelReasonLabel}
              </label>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className={`w-full p-3 border ${theme.radiusClass} focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
                style={{
                  backgroundColor: theme.colors.background,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.surface,
                }}
                rows={3}
                placeholder={t.cancelReasonPlaceholder}
                disabled={isCancelling || isSubmittingAction}
              />
            </div>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className={`${baseButtonClasses.secondary}`}
                style={{
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.surface,
                }}
                disabled={isCancelling || isSubmittingAction}
              >
                {t.noKeep}
              </button>
              <button
                onClick={handleCancelReservation}
                className={`${baseButtonClasses.primary}`}
                style={{ backgroundColor: theme.colors.danger }}
                disabled={isCancelling || isSubmittingAction}
              >
                {isCancelling ? t.cancelling : t.yesCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ManageReservationPage;
