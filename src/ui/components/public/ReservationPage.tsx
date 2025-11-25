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
import CheckIcon from '../../../../components/icons/CheckIcon';
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
  const subtitles = [
    t.step1Subtitle || 'Válasszon dátumot',
    t.step2Subtitle || 'Adatok megadása',
    t.step3Subtitle || 'Foglalás összesítése',
  ];
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center w-full gap-3">
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = currentStep > stepNumber;
          const isActive = currentStep === stepNumber;
          return (
            <React.Fragment key={stepNumber}>
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold transition-colors shadow-sm ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'border border-emerald-200 text-emerald-500 bg-white/60'
                  }`}
                >
                  {isCompleted ? <CheckIcon className="h-4 w-4" /> : stepNumber}
                </div>
                <p
                  className={`text-sm font-semibold transition-colors ${
                    isActive || isCompleted
                      ? 'text-emerald-800'
                      : 'text-emerald-500'
                  }`}
                >
                  {label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 h-px bg-gradient-to-r from-emerald-100 via-emerald-200 to-emerald-100" />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-sm font-medium text-emerald-700/80 text-center">
        {subtitles[currentStep - 1]}
      </p>
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
      <div className="min-h-screen bg-gradient-to-b from-[#e8fff4] via-[#f4fffb] to-[#fafdff] flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e8fff4] via-[#f4fffb] to-[#fafdff] px-3 sm:px-6 py-6 sm:py-10 lg:py-16">
      <div className="relative max-w-5xl mx-auto flex min-h-screen">
        <div className="absolute top-0 right-0 flex items-center gap-2 text-xs sm:text-sm font-medium text-emerald-700/80">
          <button
            onClick={() => setLocale('hu')}
            className={`px-3 py-1 rounded-full border transition ${
              locale === 'hu'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'border-emerald-200 bg-white/70 text-emerald-700 hover:bg-white'
            }`}
          >
            Magyar
          </button>
          <button
            onClick={() => setLocale('en')}
            className={`px-3 py-1 rounded-full border transition ${
              locale === 'en'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'border-emerald-200 bg-white/70 text-emerald-700 hover:bg-white'
            }`}
          >
            English
          </button>
        </div>

        <div className="mt-10 sm:mt-0 w-full flex flex-col min-h-screen max-h-screen bg-white/60 backdrop-blur-xl border border-white/50 rounded-[28px] shadow-[0_24px_60px_rgba(15,118,110,0.18)] p-5 sm:p-8 lg:p-10">
          <header className="text-center mb-8 sm:mb-10 space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-700/80 font-semibold">{unit.name}</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t.title}</h1>
          </header>

          <div className="mb-10">
            <ProgressIndicator currentStep={step} t={t} />
          </div>

          <main className="w-full flex-1 overflow-y-auto min-h-0">
            <div className="relative overflow-x-hidden">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
              >
                <div className="w-full flex-shrink-0 px-0 sm:px-1">
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
                <div className="w-full flex-shrink-0 px-0 sm:px-1">
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
                <div className="w-full flex-shrink-0 px-0 sm:px-1">
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
            </div>
          </main>
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
  void themeProps;
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
    <div className="rounded-2xl bg-white/70 border border-emerald-50 shadow-sm p-4 sm:p-6">
      <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2 text-center">
        {t.step1Title}
      </h2>
      <p className="text-sm text-emerald-800/70 text-center mb-4">{t.title}</p>
      <div className="flex justify-between items-center mb-4">
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
            )
          }
          className="p-2 rounded-full hover:bg-emerald-50 text-emerald-700 transition"
        >
          &lt;
        </button>
        <h3 className="font-semibold text-lg text-slate-900">
          {t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            )
          }
          className="p-2 rounded-full hover:bg-emerald-50 text-emerald-700 transition"
        >
          &gt;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center font-semibold text-emerald-700/80 text-xs sm:text-sm mb-2">
        {t.dayNames.map((d: string) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 w-full">
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

          let buttonClass = 'w-full h-12 sm:h-14 flex items-center justify-center text-xs sm:text-sm rounded-xl transition-colors backdrop-blur';
          let titleText = '';

          if (isDisabled) {
            if (isFull) {
              buttonClass +=
                ' bg-red-50/80 text-red-400 line-through cursor-not-allowed';
              titleText = t.errorCapacityFull;
            } else {
              buttonClass += ' text-gray-300 bg-gray-50/80 cursor-not-allowed';
            }
          } else {
            buttonClass += ' bg-white/80 border border-emerald-50 hover:bg-emerald-50 text-emerald-800';
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
  void themeProps;
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

  return (
    <div className="rounded-2xl bg-white/70 border border-emerald-50 shadow-sm p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">
            {t.step2Title}
          </h2>
          <p className="text-sm text-emerald-800/70 mt-1">
            {selectedDate.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        {(bookingWindowText ||
          settings.kitchenStartTime ||
          settings.barStartTime) && (
          <div className="text-xs sm:text-sm text-emerald-900/80 bg-white/80 border border-emerald-100 rounded-xl px-4 py-3 shadow-sm space-y-1">
            {bookingWindowText && (
              <p className="font-semibold">
                {t.bookableWindowLabel}: <span className="font-normal">{bookingWindowText}</span>
              </p>
            )}
            {settings.kitchenStartTime && (
              <p>
                <span className="font-semibold">{t.kitchenHours}:</span> {settings.kitchenStartTime} –{' '}
                {settings.kitchenEndTime || t.untilClose}
              </p>
            )}
            {settings.barStartTime && (
              <p>
                <span className="font-semibold">{t.barHours}:</span> {settings.barStartTime} – {settings.barEndTime || t.untilClose}
              </p>
            )}
            <p>
              <span className="font-semibold">{t.reservationModeLabel}:</span>{' '}
              {settings.reservationMode === 'auto'
                ? t.reservationModeAuto
                : t.reservationModeRequest}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-xl border border-red-200 bg-red-50 text-red-800 font-semibold text-sm">
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.date}</label>
            <input
              type="text"
              value={selectedDate.toLocaleDateString(locale, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              readOnly
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.headcount}</label>
            <input
              type="number"
              name="headcount"
              min={1}
              value={formData.headcount}
              onChange={handleStandardChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.name}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              required
            />
            {formErrors.name && (
              <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              required
            />
            {formErrors.email && (
              <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
            )}
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              required
            />
            {formErrors.phone && (
              <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.startTime}</label>
            <input
              type="time"
              name="startTime"
              value={formData.startTime}
              onChange={handleStandardChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              required
              min={settings.bookableWindow?.from}
              max={settings.bookableWindow?.to}
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{t.endTime}</label>
            <input
              type="time"
              name="endTime"
              value={formData.endTime}
              onChange={handleStandardChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
              min={formData.startTime}
            />
          </div>
        </div>
        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id} className="grid grid-cols-1">
            <label className="text-[11px] uppercase tracking-wide text-emerald-700/70 font-semibold">{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className="w-full mt-1 rounded-xl bg-white/80 border border-emerald-100/80 px-4 py-2.5 text-sm md:text-base text-slate-800 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none"
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
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/70 px-5 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition"
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(5,122,85,0.35)] hover:bg-emerald-700 transition disabled:bg-emerald-300 disabled:cursor-not-allowed"
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
  void themeProps;
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
    <div className="rounded-2xl bg-white/70 border border-emerald-50 shadow-sm p-4 sm:p-6 lg:p-8">
      <div className="text-center space-y-2">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <CalendarIcon className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900">{titleText}</h2>
        <p className="text-slate-600">{bodyText}</p>
        <p className="text-sm text-emerald-800/80">{t.emailConfirmationSent}</p>
      </div>

      {submittedData && (
        <div className="mt-6 rounded-3xl bg-white/75 border border-emerald-50 shadow-md p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{t.step3Details}</h3>
              <p className="text-sm text-slate-500">{unit.name}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 px-4 py-2 font-semibold text-sm">
              {t.referenceCode}:{' '}
              <span className="font-mono">
                {submittedData.referenceCode.substring(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 border border-emerald-50 rounded-2xl divide-y md:divide-y-0 md:divide-x divide-emerald-50">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.name}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium">{submittedData.name}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.headcount}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium">{submittedData.headcount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.phone}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium">
                  {submittedData.contact?.phoneE164
                    ? maskPhone(submittedData.contact.phoneE164)
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.email}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium break-all">{submittedData.contact.email}</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.date}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium text-right">
                  {submittedData.date.toLocaleDateString(locale, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.startTime}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium">
                  {submittedData.startTime
                    .toDate()
                    .toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-emerald-50">
                <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{t.referenceCode}</span>
                <span className="text-sm md:text-base text-slate-800 font-medium">
                  {submittedData.referenceCode.substring(0, 8).toUpperCase()}
                </span>
              </div>
              {Object.entries(submittedData.customData || {}).map(([key, value]) => {
                const field = settings.guestForm?.customSelects?.find((f) => f.id === key);
                if (!field || !value) return null;
                return (
                  <div key={key} className="flex items-center justify-between gap-3 pb-3 last:pb-0 border-b last:border-b-0 border-emerald-50">
                    <span className="text-xs font-semibold tracking-wide text-emerald-800/70 uppercase">{field.label}</span>
                    <span className="text-sm md:text-base text-slate-800 font-medium text-right">{value as string}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-white/80 border border-emerald-100 p-4 sm:p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900 mb-2">{t.manageLinkTitle}</h3>
        <p className="text-sm text-slate-600 mb-3">{t.manageLinkBody}</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 w-full bg-white rounded-xl border border-emerald-100 px-3 py-2 flex items-center gap-2">
            <input
              type="text"
              value={manageLink}
              readOnly
              className="w-full bg-transparent text-sm text-slate-800 focus:outline-none"
            />
          </div>
          <button
            onClick={handleCopy}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(5,122,85,0.35)] hover:bg-emerald-700 transition"
          >
            <CopyIcon className="h-4 w-4 mr-2" />
            {copied ? t.copied : t.copy}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-slate-900 mb-3 text-center">{t.addToCalendar}</h3>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(5,122,85,0.35)] hover:bg-emerald-700 transition"
          >
            <CalendarIcon className="h-5 w-5 mr-2" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/70 px-6 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 transition"
          >
            <CalendarIcon className="h-5 w-5 mr-2" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={onReset}
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_40px_rgba(5,122,85,0.35)] hover:bg-emerald-700 transition"
        >
          {t.newBooking}
        </button>
      </div>
    </div>
  );
};

export default ReservationPage;
