import { doc, setDoc, type Firestore } from 'firebase/firestore';

import type { ExportStyleSettings, ScheduleSettings } from '../../../core/models/data';

export const upsertScheduleSettings = async (
  db: Firestore,
  settings: ScheduleSettings
): Promise<void> => {
  await setDoc(doc(db, 'schedule_settings', settings.id), settings);
};

export const saveDisplaySettings = async (
  db: Firestore,
  settingsDocId: string,
  orderedUserIds: string[],
  hiddenUserIds: string[]
): Promise<void> => {
  await setDoc(
    doc(db, 'schedule_display_settings', settingsDocId),
    { orderedUserIds, hiddenUserIds },
    { merge: true }
  );
};

export const saveExportStyleSettings = async (
  db: Firestore,
  unitId: string,
  settings: ExportStyleSettings
): Promise<void> => {
  await setDoc(doc(db, 'unit_export_settings', unitId), settings);
};
