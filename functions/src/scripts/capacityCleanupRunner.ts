import * as admin from 'firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import { normalizeCapacitySnapshot } from '../reservations/capacityCleanup';

type CleanupPlan = {
  payload: Record<string, unknown>;
  deletesSlots: boolean;
};

export const validateDateKey = (value: string | undefined) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const usage = () => {
  console.log('[capacity-cleanup] usage:');
  console.log('  dry-run (all units, limit):');
  console.log('    tsx src/scripts/capacityCleanupRunner.ts --dry-run --limit=200');
  console.log('  apply (all units, requires project id + --yes):');
  console.log('    tsx src/scripts/capacityCleanupRunner.ts --apply --yes --limit=200');
  console.log('  apply (single unit + date range):');
  console.log(
    '    tsx src/scripts/capacityCleanupRunner.ts --apply --yes --unitId=UNIT --from=YYYY-MM-DD --to=YYYY-MM-DD'
  );
};

const allowedFlags = new Set([
  '--apply',
  '--dry-run',
  '--yes',
  '--help',
]);
const allowedPrefixes = [
  '--limit=',
  '--unitId=',
  '--from=',
  '--to=',
  '--projectId=',
];

const getArgValue = (flag: string) => {
  const match = process.argv.find(arg => arg.startsWith(`${flag}=`));
  return match ? match.split('=')[1] : undefined;
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveProjectId = (argProjectId?: string) => {
  if (argProjectId) return argProjectId;
  const envProjectId =
    process.env.PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    undefined;
  if (envProjectId) return envProjectId;
  if (process.env.FIRESTORE_EMULATOR_HOST) return 'demo-mintleaf';
  return undefined;
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
  const unknownFlags = process.argv.filter(
    arg =>
      arg.startsWith('--') &&
      !allowedFlags.has(arg) &&
      !allowedPrefixes.some(prefix => arg.startsWith(prefix))
  );
  if (unknownFlags.length > 0) {
    console.error(`[capacity-cleanup] unknown flags: ${unknownFlags.join(', ')}`);
    usage();
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run') || !apply;
  const confirmed = process.argv.includes('--yes');
  const limit = parseLimit(getArgValue('--limit'), 200);
  const unitId = getArgValue('--unitId');
  const from = getArgValue('--from');
  const to = getArgValue('--to');
  const argProjectId = getArgValue('--projectId');

  if (process.argv.includes('--help')) {
    usage();
    process.exit(0);
  }

  const projectId = resolveProjectId(argProjectId);

  console.log(
    `[capacity-cleanup] start mode=${dryRun ? 'dry-run' : 'apply'} ` +
      `projectId=${projectId ?? 'null'} unitId=${unitId ?? 'all'} ` +
      `from=${from ?? 'null'} to=${to ?? 'null'} limit=${limit}`
  );
  if (from && !validateDateKey(from)) {
    console.error('[capacity-cleanup] invalid from dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (to && !validateDateKey(to)) {
    console.error('[capacity-cleanup] invalid to dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (from && to && from > to) {
    console.error('[capacity-cleanup] invalid date range: from is after to');
    process.exit(1);
  }
  if (!dryRun && !projectId) {
    console.error('[capacity-cleanup] missing projectId for apply mode');
    usage();
    process.exit(1);
  }
  if (!dryRun && !confirmed) {
    console.error('[capacity-cleanup] missing --yes confirmation for apply mode');
    usage();
    process.exit(1);
  }

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
  let plannedWrites = 0;
  let committedWrites = 0;
  let dryRunPlanned = 0;
  let batchesCommitted = 0;
  let batch: FirebaseFirestore.WriteBatch | null = null;
  let batchSize = 0;
  let batchUnitId: string | null = null;

  const flushBatch = async () => {
    if (!batch || batchSize === 0) return;
    const commits = batchSize;
    await batch.commit();
    batchesCommitted += 1;
    committedWrites += commits;
    batch = null;
    batchSize = 0;
    batchUnitId = null;
  };

  for (const currentUnitId of unitIds) {
    if (remaining <= 0) break;
    if (!dryRun) {
      await flushBatch();
    }
    let lastDocId: string | null = null;
    while (remaining > 0) {
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
      if (lastDocId) {
        query = query.startAfter(lastDocId);
      }
      const capacitySnap = await query.limit(remaining).get();
      if (capacitySnap.empty) break;
      for (const docSnap of capacitySnap.docs) {
        scanned += 1;
        remaining -= 1;
        lastDocId = docSnap.id;
        const raw = docSnap.data();
        const plan = buildCapacityWrite(raw);
        if (!plan) {
          skipped += 1;
        } else {
          changed += 1;
          plannedWrites += 1;
          if (plan.deletesSlots) {
            deletedByTimeSlot += 1;
          }
          const payload: Record<string, unknown> = { ...plan.payload };
          if (plan.deletesSlots) {
            payload.byTimeSlot = admin.firestore.FieldValue.delete();
          }
          const mode = dryRun ? 'dry-run' : 'apply';
          const logLine = `[capacity-cleanup] ${currentUnitId}/${docSnap.id} ${mode} deletesSlots=${plan.deletesSlots} keys=${Object.keys(payload).join(',')}`;
          console.log(logLine);
          if (dryRun) {
            dryRunPlanned += 1;
          } else {
            if (!batch || batchUnitId !== currentUnitId) {
              await flushBatch();
              batch = db.batch();
              batchSize = 0;
              batchUnitId = currentUnitId;
            }
            batch.set(docSnap.ref, payload, { merge: true });
            batchSize += 1;
            if (batchSize >= 250) {
              await flushBatch();
            }
          }
        }
        if (remaining <= 0) break;
      }
    }
    if (!dryRun) {
      await flushBatch();
    }
  }
  if (!dryRun) {
    await flushBatch();
  }

  const summary = {
    scanned,
    changed,
    skipped,
    deletedByTimeSlot,
    plannedWrites,
    committedWrites,
    dryRunPlanned,
    batchesCommitted,
    dryRun,
    limit,
    unitId: unitId ?? null,
    from: from ?? null,
    to: to ?? null,
  };
  console.log('[capacity-cleanup] summary', summary);
};

if (require.main === module) {
  main().catch(err => {
    console.error('[capacity-cleanup] failed', err);
    process.exit(1);
  });
}
