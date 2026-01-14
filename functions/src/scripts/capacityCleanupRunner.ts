import * as admin from 'firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import { normalizeCapacitySnapshot } from '../reservations/capacityCleanup';

type CleanupPlan = {
  payload: Record<string, unknown>;
  deletesSlots: boolean;
};

const getArgValue = (flag: string) => {
  const match = process.argv.find(arg => arg.startsWith(`${flag}=`));
  return match ? match.split('=')[1] : undefined;
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const buildCapacityWrite = (rawDoc: unknown): CleanupPlan | null => {
  const result = normalizeCapacitySnapshot(rawDoc);
  if (!result.update) return null;
  const payload: Record<string, unknown> = {
    totalCount: result.update.totalCount,
    count: result.update.count,
  };
  let deletesSlots = false;
  if (result.deletes?.includes('byTimeSlot')) {
    deletesSlots = true;
  } else if (Object.prototype.hasOwnProperty.call(result.update, 'byTimeSlot')) {
    payload.byTimeSlot = result.update.byTimeSlot;
  }
  return { payload, deletesSlots };
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;
  const limit = parseLimit(getArgValue('--limit'), 200);
  const unitId = getArgValue('--unitId');
  const from = getArgValue('--from');
  const to = getArgValue('--to');

  const projectId =
    process.env.PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    undefined;

  admin.initializeApp(projectId ? { projectId } : undefined);
  const db = admin.firestore();

  const unitIds: string[] = [];
  if (unitId) {
    unitIds.push(unitId);
  } else {
    const unitsSnap = await db.collection('units').select().get();
    unitsSnap.forEach(doc => unitIds.push(doc.id));
  }

  let remaining = limit;
  let scanned = 0;
  let changed = 0;
  let skipped = 0;
  let deletedByTimeSlot = 0;
  let appliedWrites = 0;
  let dryRunPlanned = 0;

  for (const currentUnitId of unitIds) {
    if (remaining <= 0) break;
    let query = db
      .collection('units')
      .doc(currentUnitId)
      .collection('reservation_capacity')
      .orderBy(FieldPath.documentId());
    if (from) {
      query = query.where(FieldPath.documentId(), '>=', from);
    }
    if (to) {
      query = query.where(FieldPath.documentId(), '<=', to);
    }
    const capacitySnap = await query.limit(remaining).get();
    for (const docSnap of capacitySnap.docs) {
      scanned += 1;
      remaining -= 1;
      const raw = docSnap.data();
      const plan = buildCapacityWrite(raw);
      if (!plan) {
        skipped += 1;
      } else {
        changed += 1;
        if (plan.deletesSlots) {
          deletedByTimeSlot += 1;
        }
        const payload: Record<string, unknown> = { ...plan.payload };
        if (plan.deletesSlots) {
          payload.byTimeSlot = admin.firestore.FieldValue.delete();
        }
        const mode = dryRun ? 'dry-run' : 'apply';
        const logLine = `[capacity-cleanup] ${currentUnitId}/${docSnap.id} ${mode} keys=${Object.keys(payload).join(',')}`;
        console.log(logLine);
        if (dryRun) {
          dryRunPlanned += 1;
        } else {
          await docSnap.ref.set(payload, { merge: true });
          appliedWrites += 1;
        }
      }
      if (remaining <= 0) break;
    }
  }

  const summary = {
    scanned,
    changed,
    skipped,
    deletedByTimeSlot,
    appliedWrites,
    dryRunPlanned,
    dryRun,
    limit,
    unitId: unitId ?? null,
    from: from ?? null,
    to: to ?? null,
  };
  console.log('[capacity-cleanup] summary', summary);
};

main().catch(err => {
  console.error('[capacity-cleanup] failed', err);
  process.exit(1);
});
