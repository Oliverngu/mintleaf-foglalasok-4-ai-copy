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
    <div className="w-full max-w-3xl mx-auto mb-8 flex items-center gap-3">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        return (
          <React.Fragment key={stepNumber}>
            <div className="flex-1 flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-2xl backdrop-blur-md flex items-center justify-center font-semibold transition-all duration-300 border border-white/50 shadow ${
                  isCompleted
                    ? 'bg-[var(--color-primary)] text-white shadow-lg'
                    : isActive
                    ? 'bg-white/80 text-[var(--color-primary)] shadow-lg'
                    : 'bg-white/40 text-gray-500'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              <p
                className={`mt-2 text-sm font-medium ${
                  isActive || isCompleted
                    ? 'text-[var(--color-text-primary)]'
                    : 'text-gray-500'
                }`}
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {label}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className="h-[2px] flex-1 bg-white/50 rounded-full" />
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
  currentUser: _currentUser,
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
        radiusClass: 'rounded-xl',
        shadowClass: 'shadow-lg',
        fontBaseClass: 'text-base',
      };
    }
    const { radius, elevation, typographyScale } = settings.theme;
    return {
      radiusClass: { sm: 'rounded-md', md: 'rounded-lg', lg: 'rounded-2xl' }[
        radius
      ],
      shadowClass: { low: 'shadow-md', mid: 'shadow-lg', high: 'shadow-2xl' }[
        elevation
      ],
      fontBaseClass: { S: 'text-sm', M: 'text-base', L: 'text-lg' }[
        typographyScale
      ],
    };
  }, [settings?.theme]);

  if (error && step !== 2) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 flex items-center justify-center p-6 text-center" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="bg-white/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-white/60 max-w-lg w-full">
          <h2
            className="text-2xl font-bold text-[var(--color-danger)]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Hiba
          </h2>
          <p className="text-[var(--color-text-primary)] mt-3">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !unit || !settings) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-y-auto bg-gradient-to-br from-emerald-50 via-white to-emerald-50 flex flex-col items-center p-4 sm:p-6 md:p-10"
      style={{ color: 'var(--color-text-primary)', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.15),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.12),transparent_30%)]" />
      <div className="absolute inset-0 backdrop-blur-[2px]" />

      <div className="relative z-10 w-full max-w-5xl">
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
            className="text-4xl sm:text-5xl font-semibold text-[var(--color-text-primary)] drop-shadow-sm"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {unit.name}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mt-2">
            {t.title}
          </p>
        </header>

        <ProgressIndicator currentStep={step} t={t} />

        <main className="w-full relative overflow-hidden rounded-3xl border border-white/60 shadow-2xl backdrop-blur-xl bg-white/70">
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
          >
            <div className="w-full flex-shrink-0 p-6 sm:p-10">
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
            <div className="w-full flex-shrink-0 p-6 sm:p-10">
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
              />
            </div>
            <div className="w-full flex-shrink-0 p-6 sm:p-10">
              <Step3Confirmation
                onReset={resetFlow}
                themeProps={themeClassProps}
                t={t}
                submittedData={submittedData}
                unit={unit}
                locale={locale}
                settings={settings}
              />
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
      className={`backdrop-blur-xl bg-white/80 p-6 sm:p-8 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-white/60`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {t.step1}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {t.step1Title}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {t.selectDate}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white/70 px-3 py-2 rounded-full shadow">
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
              )
            }
            className="w-9 h-9 rounded-full border border-white/70 bg-white/60 hover:bg-white text-[var(--color-primary)]"
          >
            ‹
          </button>
          <h3 className="font-semibold text-lg" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
              )
            }
            className="w-9 h-9 rounded-full border border-white/70 bg-white/60 hover:bg-white text-[var(--color-primary)]"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center font-semibold text-[var(--color-text-secondary)] text-xs sm:text-sm mb-2">
        {t.dayNames.map((d: string) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateKey = toDateKey(day);

          const isBlackout = blackoutSet.has(dateKey);
          const isPast = day < today;
          let isFull = false;
          if (settings.dailyCapacity && settings.dailyCapacity > 0) {
            const currentHeadcount = dailyHeadcounts.get(dateKey) || 0;
            isFull = currentHeadcount >= settings.dailyCapacity;
          }
          const isDisabled = isBlackout || isPast || isFull;

          let buttonClass = `w-full h-14 flex items-center justify-center text-sm sm:text-base ${themeProps.radiusClass} transition-all duration-200 border`;
          let titleText = '';

          if (isDisabled) {
            if (isFull) {
              buttonClass += ' bg-red-50 text-red-400 border-red-100 cursor-not-allowed line-through';
              titleText = t.errorCapacityFull;
            } else {
              buttonClass += ' text-gray-300 bg-gray-50 border-gray-100 cursor-not-allowed';
            }
          } else {
            buttonClass +=
              ' bg-white/70 border-white/80 hover:-translate-y-[2px] hover:shadow-lg hover:border-[var(--color-primary)] text-[var(--color-text-primary)]';
          }

          return (
            <div key={dateKey}>
              <button
                type="button"
                onClick={() => onDateSelect(day)}
                disabled={isDisabled}
                title={titleText}
                className={buttonClass}
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
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

  const fieldLabelClass = 'block text-sm font-semibold text-[var(--color-text-primary)]';
  const inputClass =
    'w-full mt-1 p-3 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition';

  return (
    <div
      className={`backdrop-blur-xl bg-white/80 p-6 sm:p-8 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-white/60`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
            {t.step2}
          </p>
          <h2
            className="text-2xl sm:text-3xl font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {t.step2Title}
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {t.enterDetails}
          </p>
        </div>
        {selectedDate && (
          <div className="px-4 py-2 rounded-full bg-white/70 shadow text-sm font-semibold text-[var(--color-primary)]">
            {selectedDate.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 mb-4 bg-red-100 text-red-800 font-semibold rounded-xl text-sm border border-red-200">
          {error}
        </div>
      )}
      {(bookingWindowText ||
        settings.kitchenStartTime ||
        settings.barStartTime) && (
        <div
          className={`p-3 mb-5 bg-white/70 border ${themeProps.radiusClass} text-sm text-gray-700 space-y-2 shadow-sm`}
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

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabelClass}>{t.name}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              className={inputClass}
              required
            />
            {formErrors.name && (
              <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
            )}
          </div>
          <div>
            <label className={fieldLabelClass}>{t.headcount}</label>
            <input
              type="number"
              name="headcount"
              value={formData.headcount}
              onChange={handleStandardChange}
              min="1"
              className={inputClass}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabelClass}>{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              className={inputClass}
              required
            />
            {formErrors.email && (
              <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
            )}
          </div>
          <div>
            <label className={fieldLabelClass}>{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className={inputClass}
              required
            />
            {formErrors.phone && (
              <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={fieldLabelClass}>{t.startTime}</label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleStandardChange}
              className={inputClass}
              required
              min={settings.bookableWindow?.from}
              max={settings.bookableWindow?.to}
            />
          </div>
          <div>
            <label className={fieldLabelClass}>{t.endTime}</label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleStandardChange}
              className={inputClass}
              min={formData.startTime}
            />
          </div>
        </div>

        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id}>
            <label className={fieldLabelClass}>{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className={inputClass}
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

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className={`w-full sm:w-auto px-5 py-3 rounded-xl border border-gray-200 bg-white/70 text-[var(--color-text-primary)] hover:shadow ${themeProps.radiusClass}`}
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl text-white font-semibold shadow-lg transition ${themeProps.radiusClass} disabled:bg-gray-400 disabled:cursor-not-allowed`}
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
}> = ({ onReset, themeProps, t, submittedData, unit, locale, settings }) => {
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

  return (
    <div
      className={`backdrop-blur-xl bg-white/80 p-6 sm:p-8 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-white/60`}
    >
      <h2
        className="text-2xl sm:text-3xl font-semibold text-center"
        style={{ color: 'var(--color-success)', fontFamily: 'Playfair Display, serif' }}
      >
        {titleText}
      </h2>
      <p className="text-[var(--color-text-primary)] mt-4 text-center max-w-2xl mx-auto">
        {bodyText}
      </p>
      <p className="text-sm text-gray-500 mt-2 text-center">{t.emailConfirmationSent}</p>

      {submittedData && (
        <div className="mt-6 bg-white/70 p-5 rounded-2xl border border-gray-100 shadow-sm">
          <h3
            className="font-semibold text-lg text-center mb-3"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {t.step3Details}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[var(--color-text-primary)]">
            <p>
              <strong>{t.referenceCode}:</strong>{' '}
              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
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
        </div>
      )}

      <div className="mt-6 bg-gradient-to-r from-emerald-100/80 via-white to-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm">
        <h3
          className="font-semibold mb-2"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          {t.manageLinkTitle}
        </h3>
        <p className="text-sm text-emerald-900 mb-2">{t.manageLinkBody}</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white/80 p-2 rounded-xl border border-emerald-100 shadow-inner">
          <input
            type="text"
            value={manageLink}
            readOnly
            className="w-full bg-transparent text-sm text-gray-700 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white font-semibold text-sm hover:shadow-lg transition flex items-center gap-2"
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <h3
          className="font-semibold mb-3 text-center"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          {t.addToCalendar}
        </h3>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-initial text-center bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:shadow-lg flex items-center justify-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="flex-1 sm:flex-initial text-center bg-gray-800 text-white font-semibold py-2.5 px-4 rounded-xl hover:shadow-lg flex items-center justify-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <div className="flex justify-center mt-8">
        <button
          onClick={onReset}
          className={`px-6 py-3 text-white font-semibold shadow-xl ${themeProps.radiusClass}`}
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {t.newBooking}
        </button>
      </div>
    </div>
  );
};

export default ReservationPage;
