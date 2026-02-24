import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

type QueuedTemplateKey =
  | 'leave_request_created'
  | 'leave_request_approved'
  | 'leave_request_rejected'
  | 'schedule_published'
  | 'register_welcome';

type EnqueueQueuedEmailParams = {
  type: QueuedTemplateKey;
  unitId: string | null;
  payload: Record<string, any>;
};

export const enqueueQueuedEmail = async (
  type: QueuedTemplateKey,
  unitId: string | null,
  payload: Record<string, any>
) => {
  const callable = httpsCallable<EnqueueQueuedEmailParams, { ok: boolean }>(
    functions,
    'enqueueQueuedEmail'
  );
  await callable({ type, unitId, payload });
};
