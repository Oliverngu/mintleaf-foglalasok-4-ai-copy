import type { User } from '../../../core/models/data';

export class SchedulerGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulerGuardError';
  }
}

export const assertCanManageSchedule = (canManage: boolean, _role?: User['role']): void => {
  if (canManage) return;
  throw new SchedulerGuardError('Nincs jogosultság a beosztás módosításához.');
};

export const assertSingleActiveUnit = (activeUnitIds: string[]): string => {
  if (activeUnitIds.length !== 1 || !activeUnitIds[0]) {
    throw new SchedulerGuardError('A művelethez pontosan egy aktív egység szükséges.');
  }
  return activeUnitIds[0];
};

export const assertShiftUnitBoundary = (
  unitId: string | null | undefined,
  activeUnitIds: string[]
): string => {
  if (!unitId) {
    throw new SchedulerGuardError('Hiányzó unitId a menteni kívánt műszakból.');
  }
  if (!activeUnitIds.includes(unitId)) {
    throw new SchedulerGuardError('A műszak unitId mezője nem tartozik az aktív egységhez.');
  }
  return unitId;
};

export const isValidDayKey = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
