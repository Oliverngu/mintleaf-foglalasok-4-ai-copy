import { EngineInput, ConstraintViolation, Severity } from './types';
import { normalizeBucketMinutes } from './timeUtils';
import {
  evaluateMinCoverageByPosition
} from '../rules/constraints/minCoverageByPosition';
import { evaluateMaxHoursPerDay } from '../rules/constraints/maxHoursPerDay';
import { evaluateMinRestHoursBetweenShifts } from '../rules/constraints/minRestHoursBetweenShifts';

export const evaluateConstraints = (
  input: EngineInput,
  capacityMap: Record<string, Record<string, number>>
): ConstraintViolation[] => {
  const bucketMinutes = normalizeBucketMinutes(input.ruleset.bucketMinutes);
  const violations: ConstraintViolation[] = [];

  violations.push(
    ...evaluateMinCoverageByPosition(
      capacityMap,
      input.ruleset.minCoverageByPosition,
      bucketMinutes
    )
  );
  violations.push(
    ...evaluateMaxHoursPerDay(
      input,
      input.shifts,
      input.ruleset.maxHoursPerDay
    )
  );
  violations.push(
    ...evaluateMinRestHoursBetweenShifts(
      input,
      input.shifts,
      input.ruleset.minRestHoursBetweenShifts
    )
  );

  const severityRank: Record<Severity, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  const normalizeArray = (values?: string[]) =>
    values ? Array.from(new Set(values)).sort() : [];

  const normalized = violations.map(violation => ({
    ...violation,
    affected: {
      userIds: normalizeArray(violation.affected.userIds ?? []),
      shiftIds: normalizeArray(violation.affected.shiftIds ?? []),
      slots: normalizeArray(violation.affected.slots ?? []),
      positionId: violation.affected.positionId,
      dateKeys: normalizeArray(violation.affected.dateKeys ?? [])
    }
  }));

  const affectedKey = (violation: ConstraintViolation) => {
    const affected = violation.affected;
    return [
      affected.positionId ?? '',
      (affected.userIds || []).join(','),
      (affected.shiftIds || []).join(','),
      (affected.dateKeys || []).join(','),
      (affected.slots || []).join(',')
    ].join('|');
  };

  return normalized.sort((a, b) => {
    const severityDiff =
      severityRank[b.severity] - severityRank[a.severity];
    if (severityDiff !== 0) return severityDiff;
    const constraintDiff = a.constraintId.localeCompare(b.constraintId);
    if (constraintDiff !== 0) return constraintDiff;
    return affectedKey(a).localeCompare(affectedKey(b));
  });
};
