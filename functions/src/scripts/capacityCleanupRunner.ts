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
  console.log(
    '  tsx src/scripts/capacityCleanupRunner.ts --dry-run [--limit=200] [--pageSize=200] [--cursor=YYYY-MM-DD]'
  );
  console.log(
    '  tsx src/scripts/capacityCleanupRunner.ts --apply --yes [--projectId=ID] [--pageSize=200] [--cursor=YYYY-MM-DD]'
  );
  console.log(
    '  tsx src/scripts/capacityCleanupRunner.ts --apply --yes --unitId=UNIT --from=YYYY-MM-DD --to=YYYY-MM-DD [--pageSize=200] [--cursor=YYYY-MM-DD]'
  );
  console.log('  cursor is applied per-unit as a reservation_capacity dateKey startAfter');
};

const allowedFlags = new Set([
  '--apply',
  '--dry-run',
  '--yes',
  '--help',
]);

type ParsedArgs = {
  apply: boolean;
  dryRun: boolean;
  confirmed: boolean;
  help: boolean;
  limit?: string;
  pageSize?: string;
  cursor?: string;
  unitId?: string;
  from?: string;
  to?: string;
  projectId?: string;
  unknownFlags: string[];
};

export const parseArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {
    apply: false,
    dryRun: false,
    confirmed: false,
    help: false,
    unknownFlags: [],
  };

  for (const arg of argv) {
    if (allowedFlags.has(arg)) {
      if (arg === '--apply') parsed.apply = true;
      if (arg === '--dry-run') parsed.dryRun = true;
      if (arg === '--yes') parsed.confirmed = true;
      if (arg === '--help') parsed.help = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      parsed.limit = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--pageSize=')) {
      parsed.pageSize = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--cursor=')) {
      parsed.cursor = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--unitId=')) {
      parsed.unitId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--from=')) {
      parsed.from = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--to=')) {
      parsed.to = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--projectId=')) {
      const value = arg.split('=')[1];
      if (value) {
        parsed.projectId = value;
      }
      continue;
    }
    if (arg.startsWith('--')) {
      parsed.unknownFlags.push(arg);
    }
  }

  return parsed;
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parsePageSize = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : Number.NaN;
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
};

const getEnvProjectId = () =>
  process.env.PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GCLOUD_PROJECT ||
  undefined;

export const getProjectIdSource = (argProjectId?: string) => {
  if (argProjectId) return 'cli';
  if (getEnvProjectId()) return 'env';
  if (process.env.FIRESTORE_EMULATOR_HOST) return 'emulator';
  return 'none';
};

export const canApplyWithProject = (
  projectId: string | undefined,
  source: 'cli' | 'env' | 'emulator' | 'none'
) => {
  if (!projectId) return false;
  if (source === 'emulator') return false;
  if (projectId === 'demo-mintleaf') return false;
  return true;
};

export const resolveProjectId = (argProjectId?: string) => {
  if (argProjectId) return argProjectId;
  const envProjectId = getEnvProjectId();
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
  const args = parseArgs(process.argv.slice(2));
  if (args.unknownFlags.length > 0) {
    console.error(`[capacity-cleanup] unknown flags: ${args.unknownFlags.join(', ')}`);
    usage();
    process.exit(1);
  }

  const apply = args.apply;
  const dryRun = args.dryRun || !apply;
  const confirmed = args.confirmed;
  const limit = parseLimit(args.limit, 200);
  const pageSize = parsePageSize(args.pageSize, 200);
  const cursor = args.cursor;
  const unitId = args.unitId;
  const from = args.from;
  const to = args.to;
  const argProjectId = args.projectId;

  if (args.help) {
    usage();
    process.exit(0);
  }

  const projectId = resolveProjectId(argProjectId);
  const projectIdSource = getProjectIdSource(argProjectId);

  console.log(
    `[capacity-cleanup] start mode=${dryRun ? 'dry-run' : 'apply'} ` +
      `projectId=${projectId ?? 'null'} projectIdSource=${projectIdSource} ` +
      `unitId=${unitId ?? 'all'} ` +
      `from=${from ?? 'null'} to=${to ?? 'null'} ` +
      `limit=${limit} pageSize=${pageSize} cursor=${cursor ?? 'null'}`
  );
  if (from && !validateDateKey(from)) {
    console.error('[capacity-cleanup] invalid from dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (to && !validateDateKey(to)) {
    console.error('[capacity-cleanup] invalid to dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (cursor && !validateDateKey(cursor)) {
    console.error('[capacity-cleanup] invalid cursor dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (from && to && from > to) {
    console.error('[capacity-cleanup] invalid date range: from is after to');
    process.exit(1);
  }
  if (!projectId) {
    console.error('[capacity-cleanup] missing projectId (set PROJECT_ID or use --projectId)');
    usage();
    process.exit(1);
  }
  if (!dryRun && !confirmed) {
    console.error('[capacity-cleanup] missing --yes confirmation for apply mode');
    usage();
    process.exit(1);
  }
  if (!dryRun && !canApplyWithProject(projectId, projectIdSource)) {
    console.error(
      '[capacity-cleanup] apply mode cannot run against emulator default projectId'
    );
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
  let lastProcessedDocId: string | null = null;
  let stoppedByLimit = false;
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
    let firstPage = true;
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
      } else if (firstPage && cursor) {
        query = query.startAfter(cursor);
      }
      const queryLimit = Math.min(pageSize, remaining);
      const capacitySnap = await query.limit(queryLimit).get();
      firstPage = false;
      if (capacitySnap.empty) break;
      for (const docSnap of capacitySnap.docs) {
        scanned += 1;
        remaining -= 1;
        lastDocId = docSnap.id;
        lastProcessedDocId = docSnap.id;
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
        if (remaining <= 0) {
          stoppedByLimit = true;
          break;
        }
      }
      if (remaining <= 0) break;
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
  const done = !stoppedByLimit;
  const nextCursor = done ? null : lastProcessedDocId ?? null;
  console.log(`[capacity-cleanup] nextCursor=${nextCursor ?? 'null'} done=${done}`);
};

if (typeof require !== 'undefined' && require.main === module) {
  main().catch(err => {
    console.error('[capacity-cleanup] failed', err);
    process.exit(1);
  });
}
