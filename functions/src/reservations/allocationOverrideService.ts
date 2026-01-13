import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { AllocationOverrideDecision, AllocationReasonCode } from './allocationEngine';

export type AllocationOverrideDoc = {
  enabled?: boolean;
  decision?: 'accept' | 'reject';
  source?: string | null;
  reasonCode?: AllocationReasonCode | null;
};

export const mapOverrideDocToDecision = (
  data: AllocationOverrideDoc | null | undefined
): AllocationOverrideDecision | null => {
  if (!data?.enabled) {
    return null;
  }
  if (data.decision !== 'accept' && data.decision !== 'reject') {
    return null;
  }
  return {
    decision: data.decision,
    source: data.source ?? null,
    reasonCode: data.reasonCode ?? null,
  };
};

export const readAllocationOverrideTx = async (
  transaction: Transaction,
  db: Firestore,
  unitId: string,
  dateKey: string
): Promise<AllocationOverrideDecision | null> => {
  const ref = db
    .collection('units')
    .doc(unitId)
    .collection('allocation_overrides')
    .doc(dateKey);
  const snap = await transaction.get(ref);
  if (!snap.exists) {
    return null;
  }
  return mapOverrideDocToDecision(snap.data() as AllocationOverrideDoc);
};
