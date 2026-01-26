import { ConstraintViolation } from './types';

export const buildViolationAffectedKey = (violation: ConstraintViolation): string => {
  const affected = violation.affected;
  return [
    affected.positionId ?? '',
    (affected.userIds || []).join(','),
    (affected.shiftIds || []).join(','),
    (affected.dateKeys || []).join(','),
    (affected.slots || []).join(','),
  ].join('|');
};
