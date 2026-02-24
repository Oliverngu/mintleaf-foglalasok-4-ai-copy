import * as admin from 'firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import {
  getProjectIdSource,
  parseArgs,
  parsePageSize,
  resolveProjectId,
  validateDateKey,
} from './capacityCleanupRunner';
import { CAPACITY_INVARIANT_REASONS } from '../reservations/capacityInvariantReasons';

type AnomalyResult = {
  anomalies: string[];
  totalCount?: number;
  count?: number;
  byTimeSlotSum?: number;
};

const usage = () => {
  console.log('[capacity-sanity] usage:');
  console.log(
    '  tsx src/scripts/capacitySanityScan.ts --projectId=ID (or set PROJECT_ID / GCLOUD_PROJECT) [--limit=200] [--pageSize=200] [--cursor=YYYY-MM-DD]'
  );
  console.log(
    '  tsx src/scripts/capacitySanityScan.ts --unitId=UNIT --from=YYYY-MM-DD --to=YYYY-MM-DD [--pageSize=200] [--cursor=YYYY-MM-DD]'
  );
  console.log('  cursor is applied per-unit as a reservation_capacity dateKey startAfter');
};

const parseScanArgs = (argv: string[]) => {
  const parsed = parseArgs(argv);
  const unsupported: string[] = [];
  if (parsed.apply) unsupported.push('--apply');
  if (parsed.dryRun) unsupported.push('--dry-run');
  if (parsed.confirmed) unsupported.push('--yes');
  return { parsed, unsupported };
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const detectCapacityAnomalies = (rawDoc: unknown): AnomalyResult => {
  const anomalies: string[] = [];
  if (!isRecord(rawDoc)) {
    anomalies.push('invalid-doc');
    return { anomalies };
  }

  const totalCountValue = rawDoc.totalCount;
  const countValue = rawDoc.count;
  const hasTotalCount = totalCountValue !== undefined;
  const hasCount = countValue !== undefined;
  const totalCount =
    typeof totalCountValue === 'number' && Number.isFinite(totalCountValue)
      ? totalCountValue
      : undefined;
  const count =
    typeof countValue === 'number' && Number.isFinite(countValue) ? countValue : undefined;

  if (!hasTotalCount && !hasCount) {
    anomalies.push(CAPACITY_INVARIANT_REASONS.missingCounts);
  }
  if (hasTotalCount && (totalCount === undefined || totalCount < 0)) {
    anomalies.push(CAPACITY_INVARIANT_REASONS.totalCountInvalid);
  }
  if (totalCount !== undefined && count !== undefined && totalCount !== count) {
    anomalies.push(CAPACITY_INVARIANT_REASONS.countMismatch);
  }

  if (Object.prototype.hasOwnProperty.call(rawDoc, 'byTimeSlot')) {
    const byTimeSlotValue = rawDoc.byTimeSlot;
    if (!isRecord(byTimeSlotValue)) {
      anomalies.push(CAPACITY_INVARIANT_REASONS.byTimeSlotInvalid);
    } else {
      let sum = 0;
      let invalidSlot = false;
      for (const value of Object.values(byTimeSlotValue)) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          invalidSlot = true;
          continue;
        }
        sum += value;
      }
      if (invalidSlot) {
        anomalies.push(CAPACITY_INVARIANT_REASONS.byTimeSlotInvalid);
      } else if (totalCount !== undefined && sum !== totalCount) {
        anomalies.push(CAPACITY_INVARIANT_REASONS.byTimeSlotSumMismatch);
      }
      return {
        anomalies,
        totalCount,
        count,
        byTimeSlotSum: Number.isFinite(sum) ? sum : undefined,
      };
    }
  }

  return { anomalies, totalCount, count };
};

const main = async () => {
  const { parsed, unsupported } = parseScanArgs(process.argv.slice(2));
  const unknownFlags = [...parsed.unknownFlags, ...unsupported];
  if (unknownFlags.length > 0) {
    console.error(`[capacity-sanity] unknown flags: ${unknownFlags.join(', ')}`);
    usage();
    process.exit(1);
  }

  if (parsed.help) {
    usage();
    process.exit(0);
  }

  const limit = parseLimit(parsed.limit, 200);
  const pageSize = parsePageSize(parsed.pageSize, 200);
  const cursor = parsed.cursor;
  const unitId = parsed.unitId;
  const from = parsed.from;
  const to = parsed.to;
  const projectId = resolveProjectId(parsed.projectId);
  const projectIdSource = getProjectIdSource(parsed.projectId);

  console.log(
    `[capacity-sanity] start projectId=${projectId ?? 'null'} projectIdSource=${projectIdSource} ` +
      `unitId=${unitId ?? 'all'} from=${from ?? 'null'} to=${to ?? 'null'} ` +
      `limit=${limit} pageSize=${pageSize} cursor=${cursor ?? 'null'}`
  );

  if (from && !validateDateKey(from)) {
    console.error('[capacity-sanity] invalid from dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (to && !validateDateKey(to)) {
    console.error('[capacity-sanity] invalid to dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (from && to && from > to) {
    console.error('[capacity-sanity] invalid date range: from is after to');
    process.exit(1);
  }
  if (cursor && !validateDateKey(cursor)) {
    console.error('[capacity-sanity] invalid cursor dateKey; expected YYYY-MM-DD');
    process.exit(1);
  }
  if (!projectId) {
    console.error('[capacity-sanity] missing projectId (set PROJECT_ID or use --projectId)');
    usage();
    process.exit(1);
  }

  admin.initializeApp({ projectId });
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
  let anomaliesFound = 0;
  let lastProcessedDocId: string | null = null;
  let stoppedByLimit = false;
  const anomalyCounts: Record<string, number> = {};

  for (const currentUnitId of unitIds) {
    if (remaining <= 0) break;
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
        const result = detectCapacityAnomalies(docSnap.data());
        if (result.anomalies.length > 0) {
          anomaliesFound += 1;
          for (const anomaly of result.anomalies) {
            anomalyCounts[anomaly] = (anomalyCounts[anomaly] ?? 0) + 1;
          }
          console.log(
            `[capacity-sanity] ${currentUnitId}/${docSnap.id} anomalies=${result.anomalies.join(',')}`
          );
        }
        if (remaining <= 0) {
          stoppedByLimit = true;
          break;
        }
      }
      if (remaining <= 0) break;
    }
  }

  const summary = {
    scanned,
    anomaliesFound,
    anomalyCounts,
    limit,
    unitId: unitId ?? null,
    from: from ?? null,
    to: to ?? null,
  };
  console.log('[capacity-sanity] summary', summary);
  const done = !stoppedByLimit;
  const nextCursor = done ? null : lastProcessedDocId ?? null;
  console.log(`[capacity-sanity] nextCursor=${nextCursor ?? 'null'} done=${done}`);
};

if (typeof require !== 'undefined' && require.main === module) {
  main().catch(err => {
    console.error('[capacity-sanity] failed', err);
    process.exit(1);
  });
}
