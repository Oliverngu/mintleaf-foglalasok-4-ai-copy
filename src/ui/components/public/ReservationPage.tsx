import React, { useState, useEffect, useMemo } from 'react';
import {
  Unit,
  ReservationSetting,
  User,
  ThemeSettings,
  GuestFormSettings,
  CustomSelectField,
} from '../../../core/models/data';
import { db, Timestamp, serverTimestamp } from '../../../core/firebase/config';
import {
  doc,
  getDoc,
  collection,
  setDoc,
  query,
  where,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import CalendarIcon from '../../../../components/icons/CalendarIcon';
import CopyIcon from '../../../../components/icons/CopyIcon';
import { translations } from '../../../lib/i18n';

type Locale = 'hu' | 'en';
type UITheme = 'minimal_glass' | 'elegant' | 'playful_bubbles';

const getPageWrapperClasses = (theme: UITheme) => {
  const base =
    'min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden';
  switch (theme) {
    case 'elegant':
      return `${base} bg-gradient-to-br from-amber-50 via-amber-100 to-rose-50`;
    case 'playful_bubbles':
      return `${base} bg-gradient-to-br from-sky-100 via-blue-100 to-indigo-100`;
    default:
      return `${base} bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900`;
  }
};

const getMainCardClasses = (theme: UITheme) => {
  switch (theme) {
    case 'elegant':
      return 'relative w-full max-w-3xl rounded-3xl bg-white shadow-xl border border-amber-100 text-slate-900 p-6 md:p-8';
    case 'playful_bubbles':
      return 'relative w-full max-w-3xl rounded-[28px] bg-white/80 backdrop-blur-md shadow-xl border border-sky-100 text-slate-900 p-6 md:p-8';
    default:
      return 'relative w-full max-w-3xl rounded-3xl bg-white/15 backdrop-blur-xl border border-white/20 shadow-2xl text-white p-6 md:p-8';
  }
};

const getPrimaryButtonClasses = (theme: UITheme) => {
  const base =
    'text-white font-bold py-2 px-6 transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed text-lg shadow-sm';
  switch (theme) {
    case 'elegant':
      return `${base} rounded-xl hover:shadow-md`;
    case 'playful_bubbles':
      return `${base} rounded-full transform hover:scale-[1.02] hover:shadow-lg`;
    default:
      return `${base} rounded-xl backdrop-blur`;
  }
};

const getSecondaryButtonClasses = (theme: UITheme) => {
  const base = 'font-bold py-2 px-4 transition duration-200';
  switch (theme) {
    case 'elegant':
      return `${base} rounded-xl border border-amber-200 text-amber-900 bg-white hover:bg-amber-50`;
    case 'playful_bubbles':
      return `${base} rounded-full bg-white/80 text-slate-800 hover:bg-white shadow-sm border border-sky-100`;
    default:
      return `${base} rounded-xl bg-white/20 text-white hover:bg-white/30 border border-white/30`;
  }
};

const PlayfulBubbles = () => (
  <>
    <div className="pointer-events-none absolute w-64 h-64 bg-white/40 blur-3xl rounded-full -top-10 -left-10" />
    <div className="pointer-events-none absolute w-52 h-52 bg-white/30 blur-2xl rounded-full top-20 right-10" />
    <div className="pointer-events-none absolute w-40 h-40 bg-white/25 blur-2xl rounded-full bottom-10 left-1/4" />
  </>
);

interface ReservationPageProps {
  unitId: string;
  allUnits: Unit[];
  currentUser: User | null;
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
};

const DEFAULT_GUEST_FORM: GuestFormSettings = {
  customSelects: [],
};

const generateAdminActionToken = () =>
  `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

// ===== GUEST LOG HELPER =====
const writeGuestLog = async (
  unitId: string,
  booking: {
    id: string;
    name: string;
    headcount?: number;
    startTime?: Timestamp;
  },
  type: 'guest_created' | 'guest_cancelled',
  extraMessage?: string
) => {
  try {
    const logsRef = collection(db, 'units', unitId, 'reservation_logs');

    let dateStr = '';
    if (booking.startTime && typeof booking.startTime.toDate === 'function') {
      dateStr = booking.startTime.toDate().toLocaleString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    let baseMessage = '';
    if (type === 'guest_created') {
      baseMessage = `Vendég foglalást adott le: ${booking.name} (${booking.headcount ?? '-'} fő${
        dateStr ? `, ${dateStr}` : ''
      })`;
    }
    if (type === 'guest_cancelled') {
      baseMessage = `Vendég lemondta a foglalást: ${booking.name}${
        dateStr ? ` (${dateStr})` : ''
      }`;
    }

    const message = extraMessage ? `${baseMessage} – ${extraMessage}` : baseMessage;

    await addDoc(logsRef, {
      bookingId: booking.id,
      unitId,
      type,
      createdAt: serverTimestamp(),
      source: 'guest',
      createdByUserId: null,
      createdByName: booking.name,
      message,
    });
  } catch (logErr) {
    console.error('Failed to write reservation log from guest page:', logErr);
  }
};

const ProgressIndicator: React.FC<{
  currentStep: number;
  t: typeof translations['hu'];
}> = ({ currentStep, t }) => {
  const steps = [t.step1, t.step2, t.step3];
  return (
    <div className="flex items-center justify-center w-full max-w-xl mx-auto mb-8">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center text-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                  isCompleted
                    ? 'bg-[var(--color-primary)] text-white'
                    : isActive
                    ? 'bg-green-200 text-[var(--color-primary)] border-2 border-[var(--color-primary)]'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              <p
                className={`mt-2 text-sm font-semibold transition-colors ${
                  isActive || isCompleted
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-gray-400'
                }`}
              >
                {label}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-1 mx-2 transition-colors ${
                  isCompleted ? 'bg-[var(--color-primary)]' : 'bg-gray-200'
                }`}
              ></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const ReservationPage: React.FC<ReservationPageProps> = ({
  unitId,
  allUnits,
  currentUser: _currentUser, // jelenleg nincs használva
}) => {
  const [step, setStep] = useState(1);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [settings, setSettings] = useState<ReservationSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locale, setLocale] = useState<Locale>('hu');

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    headcount: '2',
    startTime: '',
    endTime: '',
    phone: '',
    email: '',
    customData: {} as Record<string, string>,
  });
  const [submittedData, setSubmittedData] = useState<any>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dailyHeadcounts, setDailyHeadcounts] = useState<Map<string, number>>(
    new Map()
  );

  useEffect(() => {
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'en') {
      setLocale('en');
    }
  }, []);

  useEffect(() => {
    const currentUnit = allUnits.find((u) => u.id === unitId);
    if (currentUnit) {
      setUnit(currentUnit);
      document.title = `Foglalás - ${currentUnit.name}`;
    } else if (allUnits.length > 0) {
      setError('A megadott egység nem található.');
    }
  }, [unitId, allUnits]);

  useEffect(() => {
    if (!unit) return;
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
        } else {
          setSettings(defaultSettings);
        }
      } catch (err) {
        console.error('Error fetching reservation settings:', err);
        setError('Hiba a foglalási beállítások betöltésekor.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [unit, unitId]);

  useEffect(() => {
    if (!unitId || !settings?.dailyCapacity || settings.dailyCapacity <= 0) {
      setDailyHeadcounts(new Map());
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

      const q = query(
        collection(db, 'units', unitId, 'reservations'),
        where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
        where('startTime', '<=', Timestamp.fromDate(endOfMonth)),
        where('status', 'in', ['pending', 'confirmed'])
      );

      try {
        const querySnapshot = await getDocs(q);
        const headcounts = new Map<string, number>();
        querySnapshot.docs.forEach((docSnap) => {
          const booking = docSnap.data();
          const dateKey = toDateKey(booking.startTime.toDate());
          const currentCount = headcounts.get(dateKey) || 0;
          headcounts.set(dateKey, currentCount + (booking.headcount || 0));
        });
        setDailyHeadcounts(headcounts);
      } catch (err) {
        console.error('Error fetching headcounts:', err);
      }
    };

    fetchHeadcounts();
  }, [unitId, currentMonth, settings?.dailyCapacity]);

  useEffect(() => {
    if (settings?.theme) {
      const root = document.documentElement;
      Object.entries(settings.theme).forEach(([key, value]) => {
        if (
          key !== 'radius' &&
          key !== 'elevation' &&
          key !== 'typographyScale'
        ) {
          root.style.setProperty(`--color-${key}`, value as string);
        }
      });
    }
  }, [settings?.theme]);

  const resetFlow = () => {
    setSelectedDate(null);
    setFormData({
      name: '',
      headcount: '2',
      startTime: '',
      endTime: '',
      phone: '',
      email: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !formData.startTime || !unit || !settings) return;

    setIsSubmitting(true);
    setError('');

    let startDateTime: Date;
    let endDateTime: Date;
    let newReservation: any;

    try {
      const requestedStartTime = formData.startTime;
      const requestedHeadcount = parseInt(formData.headcount, 10);

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

      if (settings.dailyCapacity && settings.dailyCapacity > 0) {
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const q = query(
          collection(db, 'units', unitId, 'reservations'),
          where('startTime', '>=', Timestamp.fromDate(dayStart)),
          where('startTime', '<=', Timestamp.fromDate(dayEnd)),
          where('status', 'in', ['pending', 'confirmed'])
        );

        const querySnapshot = await getDocs(q);
        const currentHeadcount = querySnapshot.docs.reduce(
          (sum, docSnap) => sum + (docSnap.data().headcount || 0),
          0
        );

        if (currentHeadcount >= settings.dailyCapacity)
          throw new Error(t.errorCapacityFull);
        if (currentHeadcount + requestedHeadcount > settings.dailyCapacity) {
          throw new Error(
            t.errorCapacityLimited.replace(
              '{count}',
              String(settings.dailyCapacity - currentHeadcount)
            )
          );
        }
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

      const newReservationRef = doc(
        collection(db, 'units', unitId, 'reservations')
      );
      const referenceCode = newReservationRef.id;
      const adminActionToken =
        settings.reservationMode === 'request'
          ? generateAdminActionToken()
          : null;
      const reservationStatus: 'confirmed' | 'pending' =
        settings?.reservationMode === 'auto' ? 'confirmed' : 'pending';

      newReservation = {
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
        createdAt: Timestamp.now(),
        referenceCode,
        reservationMode: settings.reservationMode,
        adminActionToken: adminActionToken || undefined,
        occasion: formData.customData['occasion'] || '',
        source: formData.customData['heardFrom'] || '',
        customData: formData.customData,
      };

      await setDoc(newReservationRef, newReservation);

      // ---- GUEST LOG: booking created ----
      await writeGuestLog(
        unitId,
        {
          id: referenceCode,
          name: newReservation.name,
          headcount: newReservation.headcount,
          startTime: newReservation.startTime,
        },
        'guest_created'
      );

      setSubmittedData({ ...newReservation, date: selectedDate });
      setStep(3);

      // !!! FRONTEND NEM KÜLD EMAILT !!!
      // A backend (onReservationCreated / onReservationStatusChange) intézi.
    } catch (err: unknown) {
      console.error('Error during reservation submission:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t.genericError);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const themeClassProps = useMemo(() => {
    if (!settings?.theme) {
      return {
        radiusClass: 'rounded-lg',
        shadowClass: 'shadow-md',
        fontBaseClass: 'text-base',
      };
    }
    const { radius, elevation, typographyScale } = settings.theme;
    return {
      radiusClass: { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg' }[
        radius
      ],
      shadowClass: { low: 'shadow-sm', mid: 'shadow-md', high: 'shadow-lg' }[
        elevation
      ],
      fontBaseClass: { S: 'text-sm', M: 'text-base', L: 'text-lg' }[
        typographyScale
      ],
    };
  }, [settings?.theme]);

  const uiTheme: UITheme = settings?.uiTheme || 'minimal_glass';
  const themeClasses = useMemo(
    () => ({
      wrapper: getPageWrapperClasses(uiTheme),
      card: getMainCardClasses(uiTheme),
      primaryButton: getPrimaryButtonClasses(uiTheme),
      secondaryButton: getSecondaryButtonClasses(uiTheme),
    }),
    [uiTheme]
  );

  if (error && step !== 2) {
    return (
      <div className={themeClasses.wrapper} style={{ color: 'var(--color-text-primary)' }}>
        {uiTheme === 'playful_bubbles' && <PlayfulBubbles />}
        <div className={`${themeClasses.card} text-center`}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-danger)' }}>
            Hiba
          </h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !unit || !settings) {
    return (
      <div className={themeClasses.wrapper}>
        {uiTheme === 'playful_bubbles' && <PlayfulBubbles />}
        <div className={themeClasses.card}>
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className={themeClasses.wrapper} style={{ color: 'var(--color-text-primary)' }}>
      {uiTheme === 'playful_bubbles' && <PlayfulBubbles />}
      <div className={themeClasses.card}>
        <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium">
          <button
            onClick={() => setLocale('hu')}
            className={
              locale === 'hu'
                ? 'font-bold text-[var(--color-primary)]'
                : 'text-gray-300'
            }
          >
            Magyar
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => setLocale('en')}
            className={
              locale === 'en'
                ? 'font-bold text-[var(--color-primary)]'
                : 'text-gray-300'
            }
          >
            English
          </button>
        </div>

        <header className="text-center mb-8 mt-4">
          <h1 className="text-4xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {unit.name}
          </h1>
          <p className="text-lg mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {t.title}
          </p>
        </header>

        <main className="w-full">
          <ProgressIndicator currentStep={step} t={t} />
          <div className="relative overflow-hidden mt-4">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
            >
              <div className="w-full flex-shrink-0">
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
              <div className="w-full flex-shrink-0">
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
                    primary: `${themeClasses.primaryButton} ${themeClassProps.radiusClass}`,
                    secondary: `${themeClasses.secondaryButton} ${themeClassProps.radiusClass}`,
                  }}
                />
              </div>
              <div className="w-full flex-shrink-0">
                <Step3Confirmation
                  onReset={resetFlow}
                  themeProps={themeClassProps}
                  t={t}
                  submittedData={submittedData}
                  unit={unit}
                  locale={locale}
                  settings={settings}
                  buttonClasses={{
                    primary: `${themeClasses.primaryButton} ${themeClassProps.radiusClass}`,
                    secondary: `${themeClasses.secondaryButton} ${themeClassProps.radiusClass}`,
                  }}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
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
      className={`bg-[var(--color-surface)] p-6 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100`}
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
          className="p-2 rounded-full hover:bg-gray-100"
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
          className="p-2 rounded-full hover:bg-gray-100"
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
              buttonClass +=
                ' bg-red-50 text-red-400 line-through cursor-not-allowed';
              titleText = t.errorCapacityFull;
            } else {
              buttonClass += ' text-gray-300 bg-gray-50 cursor-not-allowed';
            }
          } else {
            buttonClass += ' hover:bg-green-100';
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

const Step2Details: React.FC<any> = ({
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
}) => {
  const [formErrors, setFormErrors] = useState({
    name: '',
    phone: '',
    email: '',
  });

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
    `bg-gray-200 text-gray-800 font-bold py-2 px-4 ${themeProps.radiusClass} hover:bg-gray-300`;
  const primaryButtonClass =
    buttonClasses?.primary ||
    `text-white font-bold py-2 px-6 ${themeProps.radiusClass} disabled:bg-gray-400 disabled:cursor-not-allowed text-lg`;

  return (
    <div
      className={`bg-[var(--color-surface)] p-6 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100`}
    >
      <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3">
        {t.step2Title}
      </h2>
      {error && (
        <div className="p-3 mb-4 bg-red-100 text-red-800 font-semibold rounded-lg text-sm">
          {error}
        </div>
      )}
      {(bookingWindowText ||
        settings.kitchenStartTime ||
        settings.barStartTime) && (
        <div
          className={`p-3 mb-4 bg-gray-50 border ${themeProps.radiusClass} text-sm text-gray-700 space-y-2`}
        >
          {bookingWindowText && (
            <p className="flex items-start gap-2">
              <span className="font-semibold whitespace-nowrap">
                {t.bookableWindowLabel}:
              </span>
              <span>
                {bookingWindowText}
                <span className="block text-xs text-gray-500">
                  {t.bookableWindowHint}
                </span>
              </span>
            </p>
          )}
          {settings.kitchenStartTime && (
            <p>
              <strong>{t.kitchenHours}:</strong> {settings.kitchenStartTime} -{' '}
              {settings.kitchenEndTime || t.untilClose}
            </p>
          )}
          {settings.barStartTime && (
            <p>
              <strong>{t.barHours}:</strong> {settings.barStartTime} -{' '}
              {settings.barEndTime || t.untilClose}
            </p>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          type="text"
          readOnly
          value={selectedDate.toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          className="w-full p-2 border rounded-lg bg-gray-100 text-center font-semibold"
        />
        <div>
          <label className="block text-sm font-medium">{t.name}</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleStandardChange}
            className="w-full mt-1 p-2 border rounded-lg"
            required
          />
          {formErrors.name && (
            <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium">{t.headcount}</label>
          <input
            type="number"
            name="headcount"
            value={formData.headcount}
            onChange={handleStandardChange}
            min="1"
            className="w-full mt-1 p-2 border rounded-lg"
            required
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              className="w-full mt-1 p-2 border rounded-lg"
              required
            />
            {formErrors.email && (
              <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium">{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className="w-full mt-1 p-2 border rounded-lg"
              required
            />
            {formErrors.phone && (
              <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">{t.startTime}</label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleStandardChange}
              className="w-full mt-1 p-2 border rounded-lg"
              required
              min={settings.bookableWindow?.from}
              max={settings.bookableWindow?.to}
            />
          </div>
          <div>
            <label className="block text-sm font-medium">{t.endTime}</label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleStandardChange}
              className="w-full mt-1 p-2 border rounded-lg"
              min={formData.startTime}
            />
          </div>
        </div>
        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id}>
            <label className="block text-sm font-medium">{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className="w-full mt-1 p-2 border rounded-lg bg-white"
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

const Step3Confirmation: React.FC<{
  onReset: () => void;
  themeProps: any;
  t: any;
  submittedData: any;
  unit: Unit;
  locale: Locale;
  settings: ReservationSetting;
  buttonClasses: { primary: string; secondary: string };
}> = ({
  onReset,
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

    const { startTime, endTime, name, referenceCode } = submittedData;
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

    const mLink = `${window.location.origin}/manage?token=${referenceCode}`;

    return { googleLink: gLink, icsLink: iLink, manageLink: mLink };
  }, [submittedData, unit.name, t]);

  const handleCopy = () => {
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

  return (
    <div
      className={`bg-[var(--color-surface)] p-8 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100 text-center`}
    >
      <h2 className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>
        {titleText}
      </h2>
      <p className="text-[var(--color-text-primary)] mt-4">{bodyText}</p>
      <p className="text-sm text-gray-500 mt-2">{t.emailConfirmationSent}</p>

      {submittedData && (
        <div className="mt-6 text-left bg-gray-50 p-4 rounded-lg border">
          <h3 className="font-bold text-center mb-3">{t.step3Details}</h3>
          <p>
            <strong>{t.referenceCode}:</strong>{' '}
            <span className="font-mono bg-gray-200 px-2 py-1 rounded">
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

      <div className="mt-6 text-left bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold mb-2">{t.manageLinkTitle}</h3>
        <p className="text-sm text-blue-800 mb-2">{t.manageLinkBody}</p>
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border">
          <input
            type="text"
            value={manageLink}
            readOnly
            className="w-full bg-transparent text-sm text-gray-700 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="bg-blue-600 text-white font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 whitespace-nowrap flex items-center gap-1.5"
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold mb-3">{t.addToCalendar}</h3>
        <div className="flex justify-center gap-4">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 flex items-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <button
        onClick={onReset}
        className={`${primaryButtonClass} mt-8`}
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        {t.newBooking}
      </button>
    </div>
  );
};

export default ReservationPage;
