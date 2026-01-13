import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { AllocationAuditLog } from './allocationEngine';

export const writeAllocationAuditLog = async (
  db: Firestore,
  log: AllocationAuditLog
): Promise<string | null> => {
  try {
    const ref = db.collection('allocation_logs').doc();
    await ref.set({
      ...log,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  } catch (err) {
    logger.error('allocation audit log failed', {
      unitId: log.unitId,
      traceId: log.traceId,
      err,
    });
    return null;
  }
};
