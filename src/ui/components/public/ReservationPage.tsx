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
    <div className="mb-8 text-center">
      <div className="flex items-center justify-center gap-4">
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isActive = currentStep === stepNumber;
          return (
            <div key={stepNumber} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500 ${
                  isCompleted || isActive
                    ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                    : 'bg-white/20 text-emerald-800/40 border border-white/60 backdrop-blur'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              <div className="ml-3 text-left">
                <p
                  className={`text-[11px] uppercase tracking-[0.15em] font-semibold ${
                    isCompleted || isActive
                      ? 'text-emerald-900'
                      : 'text-emerald-800/50'
                  }`}
                >
                  {label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-3 ${
                    currentStep > stepNumber
                      ? 'bg-emerald-600/50'
                      : 'bg-emerald-800/10'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
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

  if (error && step !== 2) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4 text-center">
        <div className="bg-[var(--color-surface)] p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-[var(--color-danger)]">Hiba</h2>
          <p className="text-[var(--color-text-primary)] mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !unit || !settings) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center p-4 sm:p-6 md:p-10">
      <div className="absolute top-6 right-6 flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <button
          onClick={() => setLocale('hu')}
          className={locale === 'hu' ? 'text-emerald-900 underline' : 'text-emerald-800/60 hover:text-emerald-900'}
        >
          Magyar
        </button>
        <span className="text-emerald-300">|</span>
        <button
          onClick={() => setLocale('en')}
          className={locale === 'en' ? 'text-emerald-900 underline' : 'text-emerald-800/60 hover:text-emerald-900'}
        >
          English
        </button>
      </div>

      <div className="w-full max-w-5xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/40 via-transparent to-yellow-200/40 blur-3xl" />
        <div className="relative w-full max-w-4xl mx-auto bg-white/80 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.08)] rounded-2xl p-6 sm:p-10 min-h-[600px] flex flex-col">
          <header className="text-center mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-2">
              {unit.name}
            </p>
            <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-emerald-900 drop-shadow-sm">{t.title}</h1>
            <p className="text-emerald-800/80 mt-2 max-w-2xl mx-auto leading-relaxed">
              {t.step1Title}
            </p>
          </header>

          <ProgressIndicator currentStep={step} t={t} />

          <div className="flex-1 min-h-0 overflow-y-auto">
            {step === 1 && (
              <Step1Date
                settings={settings}
                onDateSelect={handleDateSelect}
                themeProps={themeClassProps}
                t={t}
                currentMonth={currentMonth}
                onMonthChange={setCurrentMonth}
                dailyHeadcounts={dailyHeadcounts}
              />
            )}
            {step === 2 && (
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
            )}
            {step === 3 && (
              <Step3Confirmation
                onReset={resetFlow}
                themeProps={themeClassProps}
                t={t}
                submittedData={submittedData}
                unit={unit}
                locale={locale}
                settings={settings}
              />
            )}
          </div>
        </div>
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
      className={`bg-white/70 backdrop-blur-xl border border-emerald-100/80 p-6 sm:p-8 rounded-2xl shadow-[0_12px_40px_rgba(16,185,129,0.08)] ${themeProps.radiusClass} ${themeProps.shadowClass || ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-1">
            {t.step1}
          </p>
          <h2 className="text-2xl font-serif tracking-tight text-emerald-900">{t.step1Title}</h2>
        </div>
        <div className="flex items-center gap-3 bg-white/70 px-4 py-2 rounded-full border border-emerald-100 shadow-sm">
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
              )
            }
            className="w-9 h-9 rounded-full bg-emerald-700/10 border border-emerald-100 text-emerald-900 shadow-sm hover:shadow-md"
          >
            &lt;
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-900">
              {t.monthNames[currentMonth.getMonth()]}
            </p>
            <p className="text-xs text-emerald-700">{currentMonth.getFullYear()}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              onMonthChange(
                new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
              )
            }
            className="w-9 h-9 rounded-full bg-emerald-700/10 border border-emerald-100 text-emerald-900 shadow-sm hover:shadow-md"
          >
            &gt;
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center font-semibold text-emerald-700 text-sm mb-4">
        {t.dayNames.map((d: string) => (
          <div key={d} className="uppercase tracking-wide text-xs text-emerald-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-3">
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

          let buttonClass =
            'w-full aspect-square flex items-center justify-center text-sm rounded-full transition-all duration-200 font-medium';
          let titleText = '';

          if (isDisabled) {
            if (isFull) {
              buttonClass +=
                ' bg-red-50 text-red-400 line-through cursor-not-allowed border border-red-100';
              titleText = t.errorCapacityFull;
            } else {
              buttonClass += ' text-gray-300 bg-gray-50 cursor-not-allowed border border-gray-100';
            }
          } else {
            buttonClass +=
              ' text-emerald-800/90 bg-white/80 border border-emerald-100 shadow-sm hover:bg-emerald-50 hover:shadow-md';
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
  const selectPlaceholder = locale === 'en' ? 'Please choose' : 'Válassz...';

  return (
    <div
      className={`bg-white/75 backdrop-blur-xl border border-emerald-100/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-[0_12px_40px_rgba(16,185,129,0.08)] ${themeProps.radiusClass} ${themeProps.shadowClass || ''}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-1">
            {t.step2}
          </p>
          <h2 className="text-2xl font-serif tracking-tight text-emerald-900">{t.step2Title}</h2>
          <p className="text-sm text-emerald-700 mt-1 font-medium">
            {selectedDate.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-3 bg-emerald-700/10 border border-emerald-200 rounded-full text-emerald-900 font-semibold shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {t.step2Title}
        </div>
      </div>

      {error && (
        <div className="p-3 mb-2 bg-red-50 text-red-700 font-semibold rounded-xl text-sm border border-red-200">
          {error}
        </div>
      )}

      {(bookingWindowText || settings.kitchenStartTime || settings.barStartTime) && (
        <div className="p-4 rounded-2xl bg-emerald-700/5 border border-emerald-100 text-sm text-emerald-900 space-y-2 shadow-inner">
          {bookingWindowText && (
            <p className="flex items-start gap-2">
              <span className="font-semibold whitespace-nowrap">
                {t.bookableWindowLabel}:
              </span>
              <span>
                {bookingWindowText}
                <span className="block text-xs text-emerald-700">{t.bookableWindowHint}</span>
              </span>
            </p>
          )}
          {settings.kitchenStartTime && (
            <p>
              <strong>{t.kitchenHours}:</strong> {settings.kitchenStartTime} - {settings.kitchenEndTime || t.untilClose}
            </p>
          )}
          {settings.barStartTime && (
            <p>
              <strong>{t.barHours}:</strong> {settings.barStartTime} - {settings.barEndTime || t.untilClose}
            </p>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.name}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
            {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.headcount}</label>
            <input
              type="number"
              name="headcount"
              value={formData.headcount}
              onChange={handleStandardChange}
              min="1"
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
            {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
            {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.startTime}</label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleStandardChange}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
              min={settings.bookableWindow?.from}
              max={settings.bookableWindow?.to}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-emerald-900">{t.endTime}</label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleStandardChange}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              min={formData.startTime}
            />
          </div>
        </div>

        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id}>
            <label className="block text-sm font-semibold text-emerald-900">{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className="w-full mt-1 px-4 py-3 rounded-2xl border border-emerald-100 bg-white/80 text-emerald-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            >
              <option value="">{selectPlaceholder}</option>
              {field.options.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full bg-white/80 text-emerald-900 font-semibold py-3 px-4 rounded-full border border-emerald-200 hover:bg-emerald-50 shadow-sm"
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full bg-emerald-700/10 border border-emerald-700/20 text-emerald-900 font-serif font-semibold py-3 px-6 rounded-full shadow-sm hover:bg-emerald-700/20 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed text-lg"
          >
            {isSubmitting ? t.submitting : t.next}
          </button>
        </div>
      </form>
    </div>
  );
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-4 rounded-xl bg-white border border-emerald-100 shadow-sm">
    <p className="text-xs uppercase tracking-[0.15em] text-emerald-600 font-semibold mb-1">{label}</p>
    <p className="text-emerald-950 font-medium">{value}</p>
  </div>
);

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
      className={`bg-white/80 backdrop-blur-xl border border-emerald-100/80 rounded-3xl p-8 sm:p-10 text-center space-y-6 shadow-[0_12px_40px_rgba(16,185,129,0.08)] ${themeProps.radiusClass} ${themeProps.shadowClass || ''}`}
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-700 font-semibold mb-2">
          {isAutoConfirm ? t.reservationApproved : t.reservationModeLabel}
        </p>
        <h2 className="text-3xl font-bold text-emerald-950">{titleText}</h2>
        <p className="text-emerald-800 mt-2">{bodyText}</p>
        <p className="text-sm text-emerald-700 mt-1">{t.emailConfirmationSent}</p>
      </div>

      {submittedData && (
        <div className="text-left bg-emerald-50/80 p-6 rounded-2xl border border-emerald-100 shadow-inner space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-lg font-semibold text-emerald-900">{t.step3Details}</h3>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-emerald-900 rounded-full border border-emerald-200 font-mono text-sm">
              {t.referenceCode}: {submittedData.referenceCode.substring(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Detail label={t.name} value={submittedData.name} />
            <Detail label={t.headcount} value={`${submittedData.headcount} fő`} />
            <Detail
              label={t.date}
              value={submittedData.date.toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            />
            <Detail
              label={t.startTime}
              value={submittedData.startTime
                .toDate()
                .toLocaleTimeString(locale, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
            />
            <Detail label={t.email} value={submittedData.contact.email} />
            <Detail
              label={t.phone}
              value={
                submittedData.contact?.phoneE164
                  ? maskPhone(submittedData.contact.phoneE164)
                  : 'N/A'
              }
            />
            {Object.entries(submittedData.customData || {}).map(([key, value]) => {
              const field = settings.guestForm?.customSelects?.find(f => f.id === key);
              if (!field || !value) return null;
              return <Detail key={key} label={field.label} value={value as string} />;
            })}
          </div>
        </div>
      )}

      <div className="text-left bg-emerald-900 text-emerald-50 p-6 rounded-2xl shadow-lg space-y-3">
        <h3 className="text-lg font-semibold">{t.manageLinkTitle}</h3>
        <p className="text-sm text-emerald-100/80">{t.manageLinkBody}</p>
        <div className="flex items-center gap-2 bg-emerald-800/60 p-3 rounded-xl border border-emerald-700">
          <input
            type="text"
            value={manageLink}
            readOnly
            className="w-full bg-transparent text-sm text-emerald-50 focus:outline-none"
          />
          <button
            onClick={handleCopy}
            className="bg-white text-emerald-900 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-50 whitespace-nowrap flex items-center gap-1.5"
          >
            <CopyIcon className="h-4 w-4" />
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="text-left bg-white/70 p-6 rounded-2xl border border-emerald-100 shadow-inner">
        <h3 className="font-semibold mb-3 text-emerald-900">{t.addToCalendar}</h3>
        <div className="flex flex-col sm:flex-row sm:justify-center gap-3">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl hover:bg-emerald-500 flex items-center justify-center gap-2 shadow"
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="flex-1 bg-white text-emerald-900 font-semibold py-3 px-4 rounded-xl border border-emerald-200 hover:bg-emerald-50 flex items-center justify-center gap-2 shadow"
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <button
        onClick={onReset}
        className="mt-4 w-full bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:bg-emerald-600"
      >
        {t.newBooking}
      </button>
    </div>
  );
};

export default ReservationPage;
