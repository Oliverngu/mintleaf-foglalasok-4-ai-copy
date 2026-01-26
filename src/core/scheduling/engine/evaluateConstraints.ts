import { EngineInput, ConstraintViolation } from './types';
import {
  evaluateMinCoverageByPosition
} from '../rules/constraints/minCoverageByPosition';
import { evaluateMaxHoursPerDay } from '../rules/constraints/maxHoursPerDay';
import { evaluateMinRestHoursBetweenShifts } from '../rules/constraints/minRestHoursBetweenShifts';

export const evaluateConstraints = (
  input: EngineInput,
  capacityMap: Record<string, Record<string, number>>
): ConstraintViolation[] => {
  const bucketMinutes = input.ruleset.bucketMinutes ?? 60;
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

  return violations;
};
