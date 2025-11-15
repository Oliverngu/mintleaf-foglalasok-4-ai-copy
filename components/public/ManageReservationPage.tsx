import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Booking } from '../../data/mockData';
import { db, serverTimestamp } from '../../firebase/config';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import LoadingSpinner from '../LoadingSpinner';
import { translations } from '../../lib/i18n';
import CalendarIcon from '../icons/CalendarIcon';

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

    useEffect(() => {
        const fetchBooking = async () => {
            setLoading(true);
            try {
                let foundBooking: Booking | null = null;
                let foundUnit: Unit | null = null;

                for (const unit of allUnits) {
                    const bookingRef = doc(db, 'units', unit.id, 'reservations', token);
                    const bookingSnap = await getDoc(bookingRef);
                    if (bookingSnap.exists()) {
                        foundBooking = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;
                        foundUnit = unit;
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
            });
            setBooking(prev => prev ? ({ ...prev, status: 'cancelled' }) : null);
            setIsCancelModalOpen(false);
        } catch(err) {
            console.error("Error cancelling reservation:", err);
            setError("Hiba a lemondás során.");
        }
    };

    const t = translations[locale];
    
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