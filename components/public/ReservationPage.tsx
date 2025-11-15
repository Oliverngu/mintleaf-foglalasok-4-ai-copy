import React, { useState, useEffect, useMemo } from 'react';
import { Unit, ReservationSetting, User, ThemeSettings, GuestFormSettings, CustomSelectField } from '../../data/mockData';
import { db, Timestamp } from '../../firebase/config';
import { doc, getDoc, collection, addDoc, setDoc, query, where, getDocs } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import CalendarIcon from '../icons/CalendarIcon';
import CopyIcon from '../icons/CopyIcon'; // Új import
import { translations } from '../../lib/i18n'; // Import a kiszervezett fájlból
import { sendEmail, createGuestReservationConfirmationEmail, createUnitNewReservationNotificationEmail } from '../../core/api/emailService';

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
    primary: '#166534', surface: '#ffffff', background: '#f9fafb', textPrimary: '#1f2937', 
    textSecondary: '#4b5563', accent: '#10b981', success: '#16a34a', danger: '#dc2626',
    radius: 'lg', elevation: 'mid', typographyScale: 'M',
};

const DEFAULT_GUEST_FORM: GuestFormSettings = {
    customSelects: [],
};

const ProgressIndicator: React.FC<{ currentStep: number, t: typeof translations['hu'] }> = ({ currentStep, t }) => {
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
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                                isCompleted ? 'bg-[var(--color-primary)] text-white' : isActive ? 'bg-green-200 text-[var(--color-primary)] border-2 border-[var(--color-primary)]' : 'bg-gray-200 text-gray-500'
                            }`}>
                                {isCompleted ? '✓' : stepNumber}
                            </div>
                            <p className={`mt-2 text-sm font-semibold transition-colors ${isActive || isCompleted ? 'text-[var(--color-text-primary)]' : 'text-gray-400'}`}>{label}</p>
                        </div>
                        {index < steps.length - 1 && (
                            <div className={`flex-1 h-1 mx-2 transition-colors ${isCompleted ? 'bg-[var(--color-primary)]' : 'bg-gray-200'}`}></div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

const ReservationPage: React.FC<ReservationPageProps> = ({ unitId, allUnits, currentUser }) => {
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
        customData: {} as Record<string, string>
    });
    const [submittedData, setSubmittedData] = useState<any>(null);
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State for calendar month and daily headcounts
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [dailyHeadcounts, setDailyHeadcounts] = useState<Map<string, number>>(new Map());
    
    useEffect(() => {
        const browserLang = navigator.language.split('-')[0];
        if (browserLang === 'en') {
            setLocale('en');
        }
    }, []);

    useEffect(() => {
        const currentUnit = allUnits.find(u => u.id === unitId);
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
                    id: unitId, blackoutDates: [], bookableWindow: { from: '11:00', to: '23:00'}, 
                    kitchenStartTime: null, kitchenEndTime: null, barStartTime: null, barEndTime: null,
                    guestForm: DEFAULT_GUEST_FORM, theme: DEFAULT_THEME,
                    reservationMode: 'request', notificationEmails: [],
                };
                if (docSnap.exists()) {
                    const dbData = docSnap.data() as any;
                    const finalSettings = { 
                        ...defaultSettings, ...dbData,
                        guestForm: { ...DEFAULT_GUEST_FORM, ...(dbData.guestForm || {}) },
                        theme: { ...DEFAULT_THEME, ...(dbData.theme || {}) },
                    };
                    setSettings(finalSettings);
                } else {
                    setSettings(defaultSettings);
                }
            } catch (err) {
                console.error("Error fetching reservation settings:", err);
                setError('Hiba a foglalási beállítások betöltésekor.');
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [unit, unitId]);

     // Fetch headcounts for the visible month
    useEffect(() => {
        if (!unitId || !settings?.dailyCapacity || settings.dailyCapacity <= 0) {
            setDailyHeadcounts(new Map()); // Clear if no capacity limit
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
                querySnapshot.docs.forEach(doc => {
                    const booking = doc.data();
                    const dateKey = toDateKey(booking.startTime.toDate());
                    const currentCount = headcounts.get(dateKey) || 0;
                    headcounts.set(dateKey, currentCount + (booking.headcount || 0));
                });
                setDailyHeadcounts(headcounts);
            } catch (err) {
                console.error("Error fetching headcounts:", err);
            }
        };

        fetchHeadcounts();
    }, [unitId, currentMonth, settings?.dailyCapacity]);


    useEffect(() => {
        if (settings?.theme) {
            const root = document.documentElement;
            Object.entries(settings.theme).forEach(([key, value]) => {
                if(key !== 'radius' && key !== 'elevation' && key !== 'typographyScale')
                root.style.setProperty(`--color-${key}`, value);
            });
        }
    }, [settings?.theme]);
    
    const resetFlow = () => {
        setSelectedDate(null);
        setFormData({ name: '', headcount: '2', startTime: '', endTime: '', phone: '', email: '', customData: {} });
        setStep(1);
    };

    const handleDateSelect = (day: Date) => { setSelectedDate(day); setStep(2); };

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

        try {
            // --- VALIDATION ---
            const requestedStartTime = formData.startTime;
            const requestedHeadcount = parseInt(formData.headcount, 10);

            // Time window validation
            const { from: bookingStart, to: bookingEnd } = settings.bookableWindow || { from: '00:00', to: '23:59' };
            if (requestedStartTime < bookingStart || requestedStartTime > bookingEnd) {
                throw new Error(t.errorTimeWindow.replace('{start}', bookingStart).replace('{end}', bookingEnd));
            }
            
            // Capacity validation (re-validate on submit for race conditions)
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
                const currentHeadcount = querySnapshot.docs.reduce((sum, doc) => sum + (doc.data().headcount || 0), 0);
                
                if (currentHeadcount >= settings.dailyCapacity) {
                    throw new Error(t.errorCapacityFull);
                }

                if (currentHeadcount + requestedHeadcount > settings.dailyCapacity) {
                    const availableSlots = settings.dailyCapacity - currentHeadcount;
                    throw new Error(t.errorCapacityLimited.replace('{count}', String(availableSlots)));
                }
            }

            // --- SUBMISSION LOGIC ---
            const startDateTime = new Date(`${toDateKey(selectedDate)}T${formData.startTime}`);
            let endDateTime = new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours duration
            if (formData.endTime) {
                const potentialEndDateTime = new Date(`${toDateKey(selectedDate)}T${formData.endTime}`);
                if (potentialEndDateTime > startDateTime) {
                    endDateTime = potentialEndDateTime;
                }
            }
            
            const newReservationRef = doc(collection(db, 'units', unitId, 'reservations'));
            const referenceCode = newReservationRef.id;

            const reservationStatus = settings?.reservationMode === 'auto' ? 'confirmed' : 'pending';

            const newReservation = {
                unitId, name: formData.name, headcount: parseInt(formData.headcount),
                startTime: Timestamp.fromDate(startDateTime), endTime: Timestamp.fromDate(endDateTime),
                contact: { phoneE164: normalizePhone(formData.phone), email: formData.email.trim().toLowerCase() },
                locale, status: reservationStatus as 'confirmed' | 'pending', createdAt: Timestamp.now(), referenceCode,
                occasion: formData.customData['occasion'] || '',
                source: formData.customData['heardFrom'] || '',
                customData: formData.customData,
                id: referenceCode, // Add id for email service
            };
            await setDoc(newReservationRef, newReservation);

            // Send emails
            if(newReservation.contact.email) {
                const emailConfirmationParams = createGuestReservationConfirmationEmail(newReservation, unit);
                if (emailConfirmationParams) {
                    await sendEmail(emailConfirmationParams);
                }
            }

            if (settings?.notificationEmails && settings.notificationEmails.length > 0) {
                const unitNotificationParams = createUnitNewReservationNotificationEmail(newReservation, unit, settings.notificationEmails);
                await sendEmail(unitNotificationParams);
            }

            setSubmittedData({ ...newReservation, date: selectedDate });
            setStep(3);
        } catch (err) {
            console.error("Error during reservation submission:", err);
            // FIX: Safely handle error object of type 'unknown'
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
        if (!settings?.theme) return { radiusClass: 'rounded-lg', shadowClass: 'shadow-md', fontBaseClass: 'text-base' };
        const { radius, elevation, typographyScale } = settings.theme;
        return {
            radiusClass: { sm: 'rounded-sm', md: 'rounded-md', lg: 'rounded-lg' }[radius],
            shadowClass: { low: 'shadow-sm', mid: 'shadow-md', high: 'shadow-lg' }[elevation],
            fontBaseClass: { S: 'text-sm', M: 'text-base', L: 'text-lg' }[typographyScale],
        };
    }, [settings?.theme]);
    
    if (error && step !== 2) return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4 text-center"><div className="bg-[var(--color-surface)] p-8 rounded-lg shadow-md"><h2 className="text-xl font-bold text-[var(--color-danger)]">Hiba</h2><p className="text-[var(--color-text-primary)] mt-2">{error}</p></div></div>;
    if (loading || !unit || !settings) return <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center"><LoadingSpinner /></div>;
    
    return (
        <div className="h-full overflow-y-auto bg-[var(--color-background)] flex flex-col items-center p-4 sm:p-6 md:p-8" style={{ color: 'var(--color-text-primary)' }}>
            <div className="absolute top-4 right-4 flex items-center gap-2 text-sm font-medium">
                <button onClick={() => setLocale('hu')} className={locale === 'hu' ? 'font-bold text-[var(--color-primary)]' : 'text-gray-500'}>Magyar</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setLocale('en')} className={locale === 'en' ? 'font-bold text-[var(--color-primary)]' : 'text-gray-500'}>English</button>
            </div>
            
            <header className="text-center mb-8 mt-8"><h1 className="text-4xl font-bold text-[var(--color-text-primary)]">{unit.name}</h1><p className="text-lg text-[var(--color-text-secondary)] mt-1">{t.title}</p></header>
            
            <main className="w-full max-w-2xl">
                <ProgressIndicator currentStep={step} t={t} />
                <div className="relative overflow-hidden">
                    <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${(step - 1) * 100}%)` }}>
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
                        <div className="w-full flex-shrink-0"><Step2Details selectedDate={selectedDate} formData={formData} setFormData={setFormData} onBack={() => { setStep(1); setError(''); }} onSubmit={handleSubmit} isSubmitting={isSubmitting} settings={settings} themeProps={themeClassProps} t={t} locale={locale} error={error} /></div>
                        <div className="w-full flex-shrink-0"><Step3Confirmation onReset={resetFlow} themeProps={themeClassProps} t={t} submittedData={submittedData} unit={unit} locale={locale} settings={settings} /></div>
                    </div>
                </div>
            </main>
        </div>
    );
};

const Step1Date: React.FC<{ 
    settings: ReservationSetting, 
    onDateSelect: (date: Date) => void, 
    themeProps: any, 
    t: any,
    currentMonth: Date,
    onMonthChange: (date: Date) => void,
    dailyHeadcounts: Map<string, number>
}> = ({ settings, onDateSelect, themeProps, t, currentMonth, onMonthChange, dailyHeadcounts }) => {
    
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const days = [];
    const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < startDayOfWeek; i++) { days.push(null); }
    for (let i = 1; i <= endOfMonth.getDate(); i++) { days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i)); }

    const blackoutSet = new Set(settings.blackoutDates || []);
    const today = new Date(); today.setHours(0,0,0,0);

    return (
        <div className={`bg-[var(--color-surface)] p-6 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100`}>
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3 text-center">{t.step1Title}</h2>
            <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&lt;</button>
                <h3 className="font-bold text-lg">{t.monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</h3>
                <button type="button" onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 rounded-full hover:bg-gray-100">&gt;</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[var(--color-text-secondary)] text-sm mb-2">{t.dayNames.map((d: string) => <div key={d}>{d}</div>)}</div>
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
                            buttonClass += ' bg-red-50 text-red-400 line-through cursor-not-allowed';
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
}

const Step2Details: React.FC<any> = ({ selectedDate, formData, setFormData, onBack, onSubmit, isSubmitting, settings, themeProps, t, locale, error }) => {
    const [formErrors, setFormErrors] = useState({ name: '', phone: '', email: '' });
    
    const validateField = (name: string, value: string) => {
        if (!value.trim()) return t.errorRequired;
        if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return t.errorInvalidEmail;
        if (name === 'phone' && !/^\+?[0-9\s-()]{7,}$/.test(value)) return t.errorInvalidPhone;
        return '';
    };

    const handleStandardChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({...prev, [name]: value }));
        if (['name', 'phone', 'email'].includes(name)) {
            setFormErrors((prev: any) => ({ ...prev, [name]: validateField(name, value) }));
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
        return formData.name && formData.phone && formData.email && formData.startTime && 
               !validateField('name', formData.name) && !validateField('phone', formData.phone) && !validateField('email', formData.email);
    }, [formData, t]);

    if (!selectedDate) return null;
    return (
        <div className={`bg-[var(--color-surface)] p-6 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100`}>
            <h2 className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3">{t.step2Title}</h2>
            {error && <div className="p-3 mb-4 bg-red-100 text-red-800 font-semibold rounded-lg text-sm">{error}</div>}
            {(settings.kitchenStartTime || settings.barStartTime) && (
                <div className={`p-3 mb-4 bg-gray-50 border ${themeProps.radiusClass} text-sm text-gray-600`}>
                    {settings.kitchenStartTime && <p><strong>{t.kitchenHours}:</strong> {settings.kitchenStartTime} - {settings.kitchenEndTime || 'Zárásig'}</p>}
                    {settings.barStartTime && <p><strong>{t.barHours}:</strong> {settings.barStartTime} - {settings.barEndTime || 'Zárásig'}</p>}
                </div>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
                <input type="text" readOnly value={selectedDate.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} className="w-full p-2 border rounded-lg bg-gray-100 text-center font-semibold"/>
                <div><label className="block text-sm font-medium">{t.name}</label><input type="text" name="name" value={formData.name} onChange={handleStandardChange} className="w-full mt-1 p-2 border rounded-lg" required />{formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}</div>
                <div><label className="block text-sm font-medium">{t.headcount}</label><input type="number" name="headcount" value={formData.headcount} onChange={handleStandardChange} min="1" className="w-full mt-1 p-2 border rounded-lg" required /></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium">{t.email}</label><input type="email" name="email" value={formData.email} onChange={handleStandardChange} className="w-full mt-1 p-2 border rounded-lg" required />{formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}</div>
                    <div><label className="block text-sm font-medium">{t.phone}</label><input type="tel" name="phone" value={formData.phone} onChange={handleStandardChange} placeholder={t.phonePlaceholder} className="w-full mt-1 p-2 border rounded-lg" required />{formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium">{t.startTime}</label><input type="time" name="startTime" value={formData.startTime} onChange={handleStandardChange} className="w-full mt-1 p-2 border rounded-lg" required min={settings.bookableWindow?.from} max={settings.bookableWindow?.to} /></div>
                    <div><label className="block text-sm font-medium">{t.endTime}</label><input type="time" name="endTime" value={formData.endTime} onChange={handleStandardChange} className="w-full mt-1 p-2 border rounded-lg" min={formData.startTime} /></div>
                </div>
                {settings.guestForm?.customSelects?.map((field: CustomSelectField) => (
                    <div key={field.id}>
                        <label className="block text-sm font-medium">{field.label}</label>
                        <select name={field.id} value={formData.customData[field.id] || ''} onChange={handleCustomFieldChange} className="w-full mt-1 p-2 border rounded-lg bg-white" required>
                             <option value="" disabled>Válassz...</option>
                            {field.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    </div>
                ))}
                <div className="flex justify-between items-center pt-4">
                    <button type="button" onClick={onBack} className={`bg-gray-200 text-gray-800 font-bold py-2 px-4 ${themeProps.radiusClass} hover:bg-gray-300`}>{t.back}</button>
                    <button type="submit" disabled={isSubmitting || !isFormValid} className={`text-white font-bold py-2 px-6 ${themeProps.radiusClass} disabled:bg-gray-400 disabled:cursor-not-allowed text-lg`} style={{ backgroundColor: 'var(--color-primary)' }}>{isSubmitting ? t.submitting : t.next}</button>
                </div>
            </form>
        </div>
    )
}

const Step3Confirmation: React.FC<{ onReset: () => void, themeProps: any, t: any, submittedData: any, unit: Unit, locale: Locale, settings: ReservationSetting }> = ({ onReset, themeProps, t, submittedData, unit, locale, settings }) => {
    const [copied, setCopied] = useState(false);
    
    const { googleLink, icsLink, manageLink } = useMemo(() => {
        if (!submittedData) return { googleLink: '#', icsLink: '#', manageLink: '#' };

        const { startTime, endTime, name, referenceCode } = submittedData;
        const startDate = startTime.toDate();
        const endDate = endTime.toDate();

        const formatDate = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
        
        const gCalParams = new URLSearchParams({
            action: 'TEMPLATE',
            text: `${unit.name} - ${t.title}`,
            dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
            details: `${t.name}: ${name}\n${t.referenceCode}: ${referenceCode}`,
            location: unit.name,
        });
        const gLink = `https://www.google.com/calendar/render?${gCalParams.toString()}`;

        const icsContent = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
            `DTSTART:${formatDate(startDate)}`, `DTEND:${formatDate(endDate)}`,
            `SUMMARY:${unit.name} - ${t.title}`,
            `DESCRIPTION:${t.name}: ${name}\\n${t.referenceCode}: ${referenceCode}`,
            `LOCATION:${unit.name}`, 'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');
        const iLink = `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
        
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

    return (
        <div className={`bg-[var(--color-surface)] p-8 ${themeProps.radiusClass} ${themeProps.shadowClass} border border-gray-100 text-center`}>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>{t.step3Title}</h2>
            <p className="text-[var(--color-text-primary)] mt-4">{t.step3Body}</p>
            <p className="text-sm text-gray-500 mt-2">{t.emailConfirmationSent}</p>
            
            {submittedData && (
                 <div className="mt-6 text-left bg-gray-50 p-4 rounded-lg border">
                    <h3 className="font-bold text-center mb-3">{t.step3Details}</h3>
                    <p><strong>{t.referenceCode}:</strong> <span className="font-mono bg-gray-200 px-2 py-1 rounded">{submittedData.referenceCode.substring(0, 8).toUpperCase()}</span></p>
                    <p><strong>{t.name}:</strong> {submittedData.name}</p>
                    <p><strong>{t.headcount}:</strong> {submittedData.headcount}</p>
                    <p><strong>{t.date}:</strong> {submittedData.date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p><strong>{t.startTime}:</strong> {submittedData.startTime.toDate().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</p>
                    <p><strong>{t.email}:</strong> {submittedData.contact.email}</p>
                    <p><strong>{t.phone}:</strong> {submittedData.contact?.phoneE164 ? maskPhone(submittedData.contact.phoneE164) : 'N/A'}</p>
                     {Object.entries(submittedData.customData || {}).map(([key, value]) => {
                        const field = settings.guestForm?.customSelects?.find(f => f.id === key);
                        if (!field || !value) return null;
                        return <p key={key}><strong>{field.label}:</strong> {value as string}</p>;
                    })}
                 </div>
            )}
            
            <div className="mt-6 text-left bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold mb-2">{t.manageLinkTitle}</h3>
                <p className="text-sm text-blue-800 mb-2">{t.manageLinkBody}</p>
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg border">
                   <input type="text" value={manageLink} readOnly className="w-full bg-transparent text-sm text-gray-700 focus:outline-none"/>
                   <button onClick={handleCopy} className="bg-blue-600 text-white font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 whitespace-nowrap flex items-center gap-1.5">
                        <CopyIcon className="h-4 w-4"/>
                        {copied ? t.copied : t.copy}
                   </button>
                </div>
            </div>

            <div className="mt-6">
                <h3 className="font-semibold mb-3">{t.addToCalendar}</h3>
                <div className="flex justify-center gap-4">
                    <a href={googleLink} target="_blank" rel="noopener noreferrer" className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5"/> {t.googleCalendar}
                    </a>
                     <a href={icsLink} download={`${unit.name}-reservation.ics`} className="bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5"/> {t.otherCalendar}
                    </a>
                </div>
            </div>

            <button onClick={onReset} className={`mt-8 text-white font-bold py-3 px-6 ${themeProps.radiusClass}`} style={{ backgroundColor: 'var(--color-primary)' }}>{t.newBooking}</button>
        </div>
    );
}

export default ReservationPage;