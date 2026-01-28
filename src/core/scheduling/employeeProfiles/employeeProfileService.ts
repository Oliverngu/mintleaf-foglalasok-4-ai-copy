import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { db, serverTimestamp } from '../../firebase/config.js';
import type { EmployeeProfileV1 } from './types.js';

const COLLECTION_ROOT = 'units';
const SUBCOLLECTION = 'employeeProfiles';

export const getEmployeeProfile = async (
  unitId: string,
  userId: string
): Promise<EmployeeProfileV1 | null> => {
  const ref = doc(db, COLLECTION_ROOT, unitId, SUBCOLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as EmployeeProfileV1;
};

export const listEmployeeProfiles = async (
  unitId: string
): Promise<EmployeeProfileV1[]> => {
  const ref = collection(db, COLLECTION_ROOT, unitId, SUBCOLLECTION);
  const snap = await getDocs(ref);
  return snap.docs.map(docSnap => {
    const data = docSnap.data() as EmployeeProfileV1;
    return { ...data, userId: data.userId || docSnap.id };
  });
};

export const subscribeEmployeeProfiles = (
  unitId: string,
  onChange: (profiles: EmployeeProfileV1[]) => void
): (() => void) => {
  const ref = collection(db, COLLECTION_ROOT, unitId, SUBCOLLECTION);
  return onSnapshot(ref, snapshot => {
    const items = snapshot.docs.map(docSnap => {
      const data = docSnap.data() as EmployeeProfileV1;
      return { ...data, userId: data.userId || docSnap.id };
    });
    onChange(items);
  });
};

export const upsertEmployeeProfile = async (
  unitId: string,
  userId: string,
  profile: Partial<EmployeeProfileV1>
): Promise<void> => {
  const ref = doc(db, COLLECTION_ROOT, unitId, SUBCOLLECTION, userId);
  await setDoc(
    ref,
    {
      ...profile,
      unitId,
      userId,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};
