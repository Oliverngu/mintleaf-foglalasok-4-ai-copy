import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import type { Scenario } from './types.js';

const COLLECTION_NAME = 'schedule_scenarios';

export const listScenarios = async (
  unitId: string,
  weekStartDate: string
): Promise<Scenario[]> => {
  const scenariosRef = collection(db, COLLECTION_NAME);
  const q = query(
    scenariosRef,
    where('unitId', '==', unitId),
    where('weekStartDate', '==', weekStartDate)
  );
  const snap = await getDocs(q);
  return snap.docs.map(docSnap => docSnap.data() as Scenario);
};

export const upsertScenario = async (scenario: Scenario): Promise<void> => {
  const ref = doc(db, COLLECTION_NAME, scenario.id);
  await setDoc(ref, scenario, { merge: true });
};

export const deleteScenario = async (scenarioId: string): Promise<void> => {
  const ref = doc(db, COLLECTION_NAME, scenarioId);
  await deleteDoc(ref);
};
