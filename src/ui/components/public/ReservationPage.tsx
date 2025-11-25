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
    <div className="flex items-center justify-center w-full max-w-3xl mx-auto mb-4 gap-3">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        const bubbleClass = isActive || isCompleted
          ? 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
          : 'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-white/20 text-emerald-800/40 border border-white/40';

        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center text-center gap-1">
              <div className={bubbleClass}>{isCompleted ? '✓' : stepNumber}</div>
              <p
                className={`text-xs sm:text-sm font-sans ${
                  isActive || isCompleted
                    ? 'text-emerald-900'
                    : 'text-emerald-800/50'
                }`}
              >
                {label}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-[2px] bg-gradient-to-r from-emerald-200 via-white to-emerald-200" />
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
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center p-6 overflow-y-auto max-h-screen">
        <div className="bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.05)] rounded-2xl p-8 text-center max-w-lg w-full">
          <h2 className="text-xl font-serif tracking-tight text-emerald-900">Hiba</h2>
          <p className="font-sans text-emerald-800/90 font-light mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !unit || !settings) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center overflow-y-auto max-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-y-auto max-h-screen">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex justify-end gap-3 text-sm font-medium">
          <button
            onClick={() => setLocale('hu')}
            className={`px-3 py-1 rounded-full transition-all ${
              locale === 'hu'
                ? 'bg-emerald-700/10 border border-emerald-700/20 text-emerald-900'
                : 'bg-white/40 border border-white/60 text-emerald-800/70'
            }`}
          >
            Magyar
          </button>
          <button
            onClick={() => setLocale('en')}
            className={`px-3 py-1 rounded-full transition-all ${
              locale === 'en'
                ? 'bg-emerald-700/10 border border-emerald-700/20 text-emerald-900'
                : 'bg-white/40 border border-white/60 text-emerald-800/70'
            }`}
          >
            English
          </button>
        </div>

        <div className="bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.05)] rounded-2xl p-8 space-y-8 overflow-y-auto max-h-screen">
          <header className="text-center space-y-2">
            <h1 className="text-4xl font-serif tracking-tight text-emerald-900">{unit.name}</h1>
            <p className="text-lg font-sans text-emerald-800/90 font-light">{t.title}</p>
          </header>

          <ProgressIndicator currentStep={step} t={t} />

          <div className="space-y-6">
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
    <div className={`bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6 overflow-y-auto max-h-screen ${themeProps.radiusClass || ''} ${themeProps.shadowClass || ''}`}>
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
            )
          }
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/60 border border-white/70 text-emerald-800 hover:bg-white"
        >
          &lt;
        </button>
        <div className="text-center">
          <p className="text-sm font-sans text-emerald-800/70 font-light">
            {t.step1Title}
          </p>
          <h3 className="text-2xl font-serif tracking-tight text-emerald-900">
            {t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
        </div>
        <button
          type="button"
          onClick={() =>
            onMonthChange(
              new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
            )
          }
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/60 border border-white/70 text-emerald-800 hover:bg-white"
        >
          &gt;
        </button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs sm:text-sm font-semibold text-emerald-800/70 mb-3">
        {t.dayNames.map((d: string) => (
          <div key={d} className="font-sans">
            {d}
          </div>
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

          const buttonClass = `w-full aspect-square rounded-xl flex items-center justify-center font-semibold transition-all border ${
            isDisabled
              ? 'bg-white/40 border-white/60 text-emerald-800/30 cursor-not-allowed'
              : 'bg-white/80 border-white/70 text-emerald-900 hover:bg-emerald-700/10 hover:shadow-[0_4px_20px_rgba(6,78,59,0.15)]'
          }`;

          const titleText = isFull ? t.errorCapacityFull : '';

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onDateSelect(day)}
              disabled={isDisabled}
              title={titleText}
              className={buttonClass}
            >
              {day.getDate()}
            </button>
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

  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let hour = 17; hour <= 23; hour++) {
      for (const minute of [0, 30]) {
        const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        slots.push(value);
        if (hour === 23 && minute === 0) break;
      }
    }
    return slots;
  }, []);

  const isTimeWithinWindow = (time: string) => {
    if (!settings.bookableWindow) return true;
    const { from, to } = settings.bookableWindow;
    return time >= from && time <= to;
  };

  return (
    <div className={`bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6 overflow-y-auto max-h-screen space-y-6 ${themeProps.radiusClass || ''} ${themeProps.shadowClass || ''}`}>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-sans text-emerald-800/70 font-light">{t.step2Title}</p>
        <h2 className="text-2xl font-serif tracking-tight text-emerald-900">
          {selectedDate.toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </h2>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 font-sans text-sm">
          {error}
        </div>
      )}

      {(bookingWindowText || settings.kitchenStartTime || settings.barStartTime) && (
        <div className="bg-white/40 backdrop-blur-lg border border-white/60 rounded-xl p-4 space-y-2 font-sans text-emerald-800/90">
          {bookingWindowText && (
            <p className="flex items-start gap-2 text-sm">
              <span className="font-semibold text-emerald-900">{t.bookableWindowLabel}:</span>
              <span className="font-light">
                {bookingWindowText}
                <span className="block text-xs text-emerald-800/70">{t.bookableWindowHint}</span>
              </span>
            </p>
          )}
          {settings.kitchenStartTime && (
            <p className="text-sm">
              <strong className="text-emerald-900">{t.kitchenHours}:</strong> {settings.kitchenStartTime} - {settings.kitchenEndTime || t.untilClose}
            </p>
          )}
          {settings.barStartTime && (
            <p className="text-sm">
              <strong className="text-emerald-900">{t.barHours}:</strong> {settings.barStartTime} - {settings.barEndTime || t.untilClose}
            </p>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-sans text-emerald-800/80">{t.name}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 placeholder:text-emerald-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
            {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-sans text-emerald-800/80">{t.headcount}</label>
            <input
              type="number"
              name="headcount"
              value={formData.headcount}
              onChange={handleStandardChange}
              min="1"
              className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-sans text-emerald-800/80">{t.email}</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 placeholder:text-emerald-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
            {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-sans text-emerald-800/80">{t.phone}</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 placeholder:text-emerald-800/60 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              required
            />
            {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-sans text-emerald-800/80">{t.startTime}</p>
            <span className="text-xs text-emerald-800/60 font-sans">17:00 – 23:00</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {timeSlots.map((time) => {
              const disabled = !isTimeWithinWindow(time);
              const isActive = formData.startTime === time;
              return (
                <button
                  type="button"
                  key={time}
                  disabled={disabled}
                  onClick={() => setFormData((prev: any) => ({ ...prev, startTime: time }))}
                  className={`${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                      : 'bg-white/70 text-emerald-900 hover:bg-emerald-700/10'
                  } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} border border-white/70 rounded-xl px-3 py-2 text-sm font-semibold transition-all font-sans`}
                >
                  {time}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-sans text-emerald-800/80">{t.endTime}</label>
          <input
            type="time"
            name="endTime"
            value={formData.endTime}
            onChange={handleStandardChange}
            className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            min={formData.startTime}
          />
        </div>

        {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
          <div key={field.id} className="space-y-2">
            <label className="block text-sm font-sans text-emerald-800/80">{field.label}</label>
            <select
              name={field.id}
              value={formData.customData[field.id] || ''}
              onChange={handleCustomFieldChange}
              className="w-full px-4 py-3 bg-white/60 border border-white/70 rounded-xl text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
            className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/50 text-emerald-800 rounded-full hover:bg-white/40 transition-all w-full sm:w-auto"
          >
            {t.back}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid}
            className="px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 hover:shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
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
  const confirmationUrl = manageLink;

  return (
    <div className={`bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-8 space-y-6 overflow-y-auto max-h-screen ${themeProps.radiusClass || ''} ${themeProps.shadowClass || ''}`}>
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-serif tracking-tight text-emerald-900">{titleText}</h2>
        <p className="font-sans text-emerald-800/90 font-light">{bodyText}</p>
        <p className="text-sm text-emerald-800/70 font-sans">{t.emailConfirmationSent}</p>
      </div>

      {submittedData && (
        <div className="bg-white/50 backdrop-blur-lg border border-white/70 rounded-2xl p-5 space-y-4">
          <h3 className="text-lg font-serif tracking-tight text-emerald-900 text-center">{t.step3Details}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans text-emerald-900">
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.referenceCode}</p>
              <p className="font-semibold flex items-center gap-2 mt-1">
                <span className="font-mono bg-emerald-700/10 border border-emerald-700/20 rounded-full px-3 py-1">
                  {submittedData.referenceCode.substring(0, 8).toUpperCase()}
                </span>
              </p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.date}</p>
              <p className="font-semibold mt-1">
                {submittedData.date.toLocaleDateString(locale, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.name}</p>
              <p className="font-semibold mt-1">{submittedData.name}</p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.headcount}</p>
              <p className="font-semibold mt-1">{submittedData.headcount}</p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.startTime}</p>
              <p className="font-semibold mt-1">
                {submittedData.startTime
                  .toDate()
                  .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.email}</p>
              <p className="font-semibold mt-1">{submittedData.contact.email}</p>
            </div>
            <div className="bg-white/60 border border-white/70 rounded-xl p-3">
              <p className="text-xs text-emerald-800/70">{t.phone}</p>
              <p className="font-semibold mt-1">
                {submittedData.contact?.phoneE164 ? maskPhone(submittedData.contact.phoneE164) : 'N/A'}
              </p>
            </div>
            {Object.entries(submittedData.customData || {}).map(([key, value]) => {
              const field = settings.guestForm?.customSelects?.find((f) => f.id === key);
              if (!field || !value) return null;
              return (
                <div key={key} className="bg-white/60 border border-white/70 rounded-xl p-3">
                  <p className="text-xs text-emerald-800/70">{field.label}</p>
                  <p className="font-semibold mt-1">{value as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white/40 backdrop-blur-lg border border-white/60 rounded-2xl p-5 space-y-3">
        <h3 className="text-lg font-serif tracking-tight text-emerald-900">{t.manageLinkTitle}</h3>
        <p className="text-sm font-sans text-emerald-800/80">{t.manageLinkBody}</p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full bg-white/60 border border-white/70 rounded-full px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              value={manageLink}
              readOnly
              className="w-full bg-transparent text-sm font-sans text-emerald-900 focus:outline-none"
            />
            <button
              onClick={handleCopy}
              type="button"
              className="px-4 py-2 bg-white/20 backdrop-blur-lg border border-white/50 text-emerald-800 rounded-full hover:bg-white/40 transition-all flex items-center gap-2"
            >
              <CopyIcon className="h-4 w-4" />
              {copied ? t.copied : t.copy}
            </button>
          </div>
          <button
            className="w-full sm:w-auto py-4 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif px-8 hover:bg-emerald-700/20 hover:shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all"
            onClick={() => (window.location.href = confirmationUrl)}
            type="button"
          >
            Megnyitás
          </button>
        </div>
      </div>

      <div className="bg-white/40 backdrop-blur-lg border border-white/60 rounded-2xl p-5 space-y-3">
        <h3 className="text-lg font-serif tracking-tight text-emerald-900">{t.addToCalendar}</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 hover:shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all flex items-center justify-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="flex-1 px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/50 text-emerald-800 rounded-full hover:bg-white/40 transition-all flex items-center justify-center gap-2"
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={onReset}
          className="px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 hover:shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all"
        >
          {t.newBooking}
        </button>
      </div>
    </div>
  );
};

export default ReservationPage;
