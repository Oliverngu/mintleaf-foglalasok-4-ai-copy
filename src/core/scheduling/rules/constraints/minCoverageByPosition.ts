import { CapacityMap, ConstraintViolation, MinCoverageRule } from '../../engine/types';
import {
  addMinutes,
  combineDateAndTime,
  getSlotKey,
  normalizeBucketMinutes
} from '../../engine/timeUtils';

export const MIN_COVERAGE_BY_POSITION_ID = 'MIN_COVERAGE_BY_POSITION';

export const evaluateMinCoverageByPosition = (
  capacityMap: CapacityMap,
  rules: MinCoverageRule[] | undefined,
  bucketMinutes: number
): ConstraintViolation[] => {
  if (!rules || rules.length === 0) return [];

  const violations: ConstraintViolation[] = [];
  const normalizedBucketMinutes = normalizeBucketMinutes(bucketMinutes);

  rules.forEach(rule => {
    const missingSlots: string[] = [];
    const dateKeys = rule.dateKeys || [];

    dateKeys.forEach(dateKey => {
      const rangeStart = combineDateAndTime(dateKey, rule.startTime);
      let rangeEnd = combineDateAndTime(dateKey, rule.endTime);
      if (rangeEnd <= rangeStart) {
        rangeEnd = addMinutes(rangeEnd, 24 * 60);
      }

      let cursor = new Date(rangeStart);
      while (cursor < rangeEnd) {
        const slotKey = getSlotKey(cursor);
        const assigned = capacityMap[slotKey]?.[rule.positionId] || 0;
        if (assigned < rule.minCount) {
          missingSlots.push(slotKey);
        }
        cursor = addMinutes(cursor, normalizedBucketMinutes);
      }
    });

    if (missingSlots.length > 0) {
      violations.push({
        constraintId: MIN_COVERAGE_BY_POSITION_ID,
        severity: rule.severity || 'high',
        message: `Minimális lefedettség hiány a(z) ${rule.positionId} pozícióhoz.`,
        affected: {
          userIds: [],
          shiftIds: [],
          slots: missingSlots,
          positionId: rule.positionId,
          dateKeys
        }
      });
    }
  });

  return violations;
};
