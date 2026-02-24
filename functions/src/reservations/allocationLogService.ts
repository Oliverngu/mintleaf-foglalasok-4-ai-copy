import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { AllocationAuditLog } from './allocationEngine';

export const allocationLogDocId = ({
  unitId,
  dateKey,
  traceId,
}: {
  unitId: string;
  dateKey: string;
  traceId: string;
}) => `${unitId}_${dateKey}_${traceId}`;

export const writeAllocationAuditLog = async (
  db: Firestore,
  log: AllocationAuditLog
): Promise<string | null> => {
  try {
    const docId = allocationLogDocId({
      unitId: log.unitId,
      dateKey: log.dateKey,
      traceId: log.traceId,
    });
    const ref = db.collection('allocation_logs').doc(docId);
    try {
      await ref.create({
        ...log,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      const code = err?.code;
      if (code !== 'already-exists' && code !== 6) {
        throw err;
      }
      await ref.set(
        {
          ...log,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    return docId;
  } catch (err) {
    logger.error('allocation audit log failed', {
      unitId: log.unitId,
      traceId: log.traceId,
      err,
    });
    return null;
  }
};
