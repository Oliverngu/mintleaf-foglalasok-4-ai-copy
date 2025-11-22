import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Booking, ReservationSetting } from '../../../core/models/data';
import { db, serverTimestamp } from '../../../core/firebase/config';
import { doc, updateDoc, getDoc, addDoc, collection } from 'firebase/firestore';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import { translations } from '../../../lib/i18n';
import CalendarIcon from '../../../../components/icons/CalendarIcon';
import { sendEmail } from '../../../core/api/emailGateway';
import {
    getAdminRecipientsOverride,
    resolveEmailTemplate,
    shouldSendEmail,
} from '../../../core/api/emailSettingsService';

type Locale = 'hu' | 'en';

interface ManageReservationPageProps {
    token: string;
    allUnits: Unit[];
}

const ManageReservationPage: React.FC<ManageReservationPageProps> = ({ token, allUnits }) => {
    const [booking, setBooking] = useState<Booking | null>(null);
    const [unit, setUnit] = useState<Unit | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [locale, setLocale] = useState<Locale>('hu');
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [adminToken, setAdminToken] = useState<string | null>(null);
    const [adminAction, setAdminAction] = useState<'approve' | 'reject' | null>(null);
    const [actionMessage, setActionMessage] = useState('');
    const [actionError, setActionError] = useState('');
    const [isProcessingAction, setIsProcessingAction] = useState(false);
    const [reservationSettings, setReservationSettings] = useState<ReservationSetting | null>(null);

    const formatBookingDate = (date: Date, loc: Locale) =>
        date.toLocaleDateString(loc, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const formatBookingTime = (date: Date, loc: Locale) =>
        date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });

    const ensureReservationSettings = async (): Promise<ReservationSetting | null> => {
        if (reservationSettings || !unit) return reservationSettings || null;

        try {
            const settingsSnap = await getDoc(doc(db, 'reservation_settings', unit.id));
            if (settingsSnap.exists()) {
                const loaded = { id: unit.id, ...(settingsSnap.data() as ReservationSetting) };
                setReservationSettings(loaded);
                return loaded;
            }
        } catch (err) {
            console.error('Failed to fetch reservation settings on demand', err);
        }

        return null;
    };

    const buildCommonEmailPayload = () => {
        if (!booking || !unit) return null;
        const start = booking.startTime.toDate();
        const end = booking.endTime?.toDate ? booking.endTime.toDate() : null;
        const bookingDate = formatBookingDate(start, locale);
        const bookingTimeFrom = formatBookingTime(start, locale);
        const bookingTimeTo = end ? ` – ${formatBookingTime(end, locale)}` : '';

        const guestEmail = booking.contact?.email || (booking as any).email || '';

        return {
            unitName: unit.name,
            guestName: booking.name,
            bookingDate,
            bookingTimeFrom,
            bookingTimeTo,
            headcount: booking.headcount,
            guestEmail,
            guestPhone: booking.contact?.phoneE164 || '',
            bookingRef: booking.referenceCode?.substring(0, 8).toUpperCase() || '',
        };
    };

    const sendGuestDecisionEmail = async (decision: 'approve' | 'reject') => {
        if (!booking || !unit) return;
        const guestEmail = booking?.contact?.email || (booking as any)?.email;
        if (!guestEmail) {
            console.warn('Skipping guest decision email: missing guest email on booking', booking?.id);
            return;
        }
        try {
            const canSend = await shouldSendEmail('booking_status_updated_guest', unit.id);
            if (!canSend) {
                console.warn('Email type disabled, but sending guest decision email as critical flow');
            }

            const basePayload = buildCommonEmailPayload();
            if (!basePayload) return;

            const decisionLabel =
                decision === 'approve' ? translations[locale].decisionApprovedLabel : translations[locale].decisionRejectedLabel;

            const payload = {
                ...basePayload,
                decisionLabel,
            };
            let subject = '';
            let html = '';

            try {
                const rendered = await resolveEmailTemplate(unit.id, 'booking_status_updated_guest', payload);
                subject = rendered.subject;
                html = rendered.html;
            } catch (templateErr) {
                console.warn('Falling back to inline template for guest decision email', templateErr);
                subject = `Foglalás frissítve: ${payload.bookingDate} ${payload.bookingTimeFrom}${payload.bookingTimeTo}`;
                html = `
                    <h2>Foglalás frissítése</h2>
                    <p>Kedves ${payload.guestName || 'Vendég'}!</p>
                    <p>A(z) <strong>${payload.unitName}</strong> egységnél leadott foglalásod státusza frissült.</p>
                    <ul>
                        <li><strong>Dátum:</strong> ${payload.bookingDate}</li>
                        <li><strong>Időpont:</strong> ${payload.bookingTimeFrom}${payload.bookingTimeTo}</li>
                        <li><strong>Létszám:</strong> ${payload.headcount} fő</li>
                        <li><strong>Döntés:</strong> ${payload.decisionLabel}</li>
                    </ul>
                    <p>Hivatkozási kód: <strong>${payload.bookingRef || ''}</strong></p>
                `;
            }

            await sendEmail({
                typeId: 'booking_status_updated_guest',
                unitId: unit.id,
                to: guestEmail,
                subject,
                html,
                payload,
            });
        } catch (err) {
            console.error('Failed to send guest decision email:', err);
        }
    };

    const notifyAdminCancellation = async () => {
        if (!booking || !unit) return;
        try {
            const loadedSettings = await ensureReservationSettings();
            const canSend = await shouldSendEmail('booking_cancelled_admin', unit.id);
            if (!canSend) {
                console.warn('Email type disabled, but sending admin cancellation alert as critical flow');
            }

            const fallbackLegacy = loadedSettings?.notificationEmails || [];
            const cancellationRecipients = await getAdminRecipientsOverride(
                unit.id,
                'booking_cancelled_admin',
                fallbackLegacy
            );
            const bookingCreatedRecipients = await getAdminRecipientsOverride(
                unit.id,
                'booking_created_admin',
                fallbackLegacy
            );
            const recipients = Array.from(new Set([...(cancellationRecipients || []), ...(bookingCreatedRecipients || [])]));
            if (!recipients || recipients.length === 0) {
                console.warn('Skipping admin cancellation alert: no admin recipients configured');
                return;
            }

            const payload = buildCommonEmailPayload();
            if (!payload) return;
            let subject = '';
            let html = '';

            try {
                const rendered = await resolveEmailTemplate(unit.id, 'booking_cancelled_admin', payload);
                subject = rendered.subject;
                html = rendered.html;
            } catch (templateErr) {
                console.warn('Falling back to inline template for admin cancellation alert', templateErr);
                subject = `Foglalás lemondva: ${payload.bookingDate} ${payload.bookingTimeFrom}${payload.bookingTimeTo}`;
                html = `
                    <h2>Vendég lemondta a foglalást</h2>
                    <p>Egység: <strong>${payload.unitName}</strong></p>
                    <ul>
                        <li><strong>Vendég neve:</strong> ${payload.guestName}</li>
                        <li><strong>Dátum:</strong> ${payload.bookingDate}</li>
                        <li><strong>Időpont:</strong> ${payload.bookingTimeFrom}${payload.bookingTimeTo}</li>
                        <li><strong>Létszám:</strong> ${payload.headcount} fő</li>
                        <li><strong>Email:</strong> ${payload.guestEmail}</li>
                        <li><strong>Telefon:</strong> ${payload.guestPhone}</li>
                    </ul>
                    <p>Hivatkozási kód: <strong>${payload.bookingRef || ''}</strong></p>
                `;
            }

            await Promise.all(
                recipients.map((to) =>
                    sendEmail({
                        typeId: 'booking_cancelled_admin',
                        unitId: unit.id,
                        to,
                        subject,
                        html,
                        payload,
                    })
                )
            );
        } catch (err) {
            console.error('Failed to notify admin about cancellation:', err);
        }
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

    useEffect(() => {
        const fetchBooking = async () => {
            setLoading(true);
            setReservationSettings(null);
            try {
                let foundBooking: Booking | null = null;
                let foundUnit: Unit | null = null;

                for (const unit of allUnits) {
                    const bookingRef = doc(db, 'units', unit.id, 'reservations', token);
                    const bookingSnap = await getDoc(bookingRef);
                    if (bookingSnap.exists()) {
                        foundBooking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
                        foundUnit = unit;

                        const settingsSnap = await getDoc(doc(db, 'reservation_settings', unit.id));
                        if (settingsSnap.exists()) {
                            setReservationSettings({ id: unit.id, ...(settingsSnap.data() as ReservationSetting) });
                        }
                        break;
                    }
                }

                if (!foundBooking) {
                    setError('A foglalás nem található.');
                } else {
                    setBooking(foundBooking);
                    setUnit(foundUnit);

                    const urlParams = new URLSearchParams(window.location.search);
                    const langOverride = urlParams.get('lang');
                    if (langOverride === 'en' || langOverride === 'hu') {
                        setLocale(langOverride);
                    } else {
                        setLocale(foundBooking.locale || 'hu');
                    }
                }
            } catch (err: any) {
                console.error("Error fetching reservation:", err);
                setError('Hiba a foglalás betöltésekor. Ellenőrizze a linket, vagy próbálja meg később.');
            } finally {
                setLoading(false);
            }
        };

        if (allUnits.length > 0) {
            fetchBooking();
        }
    }, [token, allUnits]);

    const handleCancelReservation = async () => {
        if (!booking || !unit) return;
        try {
            const reservationRef = doc(db, 'units', unit.id, 'reservations', booking.id);
            await updateDoc(reservationRef, {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                cancelledBy: 'guest',
            });

            try {
                const logsRef = collection(db, 'units', unit.id, 'reservation_logs');
                await addDoc(logsRef, {
                    bookingId: booking.id,
                    unitId: unit.id,
                    type: 'cancelled',
                    createdAt: serverTimestamp(),
                    createdByUserId: null,
                    createdByName: booking.name,
                    source: 'guest',
                    message: 'Vendég lemondta a foglalást a vendégportálon.',
                });
            } catch (logErr) {
                console.error('Failed to log guest cancellation', logErr);
            }

            await notifyAdminCancellation();

            setBooking(prev => prev ? ({ ...prev, status: 'cancelled' }) : null);
            setIsCancelModalOpen(false);
        } catch(err) {
            console.error("Error cancelling reservation:", err);
            setError("Hiba a lemondás során.");
        }
    };

    const writeDecisionLog = async (
        status: 'confirmed' | 'cancelled'
    ) => {
        if (!booking || !unit) return;
        try {
            const logsRef = collection(db, 'units', unit.id, 'reservation_logs');
            await addDoc(logsRef, {
                bookingId: booking.id,
                unitId: unit.id,
                type: status === 'confirmed' ? 'updated' : 'cancelled',
                createdAt: serverTimestamp(),
                createdByUserId: null,
                createdByName: 'Email jóváhagyás',
                source: 'internal',
                message:
                    status === 'confirmed'
                        ? 'Foglalás jóváhagyva e-mailből'
                        : 'Foglalás elutasítva e-mailből',
            });
        } catch (logErr) {
            console.error('Failed to write admin decision log', logErr);
        }
    };

    const handleAdminDecision = async (decision: 'approve' | 'reject') => {
        if (!booking || !unit) return;
        if (!adminToken || booking.adminActionToken !== adminToken) {
            setActionError(t.invalidAdminToken);
            return;
        }
        setIsProcessingAction(true);
        setActionError('');
        try {
            const nextStatus = decision === 'approve' ? 'confirmed' : 'cancelled';
            const reservationRef = doc(db, 'units', unit.id, 'reservations', booking.id);
            const update: Record<string, any> = {
                status: nextStatus,
                adminActionHandledAt: serverTimestamp(),
                adminActionSource: 'email',
            };
            if (nextStatus === 'cancelled') {
                update.cancelledBy = 'admin';
            }
            await updateDoc(reservationRef, update);
            await writeDecisionLog(nextStatus);

            await sendGuestDecisionEmail(decision);

            setBooking(prev => (prev ? { ...prev, status: nextStatus } : null));
            setActionMessage(
                decision === 'approve' ? t.reservationApproved : t.reservationRejected
            );
        } catch (actionErr) {
            console.error('Error handling admin decision:', actionErr);
            setActionError(t.actionFailed);
        } finally {
            setIsProcessingAction(false);
        }
    };

    const t = translations[locale];

    useEffect(() => {
        if (
            booking &&
            booking.status === 'pending' &&
            adminAction &&
            adminToken &&
            booking.adminActionToken === adminToken
        ) {
            handleAdminDecision(adminAction);
        }
    }, [booking, adminAction, adminToken]);
    
    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><LoadingSpinner /></div>;
    if (error) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-center"><div className="bg-white p-8 rounded-lg shadow-md"><h2 className="text-xl font-bold text-red-600">Hiba</h2><p className="text-gray-800 mt-2">{error}</p></div></div>;
    if (!booking || !unit) return null;
    
    const getStatusChip = (status: Booking['status']) => {
        const styles = {
            pending: 'bg-yellow-100 text-yellow-800',
            confirmed: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800',
        };
        const text = t[`status_${status}`] || status;
        return <span className={`px-3 py-1 text-sm font-bold rounded-full ${styles[status]}`}>{text}</span>
    }

    const maskPhone = (phoneE164: string): string => {
        if (!phoneE164 || phoneE164.length < 10) return phoneE164;
        const last4 = phoneE164.slice(-4);
        return phoneE164.slice(0, -7) + '••• •' + last4;
    };


    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center p-4 sm:p-6 md:p-8">
            <header className="text-center mb-8 mt-8">
                <h1 className="text-4xl font-bold text-gray-800">{unit.name}</h1>
                <p className="text-lg text-gray-500 mt-1">{t.manageTitle}</p>
            </header>
            
            <main className="w-full max-w-2xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
                <div className="flex justify-between items-center mb-6 pb-4 border-b">
                    <h2 className="text-2xl font-semibold text-gray-800">{t.reservationDetails}</h2>
                    {getStatusChip(booking.status)}
                </div>

                <div className="space-y-3 text-gray-700">
                    <p><strong>{t.referenceCode}:</strong> <span className="font-mono bg-gray-200 px-2 py-1 rounded text-sm">{booking.referenceCode?.substring(0, 8).toUpperCase()}</span></p>
                    <p><strong>{t.name}:</strong> {booking.name}</p>
                    <p><strong>{t.headcount}:</strong> {booking.headcount}</p>
                    <p><strong>{t.date}:</strong> {booking.startTime.toDate().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p><strong>{t.startTime}:</strong> {booking.startTime.toDate().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</p>
                    <p><strong>{t.email}:</strong> {booking.contact?.email}</p>
                    <p><strong>{t.phone}:</strong> {booking.contact?.phoneE164 ? maskPhone(booking.contact.phoneE164) : 'N/A'}</p>
                </div>

                {booking.status === 'pending' && (
                    <div className="mt-6 p-4 border rounded-xl bg-yellow-50 text-yellow-900">
                        <p className="font-semibold">{t.pendingApproval}</p>
                        <p className="text-sm mt-1">{t.pendingApprovalHint}</p>
                    </div>
                )}

                {booking.status === 'pending' && adminToken && booking.adminActionToken !== adminToken && (
                    <div className="mt-4 p-3 border border-red-200 rounded-lg bg-red-50 text-red-800 text-sm">
                        {t.invalidAdminToken}
                    </div>
                )}

                {booking.status === 'pending' && adminToken && booking.adminActionToken === adminToken && (
                    <div className="mt-6 p-4 border rounded-xl bg-green-50 text-green-900 space-y-3">
                        <p className="font-semibold">{t.adminActionTitle}</p>
                        {actionMessage && (
                            <p className="text-sm text-green-800 bg-white/60 p-2 rounded-md border border-green-200">{actionMessage}</p>
                        )}
                        {actionError && (
                            <p className="text-sm text-red-700 bg-white/60 p-2 rounded-md border border-red-200">{actionError}</p>
                        )}
                        {!actionMessage && (
                            <div className="flex flex-col sm:flex-row gap-3">
                                <button
                                    onClick={() => handleAdminDecision('approve')}
                                    className="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-60"
                                    disabled={isProcessingAction}
                                >
                                    {t.adminApprove}
                                </button>
                                <button
                                    onClick={() => handleAdminDecision('reject')}
                                    className="flex-1 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 disabled:opacity-60"
                                    disabled={isProcessingAction}
                                >
                                    {t.adminReject}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                
                {booking.status !== 'cancelled' ? (
                    <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row gap-4">
                        <button disabled className="w-full bg-gray-300 text-gray-500 font-bold py-3 px-6 rounded-lg cursor-not-allowed">
                            {t.modifyReservation}
                        </button>
                        <button onClick={() => setIsCancelModalOpen(true)} className="w-full bg-red-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-red-700">
                            {t.cancelReservation}
                        </button>
                    </div>
                ) : (
                    <div className="mt-8 pt-6 border-t text-center">
                        <p className="text-lg font-semibold text-red-700">{t.reservationCancelledSuccess}</p>
                    </div>
                )}
            </main>

            {isCancelModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
                        <h2 className="text-xl font-bold text-gray-800">{t.areYouSureCancel}</h2>
                        <p className="text-gray-600 my-4">{t.cancelConfirmationBody}</p>
                        <div className="flex justify-center gap-4">
                            <button onClick={() => setIsCancelModalOpen(false)} className="bg-gray-200 text-gray-800 font-bold py-2 px-6 rounded-lg hover:bg-gray-300">{t.noKeep}</button>
                            <button onClick={handleCancelReservation} className="bg-red-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-red-700">{t.yesCancel}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageReservationPage;