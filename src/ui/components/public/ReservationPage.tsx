import React, { useEffect, useMemo, useState } from 'react';
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
    <div className="flex items-center justify-center w-full max-w-xl mx-auto mb-10 gap-4">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;
        return (
          <React.Fragment key={stepNumber}>
            <div className="flex flex-col items-center text-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105'
                    : isCompleted
                    ? 'bg-emerald-700/20 text-emerald-900 border border-emerald-700/30'
                    : 'text-emerald-800/40 border border-white/40 bg-white/20'
                }`}
              >
                {isCompleted ? '✓' : stepNumber}
              </div>
              <p
                className={`text-sm font-semibold ${
                  isActive || isCompleted ? 'text-emerald-900' : 'text-emerald-700/60'
                }`}
              >
                {label}
              </p>
            </div>
            {index < steps.length - 1 && <div className="flex-1 h-px bg-white/50" />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const parseTimeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const formatMinutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
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
  const [dailyHeadcounts, setDailyHeadcounts] = useState<Map<string, number>>(new Map());

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
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59);

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
        if (key !== 'radius' && key !== 'elevation' && key !== 'typographyScale') {
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

      const { from: bookingStart, to: bookingEnd } = bookingWindow;
      if (requestedStartTime < bookingStart || requestedStartTime > bookingEnd) {
        throw new Error(
          t.errorTimeWindow.replace('{start}', bookingStart).replace('{end}', bookingEnd)
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

        if (currentHeadcount >= settings.dailyCapacity) throw new Error(t.errorCapacityFull);
        if (currentHeadcount + requestedHeadcount > settings.dailyCapacity) {
          throw new Error(
            t.errorCapacityLimited.replace(
              '{count}',
              String(settings.dailyCapacity - currentHeadcount)
            )
          );
        }
      }

      startDateTime = new Date(`${toDateKey(selectedDate)}T${formData.startTime}`);
      endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);
      if (formData.endTime) {
        const potentialEndDateTime = new Date(`${toDateKey(selectedDate)}T${formData.endTime}`);
        if (potentialEndDateTime > startDateTime) endDateTime = potentialEndDateTime;
      }

      const newReservationRef = doc(collection(db, 'units', unitId, 'reservations'));
      const referenceCode = newReservationRef.id;
      const adminActionToken =
        settings.reservationMode === 'request' ? generateAdminActionToken() : null;
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

  const bookingWindow = useMemo(() => {
    const rawFrom = settings?.bookableWindow?.from;
    const rawTo = settings?.bookableWindow?.to;
    const isValidTime = (value?: string) => (value ? /^\d{2}:\d{2}$/.test(value) : false);

    const safeFrom = isValidTime(rawFrom) ? rawFrom! : '00:00';
    const safeTo = isValidTime(rawTo) ? rawTo! : '23:59';

    return { from: safeFrom, to: safeTo };
  }, [settings?.bookableWindow?.from, settings?.bookableWindow?.to]);
  const availableSlots = (settings as any)?.availableSlots as string[] | undefined;

  const availableTimes = useMemo(() => {
    if (!bookingWindow.from || !bookingWindow.to) return [];
    const minMinutes = parseTimeToMinutes(bookingWindow.from);
    const maxMinutes = parseTimeToMinutes(bookingWindow.to);

    if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes) || minMinutes > maxMinutes) {
      return [];
    }

    if (availableSlots && Array.isArray(availableSlots) && availableSlots.length > 0) {
      return Array.from(
        new Set(
          availableSlots
            .filter((slot) => {
              if (!/^\d{2}:\d{2}$/.test(slot)) return false;
              const mins = parseTimeToMinutes(slot);
              return mins >= minMinutes && mins <= maxMinutes;
            })
            .sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b))
        )
      );
    }

    const times: string[] = [];
    const interval = 30;
    for (let m = minMinutes; m <= maxMinutes; m += interval) {
      times.push(formatMinutesToTime(m));
    }
    return times;
  }, [availableSlots, bookingWindow.from, bookingWindow.to]);

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
      radiusClass: { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg' }[radius],
      shadowClass: { low: 'shadow-sm', mid: 'shadow-md', high: 'shadow-lg' }[elevation],
      fontBaseClass: { S: 'text-sm', M: 'text-base', L: 'text-lg' }[typographyScale],
    };
  }, [settings?.theme]);

  if (error && step !== 2) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4 text-center font-[Inter] text-emerald-900">
        <div className="bg-white/60 backdrop-blur-xl p-8 rounded-2xl shadow-lg border border-white/60">
          <h2 className="text-2xl font-semibold text-red-700 font-[Playfair Display]">Hiba</h2>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (loading || !unit || !settings) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 text-emerald-900 font-[Inter] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_35%)]" aria-hidden />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center justify-end gap-2 text-sm font-medium mb-6">
          <button
            onClick={() => setLocale('hu')}
            className={`px-4 py-2 rounded-full transition-all border backdrop-blur-xl ${
              locale === 'hu'
                ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900 font-semibold'
                : 'bg-white/30 border-white/60 text-emerald-700'
            }`}
          >
            Magyar
          </button>
          <button
            onClick={() => setLocale('en')}
            className={`px-4 py-2 rounded-full transition-all border backdrop-blur-xl ${
              locale === 'en'
                ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900 font-semibold'
                : 'bg-white/30 border-white/60 text-emerald-700'
            }`}
          >
            English
          </button>
        </div>

        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-[Playfair Display] text-emerald-900">{unit.name}</h1>
          <p className="text-lg text-emerald-700/80 mt-2">{t.title}</p>
        </header>

        <div className="bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(16,185,129,0.08)] rounded-2xl p-6 sm:p-8">
          <ProgressIndicator currentStep={step} t={t} />
          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-in-out"
              style={{ transform: `translateX(-${(step - 1) * 100}%)` }}
            >
              <div className="w-full flex-shrink-0">
                <Step1Date
                  settings={settings}
                  onDateSelect={handleDateSelect}
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
                  t={t}
                  locale={locale}
                  error={error}
                  availableTimes={availableTimes}
                  bookingWindow={bookingWindow}
                />
              </div>
              <div className="w-full flex-shrink-0">
                <Step3Confirmation
                  onReset={resetFlow}
                  t={t}
                  submittedData={submittedData}
                  unit={unit}
                  locale={locale}
                  settings={settings}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Step1Date: React.FC<{
  settings: ReservationSetting;
  onDateSelect: (date: Date) => void;
  t: any;
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
  dailyHeadcounts: Map<string, number>;
}> = ({ settings, onDateSelect, t, currentMonth, onMonthChange, dailyHeadcounts }) => {
  const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
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
    <div className="p-2 sm:p-4">
      <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="px-4 py-2 bg-white/20 backdrop-blur-lg border border-white/50 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-700/60">{t.selectDate}</p>
            <h3 className="text-2xl font-[Playfair Display] text-emerald-900">
              {t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="px-4 py-2 bg-white/20 backdrop-blur-lg border border-white/50 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center text-xs sm:text-sm font-semibold text-emerald-700/70 mb-2">
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
            const label = day.getDate();

            let baseClass =
              'w-full h-12 sm:h-14 flex items-center justify-center rounded-2xl transition-all font-semibold border backdrop-blur-xl';
            if (isDisabled) {
              baseClass += isFull
                ? ' bg-red-50/70 border-red-100 text-red-400 line-through cursor-not-allowed'
                : ' bg-white/30 border-white/40 text-emerald-700/40 cursor-not-allowed';
            } else {
              baseClass +=
                ' bg-white/50 border-white/60 text-emerald-900 hover:shadow-lg hover:scale-105 hover:border-emerald-500/40';
            }

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onDateSelect(day)}
                disabled={isDisabled}
                title={isFull ? t.errorCapacityFull : isBlackout ? t.blackoutDate : ''}
                className={baseClass}
              >
                {label}
              </button>
            );
          })}
        </div>
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
  t,
  locale,
  error,
  availableTimes,
  bookingWindow,
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
    if (name === 'phone' && !/^\+?[0-9\s-()]{7,}$/.test(value)) return t.errorInvalidPhone;
    return '';
  };

  const handleStandardChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
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

  const handleCustomFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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

  const bookingWindowText =
    bookingWindow?.from && bookingWindow?.to ? `${bookingWindow.from} – ${bookingWindow.to}` : null;

  const safeAvailableTimes = useMemo(
    () => (Array.isArray(availableTimes) ? availableTimes : []),
    [availableTimes]
  );

  // Guard: keep time options resilient when date or backend data is missing
  const timesForSelectedDay = useMemo(
    () => (selectedDate ? safeAvailableTimes : []),
    [selectedDate, safeAvailableTimes]
  );

  const endTimeOptions = useMemo(() => {
    if (!formData.startTime) return timesForSelectedDay;
    const startMinutes = parseTimeToMinutes(formData.startTime);
    return timesForSelectedDay.filter((time: string) => parseTimeToMinutes(time) > startMinutes);
  }, [timesForSelectedDay, formData.startTime]);

  const noDateMessage = locale === 'en' ? 'Please select a date first.' : 'Válassz először dátumot.';
  const noSlotsMessage =
    locale === 'en'
      ? 'No available time slots for this day.'
      : 'Erre a napra nincs elérhető időpont.';

  if (!selectedDate) {
    return (
      <div className="p-2 sm:p-4">
        <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-700/60">{t.step2Title}</p>
              <h2 className="text-3xl font-[Playfair Display] text-emerald-900">{t.step2}</h2>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
            >
              {t.back}
            </button>
          </div>
          <div className="p-4 bg-white/50 border border-white/60 rounded-2xl text-emerald-800/80 text-sm text-center">
            {noDateMessage}
          </div>
        </div>
      </div>
    );
  }

  const hasSlots = timesForSelectedDay.length > 0;

  return (
    <div className="p-2 sm:p-4">
      <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-emerald-700/60">{t.step2Title}</p>
            <h2 className="text-3xl font-[Playfair Display] text-emerald-900">{t.step2}</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
          >
            {t.back}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50/80 border border-red-100 text-red-800 rounded-xl text-sm">
            {error}
          </div>
        )}

        {(bookingWindowText || settings.kitchenStartTime || settings.barStartTime) && (
          <div className="p-4 bg-white/40 border border-white/60 rounded-2xl text-sm text-emerald-800/80 space-y-2">
            {bookingWindowText && (
              <p className="flex items-start gap-2">
                <span className="font-semibold whitespace-nowrap">{t.bookableWindowLabel}:</span>
                <span>
                  {bookingWindowText}
                  <span className="block text-xs text-emerald-700/70">{t.bookableWindowHint}</span>
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
                <strong>{t.barHours}:</strong> {settings.barStartTime} - {settings.barEndTime || t.untilClose}
              </p>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="w-full p-3 bg-white/60 border border-white/60 rounded-xl text-center font-semibold text-emerald-900">
            {selectedDate.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t.name}
              name="name"
              value={formData.name}
              onChange={handleStandardChange}
              error={formErrors.name}
              required
            />
            <Field
              label={t.headcount}
              name="headcount"
              value={formData.headcount}
              onChange={handleStandardChange}
              type="number"
              min="1"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t.email}
              name="email"
              value={formData.email}
              onChange={handleStandardChange}
              type="email"
              error={formErrors.email}
              required
            />
            <Field
              label={t.phone}
              name="phone"
              value={formData.phone}
              onChange={handleStandardChange}
              placeholder={t.phonePlaceholder}
              type="tel"
              error={formErrors.phone}
              required
            />
          </div>

          {!hasSlots ? (
            <div className="p-4 bg-white/50 border border-white/60 rounded-2xl text-emerald-800/80 text-sm text-center">
              {noSlotsMessage}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TimePicker
                label={t.startTime}
                name="startTime"
                selected={formData.startTime}
                onSelect={(value: string) =>
                  setFormData((prev: any) => ({
                    ...prev,
                    startTime: value,
                    endTime:
                      prev.endTime && parseTimeToMinutes(prev.endTime) > parseTimeToMinutes(value)
                        ? prev.endTime
                        : '',
                  }))
                }
                options={timesForSelectedDay}
              />
              <TimePicker
                label={t.endTime}
                name="endTime"
                selected={formData.endTime}
                onSelect={(value: string) => setFormData((prev: any) => ({ ...prev, endTime: value }))}
                options={endTimeOptions}
                allowEmpty
              />
            </div>
          )}

          {Array.isArray(settings.guestForm?.customSelects) &&
            settings.guestForm?.customSelects.map((field: CustomSelectField) => (
              <SelectField
                key={field.id}
                label={field.label}
                name={field.id}
                value={formData.customData[field.id] || ''}
                onChange={handleCustomFieldChange}
                options={field.options}
                required
              />
            ))}

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-4">
            <button
              type="button"
              onClick={onBack}
              className="px-8 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
            >
              {t.back}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className="px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t.submitting : t.next}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Field: React.FC<any> = ({ label, error, ...rest }) => (
  <div className="space-y-2">
    <label className="block text-sm font-semibold text-emerald-800">{label}</label>
    <input
      {...rest}
      className="w-full px-4 py-3 rounded-2xl bg-white/50 border border-white/70 text-emerald-900 placeholder:text-emerald-700/50 focus:outline-none focus:ring-2 focus:ring-emerald-300 shadow-sm"
    />
    {error && <p className="text-red-500 text-xs">{error}</p>}
  </div>
);

const SelectField: React.FC<any> = ({ label, options, ...rest }) => (
  <div className="space-y-2">
    <label className="block text-sm font-semibold text-emerald-800">{label}</label>
    <select
      {...rest}
      className="w-full px-4 py-3 rounded-2xl bg-white/50 border border-white/70 text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-300 shadow-sm"
    >
      <option value="" disabled>
        Válassz...
      </option>
      {options.map((o: string) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  </div>
);

const TimePicker: React.FC<{
  label: string;
  name: string;
  selected: string;
  options: string[];
  onSelect: (value: string) => void;
  allowEmpty?: boolean;
}> = ({ label, selected, options, onSelect, allowEmpty }) => (
  <div className="space-y-2">
    <label className="block text-sm font-semibold text-emerald-800">{label}</label>
    <div className="flex flex-wrap gap-2">
      {allowEmpty && (
        <button
          type="button"
          onClick={() => onSelect('')}
          className={`px-3 py-2 rounded-full border text-sm transition-all ${
            selected === ''
              ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900'
              : 'bg-white/30 border-white/50 text-emerald-700 hover:bg-white/50'
          }`}
        >
          —
        </button>
      )}
      {options.map((time) => {
        const isActive = selected === time;
        return (
          <button
            key={time}
            type="button"
            onClick={() => onSelect(time)}
            className={`px-4 py-2 rounded-full text-sm transition-all border backdrop-blur-xl ${
              isActive
                ? 'bg-emerald-700/10 border-emerald-700/30 text-emerald-900 shadow-[0_4px_20px_rgba(6,78,59,0.12)] scale-105'
                : 'bg-white/30 border-white/60 text-emerald-800 hover:bg-white/50'
            }`}
          >
            {time}
          </button>
        );
      })}
    </div>
  </div>
);

const maskPhone = (phoneE164: string): string => {
  if (!phoneE164 || phoneE164.length < 10) return phoneE164;
  const last4 = phoneE164.slice(-4);
  return phoneE164.slice(0, -7) + '••• •' + last4;
};

const Step3Confirmation: React.FC<any> = ({
  onReset,
  t,
  submittedData,
  unit,
  locale,
  settings,
}) => {
  const [copied, setCopied] = useState(false);

  if (!submittedData) return null;

  const baseManageLink = `${window.location.origin}/manage-reservation?token=${submittedData.referenceCode}`;
  const manageLink =
    submittedData.adminActionToken && settings.reservationMode === 'request'
      ? `${baseManageLink}&adminToken=${submittedData.adminActionToken}`
      : baseManageLink;

  const googleLink = `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    `${unit.name} - ${submittedData.name}`
  )}&dates=${submittedData.startTime
    .toDate()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')}/${submittedData.endTime
    .toDate()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')}`;

  const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${unit.name} - ${submittedData.name}\nDTSTART:${submittedData.startTime
    .toDate()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')}\nDTEND:${submittedData.endTime
    .toDate()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')}\nEND:VEVENT\nEND:VCALENDAR`;
  const icsBlob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const icsLink = URL.createObjectURL(icsBlob);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(manageLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const isAutoConfirm = settings.reservationMode === 'auto';
  const titleText = isAutoConfirm ? t.step3TitleConfirmed : t.step3Title;
  const bodyText = isAutoConfirm ? t.step3BodyConfirmed : t.step3Body;

  return (
    <div className="p-2 sm:p-4">
      <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-2xl shadow-sm p-6 space-y-6 text-center text-emerald-900">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-700/60">{t.step3Details}</p>
          <h2 className="text-3xl font-[Playfair Display] text-emerald-900">{titleText}</h2>
          <p className="text-emerald-800/80">{bodyText}</p>
          <p className="text-sm text-emerald-700/70">{t.emailConfirmationSent}</p>
        </div>

        <div className="bg-white/60 border border-white/70 rounded-2xl p-4 text-left space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-emerald-700/70">{t.referenceCode}</span>
            <span className="font-mono px-3 py-1 rounded-full bg-emerald-700/10 text-emerald-900">
              {submittedData.referenceCode.substring(0, 8).toUpperCase()}
            </span>
          </div>
          <Divider />
          <DetailRow label={t.name} value={submittedData.name} />
          <DetailRow label={t.headcount} value={submittedData.headcount} />
          <DetailRow
            label={t.date}
            value={submittedData.date.toLocaleDateString(locale, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />
          <DetailRow
            label={t.startTime}
            value={submittedData.startTime
              .toDate()
              .toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
          />
          <DetailRow label={t.email} value={submittedData.contact.email} />
          <DetailRow
            label={t.phone}
            value={submittedData.contact?.phoneE164 ? maskPhone(submittedData.contact.phoneE164) : 'N/A'}
          />
          {Object.entries(submittedData.customData || {}).map(([key, value]) => {
            const field = settings.guestForm?.customSelects?.find((f: CustomSelectField) => f.id === key);
            if (!field || !value) return null;
            return <DetailRow key={key} label={field.label} value={value as string} />;
          })}
        </div>

        <div className="bg-white/60 border border-white/70 rounded-2xl p-4 text-left space-y-3">
          <h3 className="font-semibold text-emerald-900">{t.manageLinkTitle}</h3>
          <p className="text-sm text-emerald-700/80">{t.manageLinkBody}</p>
          <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/60 border border-white/70 rounded-xl p-2">
            <input
              type="text"
              value={manageLink}
              readOnly
              className="w-full bg-transparent text-sm text-emerald-800 focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all flex items-center gap-2"
            >
              <CopyIcon className="h-4 w-4" />
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href={googleLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all"
          >
            <CalendarIcon className="h-5 w-5" /> {t.googleCalendar}
          </a>
          <a
            href={icsLink}
            download={`${unit.name}-reservation.ics`}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-white/20 backdrop-blur-lg border border-white/40 text-emerald-800 rounded-full hover:bg-white/40 transition-all"
          >
            <CalendarIcon className="h-5 w-5" /> {t.otherCalendar}
          </a>
        </div>

        <button
          onClick={onReset}
          className="w-full px-8 py-3 bg-emerald-700/10 backdrop-blur-xl border border-emerald-700/20 text-emerald-900 rounded-full font-serif hover:bg-emerald-700/20 shadow-[0_4px_20px_rgba(6,78,59,0.15)] transition-all"
        >
          {t.newBooking}
        </button>
      </div>
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-sm text-emerald-800">
    <span className="text-emerald-700/70">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

const Divider = () => <div className="h-px bg-emerald-100" />;

export default ReservationPage;
