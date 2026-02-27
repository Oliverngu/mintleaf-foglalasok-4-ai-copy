import type { Shift, Unit, User } from '../../../core/models/data';

import { SchedulerGuardError } from './schedulerGuards.ts';

export type PublishPlan = {
  affectedShiftIds: string[];
  updates: Array<{ shiftId: string; payload: Partial<Shift> }>;
  emailPayload: {
    recipients: string[];
    unitId: string;
    unitName: string;
    weekLabel: string;
    url: string;
    editorName: string;
    emailDisabledReason?: 'users_directory_unavailable';
  };
};

export const buildPublishPlan = (params: {
  shifts: Shift[];
  weekStart: Date;
  weekEnd: Date;
  selectedUnitIds: string[];
  users: User[];
  units: Unit[];
  currentUserName: string;
  publicUrl: string;
  usersDirectoryAvailable?: boolean;
}): PublishPlan => {
  const {
    shifts,
    weekStart,
    weekEnd,
    selectedUnitIds,
    users,
    units,
    currentUserName,
    publicUrl,
    usersDirectoryAvailable = true,
  } = params;

  if (selectedUnitIds.length !== 1 || !selectedUnitIds[0]) {
    throw new SchedulerGuardError('Publikáláshoz pontosan egy egységet kell kiválasztani.');
  }

  const selectedUnitId = selectedUnitIds[0];

  const shiftsToPublish = shifts.filter(
    s =>
      (s.status === 'draft' || !s.status) &&
      !!s.start &&
      !!s.unitId &&
      s.start.toDate() >= weekStart &&
      s.start.toDate() <= weekEnd &&
      s.unitId === selectedUnitId
  );

  const affectedShiftIds = shiftsToPublish.map(shift => shift.id);
  const updates = affectedShiftIds.map(shiftId => ({
    shiftId,
    payload: { status: 'published' as const },
  }));

  const affectedUserIds = [...new Set(shiftsToPublish.map(s => s.userId))];
  const recipients = usersDirectoryAvailable
    ? affectedUserIds
        .map(userId => users.find(u => u.id === userId))
        .filter((u): u is User => !!u && !!u.email && u.notifications?.newSchedule !== false)
        .map(u => u.email)
    : [];

  const unitName = units.find(unit => unit.id === selectedUnitId)?.name || 'Ismeretlen egység';
  const weekLabel = `${weekStart.toLocaleDateString('hu-HU', {
    month: 'short',
    day: 'numeric',
  })} - ${weekEnd.toLocaleDateString('hu-HU', {
    month: 'short',
    day: 'numeric',
  })}`;

  return {
    affectedShiftIds,
    updates,
    emailPayload: {
      recipients,
      unitId: selectedUnitId,
      unitName,
      weekLabel,
      url: publicUrl,
      editorName: currentUserName,
      emailDisabledReason: usersDirectoryAvailable ? undefined : 'users_directory_unavailable',
    },
  };
};
