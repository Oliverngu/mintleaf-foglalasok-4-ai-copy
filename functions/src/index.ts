import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const REGION = 'europe-west3';

const EMAIL_GATEWAY_URL =
  process.env.EMAIL_GATEWAY_URL || 'https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send';

interface BookingRecord {
  name?: string;
  headcount?: number;
  occasion?: string;
  startTime: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  endTime?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date | null;
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  notes?: string;
  phone?: string;
  email?: string;
  contact?: {
    phoneE164?: string;
    email?: string;
  };
  locale?: 'hu' | 'en';
  cancelledAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  cancelReason?: string;
  referenceCode?: string;
  reservationMode?: 'auto' | 'request';
  adminActionToken?: string;
  adminActionHandledAt?: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date;
  adminActionSource?: 'email' | 'manual';
  cancelledBy?: 'guest' | 'admin' | 'system';
}

interface EmailSettingsDocument {
  enabledTypes?: Record<string, boolean>;
  adminRecipients?: Record<string, string[]>;
  templateOverrides?: Record<string, { subject: string; html: string }>;
  adminDefaultEmail?: string;
}

interface ReservationSettings {
  notificationEmails?: string[];
}

const decisionLabels: Record<'hu' | 'en', { approved: string; rejected: string; cancelled: string }> = {
  hu: {
    approved: 'Elfogadva',
    rejected: 'Elutasítva',
    cancelled: 'Lemondva vendég által',
  },
  en: {
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled by guest',
  },
};

const defaultTemplates = {
  booking_status_updated_guest: {
    subject: 'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
    html: `
      <h2>Foglalás frissítése</h2>
      <p>Kedves {{guestName}}!</p>
      <p>A(z) <strong>{{unitName}}</strong> egységnél leadott foglalásod státusza frissült.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Döntés:</strong> {{decisionLabel}}</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>Köszönjük a türelmedet!</p>
    `,
  },
  booking_cancelled_admin: {
    subject: 'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <h2>Vendég lemondta a foglalást</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>A foglalás le lett mondva a vendég oldaláról.</p>
    `,
  },
};

const renderTemplate = (template: string, payload: Record<string, any> = {}) => {
  let rendered = template;

  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim();
    const value = trimmedKey.split('.').reduce((obj: any, k: string) => obj && obj[k], payload);
    return value !== undefined ? String(value) : match;
  });

  rendered = rendered.replace(/{{#if (.*?)}}(.*?){{\/if}}/gs, (match, key, content) => {
    const trimmedKey = key.trim();
    const value = trimmedKey.split('.').reduce((obj: any, k: string) => obj && obj[k], payload);
    return value ? content : '';
  });

  return rendered;
};

const getEmailSettingsForUnit = async (unitId: string): Promise<EmailSettingsDocument> => {
  const defaultSettings: EmailSettingsDocument = {
    enabledTypes: {},
    adminRecipients: {},
    templateOverrides: {},
    adminDefaultEmail: '',
  };

  try {
    const snap = await db.doc(`email_settings/${unitId}`).get();
    if (!snap.exists) return defaultSettings;
    const data = snap.data() as EmailSettingsDocument;
    return {
      enabledTypes: data.enabledTypes || {},
      adminRecipients: data.adminRecipients || {},
      templateOverrides: data.templateOverrides || {},
      adminDefaultEmail: data.adminDefaultEmail || '',
    };
  } catch (err) {
    functions.logger.error('Failed to fetch email settings', { unitId, err });
    return defaultSettings;
  }
};

const shouldSendEmail = async (typeId: string, unitId: string | null) => {
  if (!unitId) return true;
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  if (unitSettings.enabledTypes?.[typeId] !== undefined) {
    return unitSettings.enabledTypes[typeId];
  }
  if (defaultSettings.enabledTypes?.[typeId] !== undefined) {
    return defaultSettings.enabledTypes[typeId];
  }
  return true;
};

const getAdminRecipientsOverride = async (
  unitId: string,
  typeId: string,
  legacyRecipients: string[] = []
): Promise<string[]> => {
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitSpecific = unitSettings.adminRecipients?.[typeId];
  if (unitSpecific && unitSpecific.length > 0) {
    return [...new Set(unitSpecific)];
  }

  const defaultSpecific = defaultSettings.adminRecipients?.[typeId];
  if (defaultSpecific && defaultSpecific.length > 0) {
    return [...new Set(defaultSpecific)];
  }

  const recipients = new Set<string>();
  if (unitSettings.adminDefaultEmail) recipients.add(unitSettings.adminDefaultEmail);
  if (defaultSettings.adminDefaultEmail) recipients.add(defaultSettings.adminDefaultEmail);
  (legacyRecipients || []).forEach(email => recipients.add(email));

  return Array.from(recipients);
};

const resolveEmailTemplate = async (unitId: string | null, typeId: keyof typeof defaultTemplates, payload: any) => {
  const unitSettings = await getEmailSettingsForUnit(unitId || 'default');
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitOverride = unitSettings.templateOverrides?.[typeId];
  const defaultOverride = defaultSettings.templateOverrides?.[typeId];
  const hardcoded = defaultTemplates[typeId];

  const subjectTemplate = unitOverride?.subject || defaultOverride?.subject || hardcoded.subject;
  const htmlTemplate = unitOverride?.html || defaultOverride?.html || hardcoded.html;

  return {
    subject: renderTemplate(subjectTemplate, payload),
    html: renderTemplate(htmlTemplate, payload),
  };
};

const sendEmail = async (params: {
  typeId: string;
  unitId?: string;
  to: string | string[];
  subject: string;
  html: string;
  payload?: Record<string, any>;
}) => {
  const response = await fetch(EMAIL_GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown_error');
    throw new Error(`Email gateway error ${response.status}: ${text}`);
  }
};

const formatDate = (value: any, locale: 'hu' | 'en') => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

const formatTime = (value: any, locale: 'hu' | 'en') => {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const buildPayload = (
  booking: BookingRecord,
  unitName: string,
  locale: 'hu' | 'en',
  decisionLabel: string
) => {
  const bookingDate = formatDate(booking.startTime, locale);
  const bookingTimeFrom = formatTime(booking.startTime, locale);
  const bookingTimeTo = booking.endTime ? ` – ${formatTime(booking.endTime, locale)}` : '';

  return {
    guestName: booking.name,
    unitName,
    bookingDate,
    bookingTimeFrom,
    bookingTimeTo,
    headcount: booking.headcount,
    decisionLabel,
    bookingRef: booking.referenceCode?.substring(0, 8).toUpperCase() || '',
    guestEmail: booking.contact?.email || booking.email || '',
    guestPhone: booking.contact?.phoneE164 || booking.phone || '',
  };
};

const getUnitName = async (unitId: string) => {
  try {
    const snap = await db.doc(`units/${unitId}`).get();
    return (snap.data()?.name as string) || 'MintLeaf egység';
  } catch (err) {
    functions.logger.error('Failed to load unit', { unitId, err });
    return 'MintLeaf egység';
  }
};

const getReservationSettings = async (unitId: string): Promise<ReservationSettings> => {
  try {
    const snap = await db.doc(`reservation_settings/${unitId}`).get();
    if (!snap.exists) return {};
    return snap.data() as ReservationSettings;
  } catch (err) {
    functions.logger.error('Failed to fetch reservation settings', { unitId, err });
    return {};
  }
};

const sendGuestStatusEmail = async (unitId: string, booking: BookingRecord, unitName: string) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) {
    functions.logger.warn('Skipping guest status email, missing guest email', { unitId });
    return;
  }

  const canSend = await shouldSendEmail('booking_status_updated_guest', unitId);
  if (!canSend) {
    functions.logger.warn('booking_status_updated_guest disabled, sending anyway for critical flow', { unitId });
  }

  const decisionLabel = booking.status === 'confirmed'
    ? decisionLabels[locale].approved
    : decisionLabels[locale].rejected;

  const payload = buildPayload(booking, unitName, locale, decisionLabel);
  const { subject, html } = await resolveEmailTemplate(unitId, 'booking_status_updated_guest', payload);

  functions.logger.info('SENDING GUEST STATUS EMAIL', {
    unitId,
    email: guestEmail,
    bookingRef: payload.bookingRef,
    decisionLabel,
  });

  await sendEmail({
    typeId: 'booking_status_updated_guest',
    unitId,
    to: guestEmail,
    subject,
    html,
    payload,
  });
};

const sendAdminCancellationEmail = async (unitId: string, booking: BookingRecord, unitName: string) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const cancellationRecipients = await getAdminRecipientsOverride(unitId, 'booking_cancelled_admin', legacyRecipients);
  const bookingCreatedRecipients = await getAdminRecipientsOverride(unitId, 'booking_created_admin', legacyRecipients);
  const recipients = Array.from(new Set([...(cancellationRecipients || []), ...(bookingCreatedRecipients || [])]));

  if (!recipients.length) {
    functions.logger.warn('No admin recipients for cancellation', { unitId });
    return;
  }

  const locale = booking.locale || 'hu';
  const payload = buildPayload(booking, unitName, locale, decisionLabels[locale].cancelled);
  const { subject, html } = await resolveEmailTemplate(unitId, 'booking_cancelled_admin', payload);

  functions.logger.info('SENDING ADMIN CANCELLATION EMAIL', {
    unitId,
    recipients,
    bookingRef: payload.bookingRef,
  });

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_cancelled_admin',
        unitId,
        to,
        subject,
        html,
        payload,
      })
    )
  );
};

export const onReservationStatusChange = functions
  .region(REGION)
  .firestore.document('units/{unitId}/reservations/{bookingId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() as BookingRecord | undefined;
    const after = change.after.data() as BookingRecord | undefined;
    if (!before || !after) return;

    if (before.status === after.status && before.cancelledBy === after.cancelledBy) {
      return;
    }

    const unitId = context.params.unitId as string;
    functions.logger.info('TRIGGER FIRED', {
      unitId,
      bookingId: context.params.bookingId,
      beforeStatus: before.status,
      afterStatus: after.status,
      beforeCancelledBy: before.cancelledBy,
      afterCancelledBy: after.cancelledBy,
    });
    const unitName = await getUnitName(unitId);

    const statusChanged = before.status !== after.status;
    const adminDecision =
      statusChanged &&
      before.status === 'pending' &&
      (after.status === 'confirmed' || after.status === 'cancelled');
    const guestCancelled =
      statusChanged &&
      after.status === 'cancelled' &&
      after.cancelledBy === 'guest';

    const tasks: Promise<void>[] = [];

    if (adminDecision) {
      functions.logger.info('ADMIN DECISION DETECTED', {
        unitId,
        bookingId: context.params.bookingId,
        from: before.status,
        to: after.status,
      });
      tasks.push(
        sendGuestStatusEmail(unitId, after, unitName).catch(err =>
          functions.logger.error('Failed to send guest status email', { unitId, err })
        )
      );
    }

    if (guestCancelled) {
      functions.logger.info('GUEST CANCELLATION DETECTED', {
        unitId,
        bookingId: context.params.bookingId,
        from: before.status,
        to: after.status,
        cancelledBy: after.cancelledBy,
      });
      tasks.push(
        sendAdminCancellationEmail(unitId, after, unitName).catch(err =>
          functions.logger.error('Failed to send admin cancellation email', { unitId, err })
        )
      );
    }

    await Promise.all(tasks);
  });
