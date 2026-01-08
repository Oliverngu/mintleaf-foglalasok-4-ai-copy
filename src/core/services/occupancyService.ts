import { collection, getDocs, query, where } from 'firebase/firestore';
import { Timestamp, db } from '../firebase/config';
import { getSeatingSettings } from './seatingAdminService';

const defaultBufferMinutes = 15;

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date) =>
  startA < endB && startB < endA;

export const getTableOccupancy = async (
  unitId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string
): Promise<Set<string>> => {
  const settings = await getSeatingSettings(unitId, { createIfMissing: false });
  const bufferMinutes = settings.bufferMinutes ?? defaultBufferMinutes;
  const bufferMillis = bufferMinutes * 60 * 1000;

  const startWithBuffer = new Date(start.getTime() - bufferMillis);
  const endWithBuffer = new Date(end.getTime() + bufferMillis);
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const nextMonthStart = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  const snapshot = await getDocs(
    query(
      collection(db, 'units', unitId, 'reservations'),
      where('startTime', '>=', Timestamp.fromDate(monthStart)),
      where('startTime', '<', Timestamp.fromDate(nextMonthStart))
    )
  );

  const occupied = new Set<string>();
  snapshot.docs.forEach(docSnap => {
    if (excludeBookingId && docSnap.id === excludeBookingId) {
      return;
    }
    const data = docSnap.data();
    if (data.status === 'cancelled') {
      return;
    }
    const bookingStart = data.startTime?.toDate?.();
    const bookingEnd = data.endTime?.toDate?.();
    if (!bookingStart || !bookingEnd) {
      return;
    }
    if (overlaps(startWithBuffer, endWithBuffer, bookingStart, bookingEnd)) {
      const tables = data.assignedTableIds ?? [];
      tables.forEach((tableId: string) => occupied.add(tableId));
    }
  });

  return occupied;
};
