import React, { useState, useMemo, useEffect } from 'react';
import { Booking, User, Unit } from '../../data/mockData';
import { db, Timestamp, serverTimestamp } from '../../firebase/config';
import { collection, query, where, orderBy, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import BookingIcon from '../icons/BookingIcon';
import LoadingSpinner from '../LoadingSpinner';
import AddBookingModal from './AddBookingModal';
import PlusIcon from '../icons/PlusIcon';
import SettingsIcon from '../icons/SettingsIcon';
import ReservationSettingsModal from './ReservationSettingsModal';
import TrashIcon from '../icons/TrashIcon';

interface FoglalasokAppProps {
  currentUser: User;
  canAddBookings: boolean;
  allUnits: Unit[];
  activeUnitIds: string[];
}

const DeleteConfirmationModal: React.FC<{
  booking: Booking;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ booking, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Foglalás törlése</h2>
                </div>
                <div className="p-6 space-y-4">
                    <p>Biztosan törlöd a(z) <span className="font-bold">{booking.name}</span> nevű foglalást erre a napra: <span className="font-bold">{booking.startTime.toDate().toLocaleDateString('hu-HU')}</span>? A művelet nem vonható vissza.</p>
                    <div>
                        <label htmlFor="cancelReason" className="text-sm font-medium text-gray-700">Indoklás (opcionális)</label>
                        <textarea
                            id="cancelReason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            className="w-full mt-1 p-2 border rounded-lg"
                            placeholder="Pl. vendég lemondta, dupla foglalás..."
                        />
                    </div>
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                    <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg font-semibold">Mégse</button>
                    <button type="button" onClick={() => onConfirm(reason)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700">Törlés</button>
                </div>
            </div>
        </div>
    );
};

const BookingDetailsModal: React.FC<{
  selectedDate: Date;
  bookings: Booking[];
  onClose: () => void;
  isAdmin: boolean;
  onDelete: (booking: Booking) => void;
}> = ({ selectedDate, bookings, onClose, isAdmin, onDelete }) => {
  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">
            {selectedDate.toLocaleDateString('hu-HU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {bookings.length > 0 ? (
            bookings
              .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis())
              .map(booking => (
                <div key={booking.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative group">
                   <p className="font-bold text-gray-800">{booking.name} ({booking.headcount} fő)</p>
                   <p className="text-sm text-gray-600 font-semibold">
                     {booking.startTime.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })} - {booking.endTime.toDate().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
                   </p>
                   <p className="text-sm text-gray-500 mt-1">
                     Alkalom: {booking.occasion}
                   </p>
                   {booking.notes && <p className="text-sm text-gray-500 mt-1">Megjegyzés: {booking.notes}</p>}
                   {isAdmin && (
                        <button onClick={() => onDelete(booking)} className="absolute top-3 right-3 p-2 text-gray-400 bg-white/50 rounded-full opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-100 transition-opacity" title="Foglalás törlése">
                            <TrashIcon className="h-5 w-5" />
                        </button>
                   )}
                </div>
              ))
          ) : (
            <p className="text-gray-500">Erre a napra nincsenek foglalások.</p>
          )}
        </div>
      </div>
    </div>
  );
};


const FoglalasokApp: React.FC<FoglalasokAppProps> = ({ currentUser, canAddBookings, allUnits, activeUnitIds }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);

  const activeUnitId = activeUnitIds.length === 1 ? activeUnitIds[0] : null;
  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

  useEffect(() => {
    if (!activeUnitId) {
        setBookings([]);
        setLoading(false);
        return;
    }
    setLoading(true);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const q = query(
        collection(db, 'units', activeUnitId, 'reservations'),
        where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
        where('startTime', '<=', Timestamp.fromDate(endOfMonth)),
        orderBy('startTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
        const fetchedBookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
        setBookings(fetchedBookings);
        setLoading(false);
    }, err => {
        console.error("Error fetching bookings:", err);
        setError("Hiba a foglalások lekérésekor.");
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeUnitId, currentDate]);


  const toLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings.filter(b => b.status !== 'cancelled').forEach(booking => {
      const key = toLocalDateKey(booking.startTime.toDate());
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(booking);
    });
    return map;
  }, [bookings]);

  if (!activeUnitId) {
    return (
        <div className="flex items-center justify-center h-full p-8 text-center">
            <div>
                <BookingIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-700">A funkció használatához válassz egy egységet</h2>
                <p className="mt-2 text-gray-600">A foglalási rendszer megtekintéséhez és kezeléséhez, kérjük, válassz ki pontosan egy egységet a fejlécben.</p>
            </div>
        </div>
    );
  }
  
  const handleAddBooking = async (bookingData: Omit<Booking, 'id'>) => {
    await addDoc(collection(db, 'units', activeUnitId, 'reservations'), bookingData);
    setIsAddModalOpen(false);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!bookingToDelete) return;
    try {
        await updateDoc(doc(db, 'units', activeUnitId, 'reservations', bookingToDelete.id), {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancelReason: reason || '',
        });
        setBookingToDelete(null);
    } catch (err) {
        console.error("Error deleting booking:", err);
        alert("Hiba a foglalás törlésekor.");
    }
  };
  
  const openGuestPage = () => {
    window.open(`/reserve?unit=${activeUnitId}`, '_blank');
  }

  const renderCalendar = () => {
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const days = [];
    const startDayOfWeek = (startOfMonth.getDay() + 6) % 7;

    for (let i = 0; i < startDayOfWeek; i++) {
      const day = new Date(startOfMonth);
      day.setDate(day.getDate() - (startDayOfWeek - i));
      days.push({ date: day, isCurrentMonth: false });
    }
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      const day = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
      days.push({ date: day, isCurrentMonth: true });
    }
    const totalDays = days.length;
    const remainingCells = (totalDays > 35 ? 42 : 35) - totalDays;
    for (let i = 1; i <= remainingCells; i++) {
      const day = new Date(endOfMonth);
      day.setDate(day.getDate() + i);
      days.push({ date: day, isCurrentMonth: false });
    }

    const todayKey = toLocalDateKey(new Date());

    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Previous month"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-gray-800 capitalize">
            {currentDate.toLocaleDateString('hu-HU', { month: 'long', year: 'numeric' })}
          </h2>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-500 text-sm mb-2">
          {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(day => <div key={day}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(({ date, isCurrentMonth }, index) => {
            const dateKey = toLocalDateKey(date);
            const dailyBookings = bookingsByDate.get(dateKey) || [];
            const isToday = dateKey === todayKey;

            return (
              <div
                key={index}
                onClick={() => isCurrentMonth && setSelectedDate(date)}
                className={`
                  h-24 p-2 flex flex-col items-start rounded-lg transition-colors
                  ${isCurrentMonth ? 'cursor-pointer hover:bg-gray-100' : 'text-gray-300'}
                  ${isToday ? 'border-2 border-green-500' : 'border border-gray-200'}
                `}
              >
                <span className={`font-bold ${isToday ? 'text-green-600' : 'text-gray-800'}`}>{date.getDate()}</span>
                {isCurrentMonth && dailyBookings.length > 0 && (
                  <div className="mt-auto w-full text-left">
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                      {dailyBookings.length} foglalás
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Foglalások</h1>
        <div className="flex items-center gap-3">
             <button 
                onClick={openGuestPage}
                className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
                Vendégoldal megnyitása
            </button>
            {canAddBookings && (
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-green-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-800 flex items-center gap-2"
                >
                    <PlusIcon className="h-5 w-5" />
                    Új foglalás
                </button>
            )}
            {isAdmin && activeUnitId && (
                 <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Foglalási beállítások"
                >
                    <SettingsIcon className="h-6 w-6" />
                </button>
            )}
        </div>
      </div>

      {loading && <div className="relative h-64"><LoadingSpinner /></div>}
      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg" role="alert"><p className="font-bold">Hiba történt</p><p>{error}</p></div>}
      
      {!loading && !error && renderCalendar()}

      {selectedDate && (
        <BookingDetailsModal
          selectedDate={selectedDate}
          bookings={bookingsByDate.get(toLocalDateKey(selectedDate)) || []}
          onClose={() => setSelectedDate(null)}
          isAdmin={isAdmin}
          onDelete={setBookingToDelete}
        />
      )}
       {isAddModalOpen && (
        <AddBookingModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAddBooking={handleAddBooking}
          unitId={activeUnitId}
        />
      )}
       {isSettingsOpen && activeUnitId && (
        <ReservationSettingsModal
            unitId={activeUnitId}
            onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {bookingToDelete && (
        <DeleteConfirmationModal
            booking={bookingToDelete}
            onClose={() => setBookingToDelete(null)}
            onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};

export default FoglalasokApp;