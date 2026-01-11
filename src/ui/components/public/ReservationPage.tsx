import React, { useState, useEffect, useMemo } from 'react';
import {
  Unit,
  ReservationSetting,
  ReservationCapacity,
  ThemeSettings,
  GuestFormSettings,
  CustomSelectField,
} from '../../../core/models/data';
import { functions, db, Timestamp } from '../../../core/firebase/config';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import CalendarIcon from '../../../../components/icons/CalendarIcon';
import CopyIcon from '../../../../components/icons/CopyIcon';
import { translations } from '../../../lib/i18n';
import { suggestSeating } from '../../../core/services/seatingSuggestionService';
import {
  ReservationThemeTokens,
  buildReservationTheme,
  syncThemeCssVariables,
} from '../../../core/ui/reservationTheme';
import PublicReservationLayout from './PublicReservationLayout';

type Locale = 'hu' | 'en';

const PlayfulBubbles = () => (
  <>
    <div className="pointer-events-none absolute w-64 h-64 bg-white/40 blur-3xl rounded-full -top-10 -left-10" />
    <div className="pointer-events-none absolute w-52 h-52 bg-white/30 blur-2xl rounded-full top-20 right-10" />
    <div className="pointer-events-none absolute w-40 h-40 bg-white/25 blur-2xl rounded-full bottom-10 left-1/4" />
  </>
);

interface ReservationPageProps {
  unitId: string;
}

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DEFAULT_THEME: ThemeSettings = {
  primary: '#166534',
  surface: '#ffffff',
  background: '#f9fafb',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  accent: '#10b981',
  success: '#16a34a',
  danger: '#dc2626',
  radius: 'lg',
  elevation: 'mid',
  typographyScale: 'M',
  highlight: '#38bdf8',
  backgroundImageUrl: undefined,
  headerBrandMode: 'text',
  headerLogoMode: 'none',
  headerLogoUrl: undefined,
};

const DEFAULT_GUEST_FORM: GuestFormSettings = {
  customSelects: [],
};

const defaultReservationTheme = DEFAULT_THEME;

const inputTextStyle = { color: '#111827' as const };

const toRgba = (hex: string, alpha: number) => {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(parsed[1], 16);
  const g = parseInt(parsed[2], 16);
  const b = parseInt(parsed[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const resolveHeaderLogoUrl = (
  settings?: ReservationSetting | null,
  unit?: Unit | null
): string | null => {
  const mode =
    settings?.theme?.headerLogoMode || settings?.theme?.timeWindowLogoMode || 'none';

  if (mode === 'custom') {
    if (settings?.theme?.headerLogoUrl) return settings.theme.headerLogoUrl;
    if (settings?.theme?.timeWindowLogoUrl) return settings.theme.timeWindowLogoUrl;
  }

  if (mode === 'unit' && (unit?.logoUrl || unit?.logo)) {
    return (unit.logoUrl || unit.logo) ?? null;
  }

  return null;
};

const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  'https://europe-west3-mintleaf-74d27.cloudfunctions.net';

const ProgressIndicator: React.FC<{
  currentStep: number;
  t: typeof translations['hu'];
  theme: ReservationThemeTokens;
}> = ({ currentStep, t, theme }) => {
  const steps = [t.step1, t.step2, t.step3];
  return (
    <div
      className={`w-full max-w-2xl mx-auto flex items-center justify-center ${theme.styles.stepWrapper}`.trim()}
    >
      <div className="relative">
        <div className="absolute inset-x-4 top-5 md:top-6" aria-hidden>
          <div className="grid grid-cols-2 gap-4 items-center">
            {[0, 1].map((segment) => {
              const segmentActive = currentStep > segment + 1;
              return (
                <div
                  key={`segment-${segment}`}
                  className="h-1 rounded-full w-full transition-colors duration-300"
                  style={{
                    backgroundColor: segmentActive
                      ? theme.colors.primary
                      : theme.colors.surface,
                    boxShadow: segmentActive
                      ? `0 0 0 1px ${theme.colors.primary}`
                      : `0 0 0 1px ${theme.colors.surface}`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-3 items-center gap-4 relative">
          {steps.map((label, index) => {
            const stepNumber = index + 1;
            const isCompleted = currentStep > stepNumber;
            const isActive = currentStep === stepNumber;
            return (
              <div
                key={stepNumber}
                className="flex flex-col items-center text-center gap-2"
              >
                <div
                  className={`w-10 h-10 flex items-center justify-center font-bold transition-all duration-300 ${
                    isCompleted
                      ? theme.styles.stepActive
                      : isActive
                      ? theme.styles.stepActive
                      : theme.styles.stepInactive
                  } ${theme.radiusClass}`}
                  style={{
                    backgroundColor: isCompleted
                      ? theme.colors.primary
                      : theme.colors.surface,
                    color: isCompleted
                      ? '#fff'
                      : isActive
                      ? theme.colors.primary
                      : theme.colors.textSecondary,
                    borderColor: isActive
                      ? theme.colors.primary
                      : theme.colors.surface,
                    boxShadow: isActive
                      ? `0 10px 30px ${toRgba(theme.colors.primary, 0.18)}`
                      : undefined,
                  }}
                >
                  {isCompleted ? '✓' : stepNumber}
                </div>
                <p
                  className={`text-sm font-semibold transition-colors leading-tight ${theme.fontFamilyClass}`}
                  style={{
                    color: isActive
                      ? theme.colors.textPrimary
                      : theme.colors.textSecondary,
                  }}
                >
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const buildPublicUnit = (
  unitId: string,
  settings: ReservationSetting | null
): Unit => {
  const settingsAny = settings as Record<string, any> | null;
  const name =
    settingsAny?.publicName ||
    settingsAny?.unitName ||
    settingsAny?.brandName ||
    unitId ||
    'MintLeaf';
  const logoUrl =
    settings?.theme?.headerLogoUrl || settings?.theme?.timeWindowLogoUrl;

  return {
    id: unitId,
    name,
    logoUrl,
  };
};

type SeatingPreference = 'any' | 'bar' | 'table' | 'outdoor';

const ReservationPage: React.FC<ReservationPageProps> = ({ unitId }) => {
  const [step, setStep] = useState(1);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locale, setLocale] = useState<Locale>('hu');
  const debugSeating =
    process.env.NODE_ENV !== 'production' ||
    (typeof window !== 'undefined' &&
      window.localStorage.getItem('mintleaf_debug_seating') === '1');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    headcount: '2',
    startTime: '',
    endTime: '',
    phone: '',
    email: '',
    preferredTimeSlot: null as string | null,
    seatingPreference: 'any' as SeatingPreference,
    customData: {} as Record<string, string>,
  });
  const [submittedData, setSubmittedData] = useState<any>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dailyHeadcounts, setDailyHeadcounts] = useState<Map<string, number>>(
    new Map()
  );
  const [capacityByDate, setCapacityByDate] = useState<
    Map<string, ReservationCapacity>
  >(new Map());

  const theme = useMemo(
    () => buildReservationTheme(settings?.theme || defaultReservationTheme, settings?.uiTheme),
    [settings]
  );

  const isMinimalGlassTheme = settings?.theme?.id === 'minimal_glass';

  useEffect(() => {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'en') {
      setLocale('en');
    }
  }, []);

  useEffect(() => {
    if (!unitId) {
      setError('Hiányzik az egység azonosítója.');
      setLoading(false);
      return;
    }
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'reservation_settings', unitId);
        const docSnap = await getDoc(docRef);
        const defaultSettings: ReservationSetting = {
          id: unitId,
          blackoutDates: [],
          bookableWindow: { from: '11:00', to: '23:00' },
          kitchenStartTime: null,
          kitchenEndTime: null,
          barStartTime: null,
          barEndTime: null,
          guestForm: DEFAULT_GUEST_FORM,
          theme: DEFAULT_THEME,
          uiTheme: 'minimal_glass',
          reservationMode: 'request',
          notificationEmails: [],
        };
        if (docSnap.exists()) {
          const dbData = docSnap.data() as any;
          const finalSettings: ReservationSetting = {
            ...defaultSettings,
            ...dbData,
            guestForm: {
              ...DEFAULT_GUEST_FORM,
              ...(dbData.guestForm || {}),
            },
            theme: {
              ...DEFAULT_THEME,
              ...(dbData.theme || {}),
            },
          };
          setSettings(finalSettings);
          const publicUnit = buildPublicUnit(unitId, finalSettings);
          setUnit(publicUnit);
          document.title = `Foglalás - ${publicUnit.name}`;
        } else {
          setSettings(defaultSettings);
          const publicUnit = buildPublicUnit(unitId, defaultSettings);
          setUnit(publicUnit);
          document.title = `Foglalás - ${publicUnit.name}`;
        }
      } catch (err) {
        console.error('Error fetching reservation settings:', err);
        setError('Hiba a foglalási beállítások betöltésekor.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [unitId]);

  useEffect(() => {
    if (!unitId || !settings) {
      setDailyHeadcounts(new Map());
      setCapacityByDate(new Map());
      return;
    }

    const fetchHeadcounts = async () => {
      const startOfMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth(),
        1
      );
      const endOfMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0,
        23,
        59,
        59
      );

      const startKey = toDateKey(startOfMonth);
      const endKey = toDateKey(endOfMonth);
      const q = query(
        collection(db, 'units', unitId, 'reservation_capacity'),
        where('date', '>=', startKey),
        where('date', '<=', endKey),
        orderBy('date')
      );

      try {
        const querySnapshot = await getDocs(q);
        const headcounts = new Map<string, number>();
        const capacityMap = new Map<string, ReservationCapacity>();
        querySnapshot.docs.forEach((docSnap) => {
          const capacity = docSnap.data() as ReservationCapacity;
          const dateKey = capacity.date || docSnap.id;
          const baseCount =
            typeof capacity.totalCount === 'number'
              ? capacity.totalCount
              : capacity.count || 0;
          const currentCount = headcounts.get(dateKey) || 0;
          headcounts.set(dateKey, currentCount + baseCount);
          capacityMap.set(dateKey, {
            date: dateKey,
            ...capacity,
            count: capacity.count ?? baseCount,
            totalCount: capacity.totalCount ?? baseCount,
          });
        });
        setDailyHeadcounts(headcounts);
        setCapacityByDate(capacityMap);
      } catch (err) {
        console.error('Error fetching headcounts:', err);
      }
    };

    fetchHeadcounts();
  }, [unitId, currentMonth, settings]);

  useEffect(() => {
    syncThemeCssVariables(theme);
  }, [theme]);

  const resetFlow = () => {
    setSelectedDate(null);
    setFormData({
      name: '',
      headcount: '2',
      startTime: '',
      endTime: '',
      phone: '',
      email: '',
      preferredTimeSlot: null,
      seatingPreference: 'any',
      customData: {},
    });
    setSubmittedData(null);
    setStep(1);
  };

  const handleDateSelect = (day: Date) => {
    setSelectedDate(day);
    setStep(2);
  };

  const normalizePhone = (phone: string): string => {
    let cleaned = phone.replace(/[\s-()]/g, '');
    if (cleaned.startsWith('00')) cleaned = '+' + cleaned.substring(2);
    else if (cleaned.startsWith('06')) cleaned = '+36' + cleaned.substring(2);
    else if (!cleaned.startsWith('+')) cleaned = '+36' + cleaned;
    return cleaned;
  };

  const t = translations[locale];

  const ReservationFooter: React.FC<{
    step: number;
    themeProps: any;
    t: any;
    onNext: (e: React.FormEvent<HTMLFormElement>) => void;
    onPrevious: () => void;
    isSubmitting: boolean;
    locale: Locale;
    settings: ReservationSetting | null;
    selectedDate: Date | null;
    formData: any;
    onLocaleChange: (locale: Locale) => void;
  }> = () => null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !formData.startTime || !unit || !settings) return;

    setIsSubmitting(true);
    setError('');

    let startDateTime: Date;
    let endDateTime: Date;
    try {
      const requestedStartTime = formData.startTime;
      const { from: bookingStart, to: bookingEnd } = settings.bookableWindow || {
        from: '00:00',
        to: '23:59',
      };
      if (requestedStartTime < bookingStart || requestedStartTime > bookingEnd) {
        throw new Error(
          t.errorTimeWindow
            .replace('{start}', bookingStart)
            .replace('{end}', bookingEnd)
        );
      }

      startDateTime = new Date(
        `${toDateKey(selectedDate)}T${formData.startTime}`
      );
      endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);
      if (formData.endTime) {
        const potentialEndDateTime = new Date(
          `${toDateKey(selectedDate)}T${formData.endTime}`
        );
        if (potentialEndDateTime > startDateTime)
          endDateTime = potentialEndDateTime;
      }

      const reservationStatus: 'confirmed' | 'pending' =
        settings?.reservationMode === 'auto' ? 'confirmed' : 'pending';

      const baseReservation = {
        unitId,
        name: formData.name,
        headcount: parseInt(formData.headcount, 10),
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        contact: {
          phoneE164: normalizePhone(formData.phone),
          email: formData.email.trim().toLowerCase(),
        },
        locale,
        status: reservationStatus,
        reservationMode: settings.reservationMode,
        occasion: formData.customData['occasion'] || '',
        source: formData.customData['heardFrom'] || '',
        preferredTimeSlot: formData.preferredTimeSlot,
        seatingPreference: formData.seatingPreference,
        customData: {
          ...formData.customData,
          preferredTimeSlot: formData.preferredTimeSlot ?? '',
          seatingPreference: formData.seatingPreference,
        },
      };
      const dateKey = toDateKey(selectedDate);

      const response = await fetch(
        `${FUNCTIONS_BASE_URL}/guestCreateReservation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unitId,
            dateKey,
            reservation: {
              ...baseReservation,
              startTime: startDateTime.toISOString(),
              endTime: endDateTime.toISOString(),
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('DAILY_LIMIT_REACHED');
        }
        throw new Error(t.genericError);
      }

      const payload = await response.json();
      const referenceCode = payload.bookingId || payload.id;
      const manageToken = payload.manageToken as string | undefined;
      setSubmittedData({
        ...baseReservation,
        referenceCode,
        manageToken,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: Timestamp.fromDate(endDateTime),
        date: selectedDate,
        capacityByDate,
      });
      setStep(3);

      try {
        const suggestion = await suggestSeating({
          unitId,
          startTime: startDateTime,
          endTime: endDateTime,
          headcount: baseReservation.headcount,
          bookingId: referenceCode,
        });
        const callable = httpsCallable(functions, 'logAllocationDecisionForBooking');
        await callable({
          unitId,
          bookingId: referenceCode,
          startTimeISO: startDateTime.toISOString(),
          endTimeISO: endDateTime.toISOString(),
          partySize: baseReservation.headcount,
          zoneId: suggestion.zoneId ?? null,
          tableIds: suggestion.tableIds,
          reason: suggestion.reason ?? 'NO_FIT',
          allocationMode: suggestion.allocationMode ?? 'capacity',
          allocationStrategy: suggestion.allocationStrategy ?? 'bestFit',
          snapshot: suggestion.snapshot ?? null,
          algoVersion: 'alloc-v1',
        });
      } catch (error) {
        if (debugSeating) {
          const err = error as { code?: string; message?: string; details?: unknown } | null;
          console.warn('[reservation] Failed to log allocation decision', {
            error,
            code: err?.code,
            message: err?.message,
            details: err?.details,
          });
        }
      }

      // !!! FRONTEND NEM KÜLD EMAILT !!!
      // A backend (onReservationCreated / onReservationStatusChange) intézi.
    } catch (err: unknown) {
      console.error('Error during reservation submission:', err);
      if (err instanceof Error) {
        if (err.message === 'DAILY_LIMIT_REACHED') {
          setError(t.errorDailyLimitReached);
        } else {
          setError(err.message);
        }
      } else {
        setError(t.genericError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const themeClassProps = useMemo(
    () => ({
      radiusClass: theme.radiusClass,
      shadowClass: theme.shadowClass,
      fontFamily: theme.fontFamilyClass,
      fontSize: theme.fontSizeClass,
      colors: theme.colors,
      infoPanelClass: theme.styles.infoPanel,
      uiTheme: theme.uiTheme,
    }),
    [theme]
  );

  const headerBrandMode = settings?.theme?.headerBrandMode || 'text';
  const brandLogoUrl = useMemo(() => {
    if (headerBrandMode !== 'logo') return null;
    return resolveHeaderLogoUrl(settings, unit);
  }, [headerBrandMode, settings, unit]);

  const baseButtonClasses = useMemo(
    () => ({
      primaryButton: theme.styles.primaryButton,
      secondaryButton: theme.styles.secondaryButton,
      outlineButton: theme.styles.outlineButton,
    }),
    [theme.styles.outlineButton, theme.styles.primaryButton, theme.styles.secondaryButton]
  );

  const decorations = theme.uiTheme === 'playful_bubble' ? <PlayfulBubbles /> : undefined;
  const watermarkText = `${(unit?.name || 'MintLeaf')} reservation system, powered by MintLeaf.`;
  const topRightLanguageSwitch = (
    <>
      <button
        onClick={() => setLocale('hu')}
        className={locale === 'hu' ? 'font-bold' : ''}
        style={{
          color: locale === 'hu' ? theme.colors.primary : theme.colors.textSecondary,
        }}
      >
        Magyar
      </button>
      <span style={{ color: theme.colors.textSecondary }}>|</span>
      <button
        onClick={() => setLocale('en')}
        className={locale === 'en' ? 'font-bold' : ''}
        style={{
          color: locale === 'en' ? theme.colors.primary : theme.colors.textSecondary,
        }}
      >
        English
      </button>
    </>
  );

  const baseLayoutProps = {
    theme,
    isMinimalGlassTheme,
    decorations,
    watermarkText,
  };

  if (error && step !== 2) {
    return (
      <PublicReservationLayout
        {...baseLayoutProps}
        header={
          <h2
            className={`text-xl font-bold ${
              isMinimalGlassTheme ? 'text-[var(--color-text-primary)]' : ''
            }`}
            style={{ color: 'var(--color-danger)' }}
          >
            Hiba
          </h2>
        }
        body={
          <p
            className={`mt-2 ${
              isMinimalGlassTheme ? 'text-[var(--color-text-secondary)]' : ''
            }`}
          >
            {error}
          </p>
        }
      />
    );
  }

  if (loading || !unit || !settings) {
    return (
      <PublicReservationLayout
        {...baseLayoutProps}
        header={<LoadingSpinner />}
        body={<div />}
      />
    );
  }

  const headerSection = (
    <>
      {brandLogoUrl ? (
        <img
          src={brandLogoUrl}
          alt={unit.name}
          className="max-h-16 md:max-h-20 max-w-[70%] object-contain"
        />
      ) : (
        <h1
          className={`text-4xl font-bold ${
            isMinimalGlassTheme ? 'text-[var(--color-text-primary)]' : ''
          }`}
          style={{ color: 'var(--color-text-primary)' }}
        >
          {unit.name}
        </h1>
      )}
      <p
        className={`text-lg mt-1 ${
          isMinimalGlassTheme ? 'text-[var(--color-text-secondary)]' : ''
        }`}
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {t.title}
      </p>
      <div className="w-full flex-shrink-0">
        <ProgressIndicator currentStep={step} t={t} theme={theme} />
      </div>
    </>
  );

  const stepPaneBase = 'w-full flex-shrink-0 flex flex-col min-h-0 transition-opacity duration-300';

  const bodySection = (
    <div className="flex flex-col gap-4 min-h-full">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-in-out w-full"
          style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
        >
          <div
            className={`${stepPaneBase} ${
              step === 1 ? 'opacity-100' : 'opacity-50 md:opacity-70'
            }`}
          >
            <div className="flex-1 min-h-0">
              <Step1Date
                settings={settings}
                onDateSelect={handleDateSelect}
                themeProps={themeClassProps}
                t={t}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                dailyHeadcounts={dailyHeadcounts}
              />
            </div>
          </div>
          <div
            className={`${stepPaneBase} ${
              step === 2 ? 'opacity-100' : 'opacity-50 md:opacity-70'
            }`}
          >
            <div className="flex-1 min-h-0">
              <Step2Details
                selectedDate={selectedDate}
                formData={formData}
                setFormData={setFormData}
                onBack={() => {
                  setStep(1);
                  setError('');
                }}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                settings={settings}
                themeProps={themeClassProps}
                t={t}
                locale={locale}
                error={error}
                buttonClasses={{
                  primary: `${baseButtonClasses.primaryButton} ${themeClassProps.radiusClass}`,
                  secondary: `${baseButtonClasses.secondaryButton} ${themeClassProps.radiusClass}`,
                }}
                unit={unit}
              />
            </div>
          </div>
          <div
            className={`${stepPaneBase} ${
              step === 3 ? 'opacity-100' : 'opacity-50 md:opacity-70'
            }`}
          >
            <div className="flex-1 min-h-0">
              <Step3Confirmation
                onReset={resetFlow}
                theme={theme}
                themeProps={themeClassProps}
                t={t}
                submittedData={submittedData}
                unit={unit}
                locale={locale}
                settings={settings}
                buttonClasses={{
                  primary: `${baseButtonClasses.primaryButton} ${themeClassProps.radiusClass}`,
                  secondary: `${baseButtonClasses.secondaryButton} ${themeClassProps.radiusClass}`,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const footerSection = (
    <ReservationFooter
      step={step}
      themeProps={themeClassProps}
      t={t}
      onNext={handleSubmit}
      onPrevious={() => setStep(prev => Math.max(1, prev - 1))}
      isSubmitting={isSubmitting}
      locale={locale}
      settings={settings}
      selectedDate={selectedDate}
      formData={formData}
      onLocaleChange={setLocale}
    />
  );

  return (
    <PublicReservationLayout
      {...baseLayoutProps}
      header={headerSection}
      body={bodySection}
      footer={footerSection}
      topRightContent={topRightLanguageSwitch}
    />
  );
};

const Step1Date: React.FC<{
  settings: ReservationSetting;
  onDateSelect: (date: Date) => void;
  themeProps: any;
  t: any;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  dailyHeadcounts: Map<string, number>;
}> = ({
  settings,
  onDateSelect,
  themeProps,
  t,
  currentMonth,
  onMonthChange,
  dailyHeadcounts,
}) => {
  const startOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  );
  const endOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  );
  const days: (Date | null)[] = [];
  const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;

  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let i = 1; i <= endOfMonth.getDate(); i++) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
  }

  const blackoutSet = new Set(settings.blackoutDates || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div
      className={`p-6 ${themeProps.radiusClass} ${themeProps.shadowClass}`}
      style={{
        backgroundColor: themeProps.colors.surface,
        color: themeProps.colors.textPrimary,
        border: `1px solid ${themeProps.colors.surface}`,
      }}
    >
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3 text-center">
        {t.step1Title}
      </h2>
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
            )
          }
          className={`p-2 ${themeProps.radiusClass} transition-colors`}
          style={{
            backgroundColor: themeProps.colors.surface,
            color: themeProps.colors.textPrimary,
          }}
        >
          &lt;
        </button>
        <h3 className="font-bold text-lg">
          {t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            )
          }
          className={`p-2 ${themeProps.radiusClass} transition-colors`}
          style={{
            backgroundColor: themeProps.colors.surface,
            color: themeProps.colors.textPrimary,
          }}
        >
          &gt;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[var(--color-text-secondary)] text-sm mb-2">
        {t.dayNames.map((d: string) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`}></div>;
          const dateKey = toDateKey(day);

          const isBlackout = blackoutSet.has(dateKey);
          const isPast = day < today;
          let isFull = false;
          if (settings.dailyCapacity && settings.dailyCapacity > 0) {
            const currentHeadcount = dailyHeadcounts.get(dateKey) || 0;
            isFull = currentHeadcount >= settings.dailyCapacity;
          }
          const isDisabled = isBlackout || isPast || isFull;

          let buttonClass = `w-full p-1 h-12 flex items-center justify-center text-sm ${themeProps.radiusClass} transition-colors`;
          let titleText = '';

          if (isDisabled) {
            if (isFull) {
              buttonClass += ' line-through cursor-not-allowed';
              titleText = t.errorCapacityFull;
            } else {
              buttonClass += ' cursor-not-allowed opacity-50';
            }
          } else {
            buttonClass += ' hover:opacity-90';
          }

          return (
            <div key={dateKey}>
              <button
                type="button"
                onClick={() => onDateSelect(day)}
                disabled={isDisabled}
                title={titleText}
                className={buttonClass}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface Step2DetailsProps {
  selectedDate: Date | null;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onBack: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  settings: ReservationSetting;
  themeProps: any;
  t: any;
  locale: Locale;
  error: string;
  buttonClasses: { primary: string; secondary: string };
  unit: Unit;
}

const Step2Details: React.FC<Step2DetailsProps> = ({
  selectedDate,
  formData,
  setFormData,
  onBack,
  onSubmit,
  isSubmitting,
  settings,
  themeProps,
  t,
  locale,
  error,
  buttonClasses,
  unit,
}) => {
  const [formErrors, setFormErrors] = useState({
    name: '',
    phone: '',
    email: '',
  });

  const timeSlotOptions = [
    '11:00-13:00',
    '13:00-15:00',
    '15:00-17:00',
    '17:00-19:00',
    '19:00-21:00',
    '21:00-23:00',
  ];

  const validateField = (name: string, value: string) => {
    if (!value.trim()) return t.errorRequired;
    if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return t.errorInvalidEmail;
    if (name === 'phone' && !/^\+?[0-9\s-()]{7,}$/.test(value))
      return t.errorInvalidPhone;
    return '';
  };

  const handleStandardChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
    if (['name', 'phone', 'email'].includes(name)) {
      setFormErrors((prev: any) => ({
        ...prev,
        [name]: validateField(name, value),
      }));
    }
  };

  const handleCustomFieldChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      customData: { ...prev.customData, [name]: value },
    }));
  };

  const handleTimeSlotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      preferredTimeSlot: value ? value : null,
    }));
  };

  const isFormValid = useMemo(() => {
    return (
      formData.name &&
      formData.phone &&
      formData.email &&
      formData.startTime &&
      !validateField('name', formData.name) &&
      !validateField('phone', formData.phone) &&
      !validateField('email', formData.email)
    );
  }, [formData, t]);

  if (!selectedDate) return null;

  const bookingWindowText = settings.bookableWindow
    ? `${settings.bookableWindow.from} – ${settings.bookableWindow.to}`
    : null;

  const secondaryButtonClass =
    buttonClasses?.secondary ||
    `font-bold py-2 px-4 ${themeProps.radiusClass} ${themeProps.shadowClass}`;
  const primaryButtonClass =
    buttonClasses?.primary ||
    `font-bold py-2 px-6 ${themeProps.radiusClass} ${themeProps.shadowClass} disabled:opacity-50 disabled:cursor-not-allowed text-lg`;

  const surfaceFill =
    themeProps.uiTheme === 'minimal_glass'
      ? toRgba(themeProps.colors.surface, 0.68)
      : themeProps.colors.surface;
  const surfaceBorder =
    themeProps.uiTheme === 'minimal_glass'
      ? toRgba(themeProps.colors.surface, 0.78)
      : themeProps.colors.surface;

  const hasTimeWindowInfo =
    bookingWindowText || settings.kitchenStartTime || settings.barStartTime;

  return (
    <div
      className={`p-6 ${themeProps.radiusClass} ${themeProps.shadowClass}`}
      style={{
        backgroundColor: surfaceFill,
        color: themeProps.colors.textPrimary,
        border: `1px solid ${surfaceBorder}`,
      }}
    >
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3">
        {t.step2Title}
      </h2>
      {error && (
        <div className="p-3 mb-4 bg-red-100 text-red-800 font-semibold rounded-lg text-sm leading-relaxed break-words border border-red-200 shadow-sm">
          {error}
        </div>
      )}
      {hasTimeWindowInfo && (
        <div
          className={`${themeProps.infoPanelClass} mb-4 text-center space-y-3`}
          style={{ color: themeProps.colors.textPrimary }}
        >
          {bookingWindowText && (
            <div className="space-y-1">
              <div className="font-semibold">{t.bookableWindowLabel}</div>
              <div className="font-medium italic">{bookingWindowText}</div>
              <div className="text-xs" style={{ color: themeProps.colors.textSecondary }}>
                {t.bookableWindowHint}
              </div>
            </div>
          )}
          {settings.kitchenStartTime && (
            <div className="space-y-1">
              <div className="font-semibold">{t.kitchenHours}</div>
              <div className="font-medium italic">
                {settings.kitchenStartTime} – {settings.kitchenEndTime || t.untilClose}
              </div>
            </div>
          )}
          {settings.barStartTime && (
            <div className="space-y-1">
              <div className="font-semibold">{t.barHours}</div>
              <div className="font-medium italic">
                {settings.barStartTime} – {settings.barEndTime || t.untilClose}
              </div>
            </div>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-5">
          <input
            type="text"
            readOnly
            value={selectedDate.toLocaleDateString(locale, {
              weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          className={`w-full p-3 border ${themeProps.radiusClass} text-center font-semibold placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
            style={{
              ...inputTextStyle,
              backgroundColor: themeProps.colors.surface,
              borderColor: themeProps.colors.surface,
            }}
          />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-1">{t.name}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              required
            />
            {formErrors.name && (
              <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              required
            />
            {formErrors.phone && (
              <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.headcount}</label>
            <input
              type="number"
              name="headcount"
              value={formData.headcount}
              onChange={handleStandardChange}
              min="1"
                className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
                className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              required
            />
            {formErrors.email && (
              <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-1">{t.startTime}</label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleStandardChange}
                className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              required
              min={settings.bookableWindow?.from}
              max={settings.bookableWindow?.to}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.endTime}</label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleStandardChange}
                className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
              min={formData.startTime}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-1">{t.preferredTimeSlotLabel}</label>
            <select
              name="preferredTimeSlot"
              value={formData.preferredTimeSlot || ''}
              onChange={handleTimeSlotChange}
              className={`${themeProps.radiusClass} w-full p-3 border placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]`}
              style={inputTextStyle}
            >
              <option value="">{t.preferenceNotProvided}</option>
              {timeSlotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t.seatingPreferenceLabel}</label>
            <div
              className={`grid grid-cols-2 gap-2 ${themeProps.radiusClass}`}
              role="radiogroup"
              aria-label={t.seatingPreferenceLabel}
            >
              {[
                { value: 'any', label: t.seatingPreferenceAny },
                { value: 'bar', label: t.seatingPreferenceBar },
                { value: 'table', label: t.seatingPreferenceTable },
                { value: 'outdoor', label: t.seatingPreferenceOutdoor },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center justify-center px-3 py-2 border text-sm font-medium cursor-pointer transition-colors ${themeProps.radiusClass} ${
                    formData.seatingPreference === option.value
                      ? 'bg-[var(--color-primary)] text-white border-transparent'
                      : ''
                  }`}
                  aria-checked={formData.seatingPreference === option.value}
                  role="radio"
                  style={{
                    borderColor:
                      formData.seatingPreference === option.value
                        ? 'transparent'
                        : themeProps.colors.surface,
                    backgroundColor:
                      formData.seatingPreference === option.value
                        ? 'var(--color-primary)'
                        : themeProps.colors.surface,
                    color:
                      formData.seatingPreference === option.value
                        ? '#fff'
                        : themeProps.colors.textPrimary,
                  }}
                >
                  <input
                    type="radio"
                    name="seatingPreference"
                    value={option.value}
                    checked={formData.seatingPreference === option.value}
                    onChange={handleStandardChange}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id}>
            <label className="block text-sm font-medium mb-1">{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className="w-full p-3 border rounded-lg bg-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              style={inputTextStyle}
              required
            >
              <option value="" disabled>
                Válassz...
              </option>
              {field.options.map((o: string) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="flex justify-between items-center pt-4">
          <button
            type="button"
            onClick={onBack}
            className={secondaryButtonClass}
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className={primaryButtonClass}
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {isSubmitting ? t.submitting : t.next}
          </button>
        </div>
      </form>
    </div>
  );
};

interface Step3ConfirmationProps {
  onReset: () => void;
  theme: ReservationThemeTokens;
  themeProps: any;
  t: any;
  submittedData: any;
  unit: Unit;
  locale: Locale;
  settings: ReservationSetting;
  buttonClasses: { primary: string; secondary: string };
}

const Step3Confirmation: React.FC<Step3ConfirmationProps> = ({
  onReset,
  theme,
  themeProps,
  t,
  submittedData,
  unit,
  locale,
  settings,
  buttonClasses,
}) => {
  const [copied, setCopied] = useState(false);

  const { googleLink, icsLink, manageLink } = useMemo(() => {
    if (!submittedData)
      return { googleLink: '#', icsLink: '#', manageLink: '#' };

    const { startTime, endTime, name, referenceCode, manageToken } = submittedData;
    const startDate = startTime.toDate();
    const endDate = endTime.toDate();

    const formatDate = (date: Date) =>
      date.toISOString().replace(/-|:|\.\d\d\d/g, '');

    const gCalParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${unit.name} - ${t.title}`,
      dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
      details: `${t.name}: ${name}\n${t.referenceCode}: ${referenceCode}`,
      location: unit.name,
    });
    const gLink = `https://www.google.com/calendar/render?${gCalParams.toString()}`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${unit.name} - ${t.title}`,
      `DESCRIPTION:${t.name}: ${name}\\n${t.referenceCode}: ${referenceCode}`,
      `LOCATION:${unit.name}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const iLink = `data:text/calendar;charset=utf8,${encodeURIComponent(
      icsContent
    )}`;

    if (!manageToken) {
      return { googleLink: gLink, icsLink: iLink, manageLink: '#' };
    }

    const mLinkParams = new URLSearchParams({
      reservationId: referenceCode,
      unitId: unit.id,
      token: manageToken,
    });
    const mLink = `${window.location.origin}/manage?${mLinkParams.toString()}`;

    return { googleLink: gLink, icsLink: iLink, manageLink: mLink };
  }, [submittedData, unit.name, t]);

  const handleCopy = () => {
    if (manageLink === '#') return;
    navigator.clipboard.writeText(manageLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskPhone = (phoneE164: string): string => {
    if (!phoneE164 || phoneE164.length < 10) return phoneE164;
    const last4 = phoneE164.slice(-4);
    return phoneE164.slice(0, -7) + '••• •' + last4;
  };

  const isAutoConfirm = settings.reservationMode === 'auto';
  const titleText = isAutoConfirm ? t.step3TitleConfirmed : t.step3Title;
  const bodyText = isAutoConfirm ? t.step3BodyConfirmed : t.step3Body;
  const primaryButtonClass =
    buttonClasses?.primary ||
    `text-white font-bold py-3 px-6 ${themeProps.radiusClass}`;

  const confirmationSurface =
    themeProps.uiTheme === 'minimal_glass'
      ? toRgba(themeProps.colors.surface, 0.9)
      : themeProps.colors.surface;

  return (
    <div
      className={`p-8 md:p-10 ${themeProps.radiusClass} ${themeProps.shadowClass} text-center space-y-5`}
      style={{
        backgroundColor: confirmationSurface,
        color: themeProps.colors.textPrimary,
        border: `1px solid ${themeProps.colors.surface}`,
      }}
    >
      <h2 className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>
        {titleText}
      </h2>
      <p className="text-[var(--color-text-primary)] mt-4">{bodyText}</p>
      <p className="text-sm mt-2" style={{ color: themeProps.colors.textSecondary }}>
        {t.emailConfirmationSent}
      </p>

      {submittedData && (
        <div
          className="mt-6 text-left p-4 md:p-5 border rounded-xl shadow-sm space-y-2"
          style={{
            backgroundColor: confirmationSurface,
            color: themeProps.colors.textPrimary,
            borderColor: themeProps.colors.surface,
          }}
        >
          <h3 className="font-bold text-center mb-3 text-lg">{t.step3Details}</h3>
          <p>
            <strong>{t.referenceCode}:</strong>{' '}
            <span
              className={`font-mono px-2 py-1 ${themeProps.radiusClass}`}
              style={{
                backgroundColor: themeProps.colors.surface,
                color: themeProps.colors.textPrimary,
              }}
            >
              {submittedData.referenceCode.substring(0, 8).toUpperCase()}
            </span>
          </p>
          <p>
            <strong>{t.name}:</strong> {submittedData.name}
          </p>
          <p>
            <strong>{t.headcount}:</strong> {submittedData.headcount}
          </p>
          <p>
            <strong>{t.date}:</strong>{' '}
            {submittedData.date.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <p>
            <strong>{t.startTime}:</strong>{' '}
            {submittedData.startTime
              .toDate()
              .toLocaleTimeString(locale, {
                hour: '2-digit',
                minute: '2-digit',
              })}
          </p>
          <p>
            <strong>{t.email}:</strong> {submittedData.contact.email}
          </p>
          <p>
            <strong>{t.phone}:</strong>{' '}
            {submittedData.contact?.phoneE164
              ? maskPhone(submittedData.contact.phoneE164)
              : 'N/A'}
          </p>
          <p>
            <strong>{t.preferredTimeSlotLabel}:</strong>{' '}
            {submittedData.preferredTimeSlot || t.preferenceNotProvided}
          </p>
          <p>
            <strong>{t.seatingPreferenceLabel}:</strong>{' '}
            {submittedData.seatingPreference && submittedData.seatingPreference !== 'any'
              ? ({
                  bar: t.seatingPreferenceBar,
                  table: t.seatingPreferenceTable,
                  outdoor: t.seatingPreferenceOutdoor,
                } as Record<string, string>)[submittedData.seatingPreference] || t.preferenceNotProvided
              : t.preferenceNotProvided}
          </p>
          {Object.entries(submittedData.customData || {}).map(([key, value]) => {
            const field = settings.guestForm?.customSelects?.find(
              (f) => f.id === key
            );
            if (!field || !value) return null;
            return (
              <p key={key}>
                <strong>{field.label}:</strong> {value as string}
              </p>
            );
          })}
        </div>
      )}

      <div
        className="mt-6 text-left p-4 md:p-5 rounded-lg border shadow-sm space-y-2"
        style={{
          backgroundColor: confirmationSurface,
          color: themeProps.colors.textPrimary,
          borderColor: themeProps.colors.surface,
        }}
      >
        <h3 className="font-semibold mb-2">{t.manageLinkTitle}</h3>
        <p className="text-sm mb-2" style={{ color: themeProps.colors.textSecondary }}>
          {t.manageLinkBody}
        </p>
        <div
          className={`flex items-center gap-2 p-2 ${themeProps.radiusClass} border`}
          style={{
            backgroundColor: themeProps.colors.surface,
            borderColor: themeProps.colors.surface,
          }}
        >
          <input
            type="text"
            value={manageLink === '#' ? '' : manageLink}
            readOnly
            className="w-full bg-transparent text-sm focus:outline-none placeholder:text-gray-600"
            style={inputTextStyle}
          />
          <button
            onClick={handleCopy}
            disabled={manageLink === '#'}
            className={`${themeProps.radiusClass} font-semibold text-sm px-3 py-1.5 whitespace-nowrap flex items-center gap-1.5 ${theme.shadowClass}`}
            style={{
              backgroundColor:
                manageLink === '#'
                  ? themeProps.colors.textSecondary
                  : themeProps.colors.primary,
              color: '#fff',
              opacity: manageLink === '#' ? 0.6 : 1,
            }}
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? t.copied : t.copy}
          </button>
        </div>
        {manageLink === '#' && (
          <p className="text-sm text-red-600">{t.invalidManageLink}</p>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <h3 className="font-semibold text-center">{t.addToCalendar}</h3>
        <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-semibold py-2 px-4 flex items-center gap-2 ${themeProps.radiusClass}`}
            style={{ backgroundColor: themeProps.colors.primary, color: '#fff' }}
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className={`font-semibold py-2 px-4 flex items-center gap-2 ${themeProps.radiusClass}`}
            style={{ backgroundColor: themeProps.colors.accent, color: '#fff' }}
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <button
        onClick={onReset}
        className={`${primaryButtonClass} mt-8 w-full sm:w-auto`}
        style={{ backgroundColor: themeProps.colors.primary }}
      >
        {t.newBooking}
      </button>
    </div>
  );
};

export default ReservationPage;
