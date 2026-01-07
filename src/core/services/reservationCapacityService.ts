import { addDoc, collection, doc, runTransaction } from 'firebase/firestore';
import { db, serverTimestamp } from '../firebase/config';

export type OverrideDailyCapacityResult = {
  status: 'UPDATED' | 'OVERBOOKED';
  count: number;
  limit: number;
};

export type CapacityOverrideActor = {
  id: string;
  name: string;
};

export const overrideDailyCapacity = async (
  unitId: string,
  dateKey: string,
  newLimit: number,
  actor: CapacityOverrideActor
): Promise<OverrideDailyCapacityResult> => {
  const capacityRef = doc(db, 'units', unitId, 'reservation_capacity', dateKey);

  const result = await runTransaction(db, async (transaction) => {
    const capacitySnap = await transaction.get(capacityRef);
    const count = capacitySnap.exists()
      ? (capacitySnap.data().count as number) || 0
      : 0;

    if (capacitySnap.exists()) {
      transaction.update(capacityRef, {
        limit: newLimit,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(capacityRef, {
        date: dateKey,
        count: 0,
        limit: newLimit,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      status: newLimit < count ? 'OVERBOOKED' : 'UPDATED',
      count,
      limit: newLimit,
    } as OverrideDailyCapacityResult;
  });

  try {
    const logsRef = collection(db, 'units', unitId, 'reservation_logs');
    await addDoc(logsRef, {
      type: 'capacity_override',
      unitId,
      createdAt: serverTimestamp(),
      createdByUserId: actor.id,
      createdByName: actor.name,
      source: 'internal',
      message: `Daily capacity changed to ${newLimit}.`,
      date: dateKey,
    });
  } catch (logErr) {
    console.error('Failed to log capacity override', logErr);
  }

  return result;
};
