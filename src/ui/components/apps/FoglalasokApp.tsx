import React, { useState, useMemo, useEffect } from 'react';
import { Booking, User, Unit } from '../../../core/models/data';
import { db, Timestamp, serverTimestamp } from '../../../core/firebase/config';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  limit,
} from 'firebase/firestore';
import BookingIcon from '../../../../components/icons/BookingIcon';
import LoadingSpinner from '../../../../components/LoadingSpinner';
import AddBookingModal from './AddBookingModal';
import PlusIcon from '../../../../components/icons/PlusIcon';
import SettingsIcon from '../../../../components/icons/SettingsIcon';
import ReservationSettingsModal from './ReservationSettingsModal';
import TrashIcon from '../../../../components/icons/TrashIcon';

// --- LOG TÍPUS HELYBEN (ha van központi, lehet oda áttenni) ---
type BookingLogType = 'created' | 'cancelled' | 'updated' | 'guest_created' | 'guest_cancelled';

interface BookingLog {
  id: string;
  bookingId: string;
  unitId: string;
  type: BookingLogType;
  createdAt: Timestamp | null;
  createdByUserId?: string | null;
  createdByName?: string | null;
  source?: 'internal' | 'guest';
  message: string;
}

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
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-xl w-full max-w-md"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">Foglalás törlése</h2>
        </div>
        <div className="p-6 space-y-4">
          <p>
            Biztosan törlöd a(z) <span className="font-bold">{booking.name}</span> nevű
            foglalást erre a napra:{' '}
            <span className="font-bold">
              {booking.startTime.toDate().toLocaleDateString('hu-HU')}
            </span>
            ? A művelet nem vonható vissza.
          </p>
          <div>
            <label
              htmlFor="cancelReason"
              className="text-sm font-medium text-[var(--color-text-main)]"
            >
              Indoklás (opcionális)
            </label>
            <textarea
              id="cancelReason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full mt-1 p-2 border rounded-lg"
              placeholder="Pl. vendég lemondta, dupla foglalás..."
            />
          </div>
        </div>
        <div className="p-4 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 px-4 py-2 rounded-lg font-semibold"
          >
            Mégse
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700"
          >
            Törlés
          </button>
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
        className="rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold text-[var(--color-text-main)]">
            {selectedDate.toLocaleDateString('hu-HU', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {bookings.length > 0 ? (
            bookings
              .sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis())
              .map(booking => (
                <div
                  key={booking.id}
                  className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative group"
                  style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                >
                  <p className="font-bold text-[var(--color-text-main)]">
                    {booking.name} ({booking.headcount} fő)
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                    {booking.startTime
                      .toDate()
                      .toLocaleTimeString('hu-HU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                    -{' '}
                    {booking.endTime.toDate().toLocaleTimeString('hu-HU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    Alkalom: {booking.occasion}
                  </p>
                  {booking.notes && (
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      Megjegyzés: {booking.notes}
                    </p>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => onDelete(booking)}
                      className="absolute top-3 right-3 p-2 text-gray-400 rounded-full opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-secondary)',
                        opacity: 0.85,
                      }}
                      title="Foglalás törlése"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              ))
          ) : (
            <p className="text-[var(--color-text-secondary)]">Erre a napra nincsenek foglalások.</p>
          )}
        </div>
      </div>
    </div>
  );
};

// --- LOG LISTA KOMPONENS ---
const LogsPanel: React.FC<{ logs: BookingLog[] }> = ({ logs }) => {
  if (!logs.length) {
    return (
      <div
        className="mt-6 rounded-2xl shadow border border-gray-100 p-4 text-sm"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
      >
        Nincsenek még naplóbejegyzések.
      </div>
    );
  }

  const getDotClass = (log: BookingLog) => {
    if (log.type === 'cancelled' || log.type === 'guest_cancelled') {
      // piros – törlés / lemondás
      return 'bg-red-500';
    }
    if (log.type === 'guest_created') {
      // zöld – vendég foglalta
      return 'bg-green-500';
    }
    // kék – admin / belső
    return 'bg-blue-500';
  };

  return (
    <div
      className="mt-6 rounded-2xl shadow border border-gray-100 p-4"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
    >
      <h2 className="text-lg font-bold text-[var(--color-text-main)] mb-3">Foglalási napló</h2>
      <div className="space-y-2 max-h-72 overflow-y-auto text-sm">
        {logs.map(log => {
          const created =
            log.createdAt?.toDate?.()?.toLocaleString('hu-HU', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }) ?? '—';

          const dotClass = getDotClass(log);

          return (
            <div
              key={log.id}
              className="flex flex-col border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
            >
              <div className="flex justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${dotClass}`}
                  />
                  <span className="font-medium text-[var(--color-text-main)]">
                    {log.message}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-secondary)] shrink-0">
                  {created}
                </span>
              </div>
              {log.createdByName && (
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {log.createdByName} ({log.source === 'guest' ? 'vendég' : 'belső'})
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FoglalasokApp: React.FC<FoglalasokAppProps> = ({
  currentUser,
  canAddBookings,
  allUnits,
  activeUnitIds,
}) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logs, setLogs] = useState<BookingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<Booking | null>(null);

  const activeUnitId = activeUnitIds.length === 1 ? activeUnitIds[0] : null;
  const isAdmin =
    currentUser.role === 'Admin' || currentUser.role === 'Unit Admin';

  useEffect(() => {
    if (!activeUnitId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );

    const qBookings = query(
      collection(db, 'units', activeUnitId, 'reservations'),
      where('startTime', '>=', Timestamp.fromDate(startOfMonth)),
      where('startTime', '<=', Timestamp.fromDate(endOfMonth)),
      orderBy('startTime', 'asc')
    );

    const unsubscribeBookings = onSnapshot(
      qBookings,
      snapshot => {
        const fetchedBookings = snapshot.docs.map(
          d => ({ id: d.id, ...d.data() } as Booking)
        );
        setBookings(fetchedBookings);
        setLoading(false);
      },
      err => {
        console.error('Error fetching bookings:', err);
        setError('Hiba a foglalások lekérésekor.');
        setLoading(false);
      }
    );

    return () => unsubscribeBookings();
  }, [activeUnitId, currentDate]);

  // --- LOGOK FELIRATKOZÁS ---
  useEffect(() => {
    if (!activeUnitId) {
      setLogs([]);
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);

    const logsRef = collection(db, 'units', activeUnitId, 'reservation_logs');
    const qLogs = query(logsRef, orderBy('createdAt', 'desc'), limit(50));

    const unsubLogs = onSnapshot(
      qLogs,
      snapshot => {
        const fetchedLogs = snapshot.docs.map(
          d => ({ id: d.id, ...d.data() } as BookingLog)
        );
        setLogs(fetchedLogs);
        setLogsLoading(false);
      },
      err => {
        console.error('Error fetching reservation logs:', err);
        setLogsLoading(false);
      }
    );

    return () => unsubLogs();
  }, [activeUnitId]);

  const toLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    bookings
      .filter(b => b.status !== 'cancelled')
      .forEach(booking => {
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
          <h2 className="text-2xl font-bold text-[var(--color-text-main)]">
            A funkció használatához válassz egy egységet
          </h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            A foglalási rendszer megtekintéséhez és kezeléséhez, kérjük, válassz ki
            pontosan egy egységet a fejlécben.
          </p>
        </div>
      </div>
    );
  }

  const writeLog = async (
    unitId: string,
    booking: { id: string; name: string; headcount?: number; startTime?: Timestamp },
    type: BookingLogType,
    extraMessage?: string
  ) => {
    const logsRef = collection(db, 'units', unitId, 'reservation_logs');

    let baseMessage = '';
    const dateStr = booking.startTime
      ? booking.startTime
          .toDate()
          .toLocaleString('hu-HU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
      : '';

    switch (type) {
      case 'created':
        baseMessage = `Új foglalás létrehozva: ${booking.name} (${booking.headcount ?? '-'} fő, ${dateStr})`;
        break;
      case 'cancelled':
        baseMessage = `Foglalás lemondva/törölve: ${booking.name} (${dateStr})`;
        break;
      case 'updated':
        baseMessage = `Foglalás módosítva: ${booking.name}`;
        break;
      case 'guest_created':
        baseMessage = `Vendég foglalást adott le: ${booking.name} (${booking.headcount ?? '-'} fő, ${dateStr})`;
        break;
      case 'guest_cancelled':
        baseMessage = `Vendég lemondta a foglalást: ${booking.name} (${dateStr})`;
        break;
    }

    const message = extraMessage ? `${baseMessage} – ${extraMessage}` : baseMessage;

    await addDoc(logsRef, {
      bookingId: booking.id,
      unitId,
      type,
      createdAt: serverTimestamp(),
      createdByUserId: currentUser.id,
      createdByName: currentUser.displayName ?? currentUser.name ?? 'Ismeretlen felhasználó',
      source: 'internal',
      message,
    });
  };

  const handleAddBooking = async (bookingData: Omit<Booking, 'id'>) => {
    if (!activeUnitId) return;
    const ref = await addDoc(
      collection(db, 'units', activeUnitId, 'reservations'),
      bookingData
    );
    // LOG: user által létrehozott foglalás
    await writeLog(
      activeUnitId,
      {
        id: ref.id,
        name: bookingData.name,
        headcount: bookingData.headcount,
        startTime: bookingData.startTime,
      },
      'created'
    );
    setIsAddModalOpen(false);
  };

  const handleConfirmDelete = async (reason: string) => {
    if (!bookingToDelete || !activeUnitId) return;
    try {
      await updateDoc(
        doc(db, 'units', activeUnitId, 'reservations', bookingToDelete.id),
        {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelReason: reason || '',
          cancelledBy: 'admin',
        }
      );

      // LOG: foglalás törlés
      await writeLog(
        activeUnitId,
        {
          id: bookingToDelete.id,
          name: bookingToDelete.name,
          headcount: bookingToDelete.headcount,
          startTime: bookingToDelete.startTime,
        },
        'cancelled',
        reason ? `Indoklás: ${reason}` : undefined
      );

      setBookingToDelete(null);
    } catch (err) {
      console.error('Error deleting booking:', err);
      alert('Hiba a foglalás törlésekor.');
    }
  };

  const openGuestPage = () => {
    window.open(`/reserve?unit=${activeUnitId}`, '_blank');
  };

  const renderCalendar = () => {
    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
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
      <div
        className="p-6 rounded-2xl shadow-lg border border-gray-100"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-main)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
              )
            }
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Previous month"
          >
            &lt;
          </button>
          <h2 className="text-xl font-bold text-[var(--color-text-main)] capitalize">
            {currentDate.toLocaleDateString('hu-HU', {
              month: 'long',
              year: 'numeric',
            })}
          </h2>
          <button
            onClick={() =>
              setCurrentDate(
                new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
              )
            }
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Next month"
          >
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[var(--color-text-secondary)] text-sm mb-2">
          {['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map(day => (
            <div key={day}>{day}</div>
          ))}
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
                  ${
                    isCurrentMonth
                      ? 'cursor-pointer hover:bg-gray-100'
                      : 'text-gray-300'
                  }
                  ${isToday ? 'border-2 border-green-500' : 'border border-gray-200'}
                `}
              >
                <span
                  className={`font-bold ${
                    isToday ? 'text-green-600' : 'text-[var(--color-text-main)]'
                  }`}
                >
                  {date.getDate()}
                </span>
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
        <h1 className="text-3xl font-bold text-[var(--color-text-main)]">Foglalások</h1>
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
              className="p-2 rounded-full bg-gray-200 text-[var(--color-text-main)] hover:bg-gray-300"
              title="Foglalási beállítások"
            >
              <SettingsIcon className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="relative h-64">
          <LoadingSpinner />
        </div>
      )}
      {error && (
        <div
          className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-lg"
          role="alert"
        >
          <p className="font-bold">Hiba történt</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {renderCalendar()}
          {logsLoading ? (
            <div className="mt-6">
              <LoadingSpinner />
            </div>
          ) : (
            <LogsPanel logs={logs} />
          )}
        </>
      )}

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
          currentUser={currentUser}
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
