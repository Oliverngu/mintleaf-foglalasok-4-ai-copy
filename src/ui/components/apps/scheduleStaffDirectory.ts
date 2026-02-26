import type { Shift, User } from '../../../core/models/data';

const UNKNOWN_EMPLOYEE_PREFIX = 'Unknown employee';

export const buildScheduleStaffDirectory = (
  schedule: Shift[],
  activeUnitIds: string[]
): User[] => {
  const derived = new Map<string, User>();

  schedule.forEach(shift => {
    const unitMatch = !shift.unitId || activeUnitIds.includes(shift.unitId);
    if (!unitMatch || !shift.userId || derived.has(shift.userId)) return;

    const name = (shift.userName || '').trim();
    const [lastName = '', ...rest] = name.split(' ').filter(Boolean);
    const unitIds = shift.unitId ? [shift.unitId] : activeUnitIds;
    const safeLabel = name || `${UNKNOWN_EMPLOYEE_PREFIX} (${shift.userId})`;

    derived.set(shift.userId, {
      id: shift.userId,
      name: safeLabel,
      fullName: safeLabel,
      firstName: rest.join(' '),
      lastName,
      email: `${shift.userId}@unknown.local`,
      role: 'User',
      unitIds,
      position: shift.position || 'Nincs pozíció',
    });
  });

  return Array.from(derived.values());
};

export const resolveVisibleStaffForSchedule = (
  users: User[],
  scheduleDerivedUsers: User[],
  usersDirectoryDenied: boolean
): User[] => {
  if (users.length > 0 || !usersDirectoryDenied) return users;
  return scheduleDerivedUsers;
};
