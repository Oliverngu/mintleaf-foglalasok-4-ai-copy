import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();
const REGION = 'europe-west3';

const EMAIL_GATEWAY_URL =
  process.env.EMAIL_GATEWAY_URL ||
  'https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send';

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

const decisionLabels: Record<
  'hu' | 'en',
  { approved: string; rejected: string; cancelled: string }
> = {
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
  booking_created_guest: {
    subject: 'Foglalás visszaigazolás: {{bookingDate}} {{bookingTimeFrom}}',
    html: `
      <h2>Foglalásodat megkaptuk</h2>
      <p>Kedves {{guestName}}!</p>
      <p>Köszönjük a foglalást a(z) <strong>{{unitName}}</strong> egységbe.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        {{#if occasion}}<li><strong>Alkalom:</strong> {{occasion}}</li>{{/if}}
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
      <p>Hamarosan visszajelzünk a foglalás státuszáról.</p>
    `,
  },

  booking_created_admin: {
    subject:
      'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő) – {{guestName}}',
    html: `
      <h2>Új foglalási kérelem érkezett</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        {{#if occasion}}<li><strong>Alkalom:</strong> {{occasion}}</li>{{/if}}
        {{#if notes}}<li><strong>Megjegyzés:</strong> {{notes}}</li>{{/if}}
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Ref: <strong>{{bookingRef}}</strong></p>
    `,
  },

  booking_status_updated_guest: {
    subject:
      'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
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
    subject:
      'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
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

  booking_modified_guest: {
    subject: 'Foglalás módosítva: {{bookingDate}} {{bookingTimeFrom}}',
    html: `
      <h2>Foglalás módosítva</h2>
      <p>Kedves {{guestName}}!</p>
      <p>A(z) <strong>{{unitName}}</strong> egységnél a foglalásod adatai módosultak.</p>
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
      </ul>
      <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
    `,
  },

  booking_modified_admin: {
    subject:
      'Foglalás módosítva (admin): {{bookingDate}} {{bookingTimeFrom}} – {{guestName}}',
    html: `
      <h2>Foglalás módosítva</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      </ul>
      <p>Ref: <strong>{{bookingRef}}</strong></p>
    `,
  },
};

type TemplateId = keyof typeof defaultTemplates;

const renderTemplate = (template: string, payload: Record<string, any> = {}) => {
  let rendered = template;

  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim();
    const value = trimmedKey
      .split('.')
      .reduce((obj: any, k: string) => obj && obj[k], payload);
    return value !== undefined ? String(value) : match;
  });

  rendered = rendered.replace(
    /{{#if (.*?)}}(.*?){{\/if}}/gs,
    (match, key, content) => {
      const trimmedKey = key.trim();
      const value = trimmedKey
        .split('.')
        .reduce((obj: any, k: string) => obj && obj[k], payload);
      return value ? content : '';
    }
  );

  return rendered;
};

const getEmailSettingsForUnit = async (
  unitId: string
): Promise<EmailSettingsDocument> => {
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
  if (unitSettings.adminDefaultEmail)
    recipients.add(unitSettings.adminDefaultEmail);
  if (defaultSettings.adminDefaultEmail)
    recipients.add(defaultSettings.adminDefaultEmail);
  (legacyRecipients || []).forEach(email => recipients.add(email));

  return Array.from(recipients);
};

const resolveEmailTemplate = async (
  unitId: string | null,
  typeId: TemplateId,
  payload: any
) => {
  const unitSettings = await getEmailSettingsForUnit(unitId || 'default');
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitOverride = unitSettings.templateOverrides?.[typeId];
  const defaultOverride = defaultSettings.templateOverrides?.[typeId];
  const hardcoded = defaultTemplates[typeId];

  const subjectTemplate =
    unitOverride?.subject || defaultOverride?.subject || hardcoded.subject;
  const htmlTemplate =
    unitOverride?.html || defaultOverride?.html || hardcoded.html;

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
  const bookingTimeTo = booking.endTime
    ? ` – ${formatTime(booking.endTime, locale)}`
    : '';

  return {
    guestName: booking.name || '',
    unitName,
    bookingDate,
    bookingTimeFrom,
    bookingTimeTo,
    headcount: booking.headcount || 0,
    decisionLabel,
    bookingRef:
      booking.referenceCode?.substring(0, 8).toUpperCase() || '',
    guestEmail: booking.contact?.email || booking.email || '',
    guestPhone: booking.contact?.phoneE164 || booking.phone || '',
    occasion: booking.occasion || '',
    notes: booking.notes || '',
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

const getReservationSettings = async (
  unitId: string
): Promise<ReservationSettings> => {
  try {
    const snap = await db.doc(`reservation_settings/${unitId}`).get();
    if (!snap.exists) return {};
    return snap.data() as ReservationSettings;
  } catch (err) {
    functions.logger.error('Failed to fetch reservation settings', {
      unitId,
      err,
    });
    return {};
  }
};

// ---------- EMAIL SENDERS ----------

const sendGuestCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  await shouldSendEmail('booking_created_guest', unitId);

  const payload = buildPayload(booking, unitName, locale, '');
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_created_guest',
    payload
  );

  await sendEmail({
    typeId: 'booking_created_guest',
    unitId,
    to: guestEmail,
    subject,
    html,
    payload,
  });
};

const sendAdminCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_created_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  await shouldSendEmail('booking_created_admin', unitId);

  const locale = booking.locale || 'hu';
  const payload = buildPayload(booking, unitName, locale, '');
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_created_admin',
    payload
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_created_admin',
        unitId,
        to,
        subject,
        html,
        payload,
      })
    )
  );
};

const sendGuestStatusEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  await shouldSendEmail('booking_status_updated_guest', unitId);

  const decisionLabel =
    booking.status === 'confirmed'
      ? decisionLabels[locale].approved
      : decisionLabels[locale].rejected;

  const payload = buildPayload(booking, unitName, locale, decisionLabel);
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_status_updated_guest',
    payload
  );

  await sendEmail({
    typeId: 'booking_status_updated_guest',
    unitId,
    to: guestEmail,
    subject,
    html,
    payload,
  });
};

const sendAdminCancellationEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const cancellationRecipients = await getAdminRecipientsOverride(
    unitId,
    'booking_cancelled_admin',
    legacyRecipients
  );
  const createdRecipients = await getAdminRecipientsOverride(
    unitId,
    'booking_created_admin',
    legacyRecipients
  );

  const recipients = Array.from(
    new Set([...(cancellationRecipients || []), ...(createdRecipients || [])])
  );
  if (!recipients.length) return;

  await shouldSendEmail('booking_cancelled_admin', unitId);

  const locale = booking.locale || 'hu';
  const payload = buildPayload(
    booking,
    unitName,
    locale,
    decisionLabels[locale].cancelled
  );
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_cancelled_admin',
    payload
  );

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

const sendGuestModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  await shouldSendEmail('booking_modified_guest', unitId);

  const payload = buildPayload(booking, unitName, locale, '');
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_modified_guest',
    payload
  );

  await sendEmail({
    typeId: 'booking_modified_guest',
    unitId,
    to: guestEmail,
    subject,
    html,
    payload,
  });
};

const sendAdminModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_modified_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  await shouldSendEmail('booking_modified_admin', unitId);

  const locale = booking.locale || 'hu';
  const payload = buildPayload(booking, unitName, locale, '');
  const { subject, html } = await resolveEmailTemplate(
    unitId,
    'booking_modified_admin',
    payload
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_modified_admin',
        unitId,
        to,
        subject,
        html,
        payload,
      })
    )
  );
};

// ---------- CHANGE DETECTOR ----------

const hasMeaningfulEdit = (before: BookingRecord, after: BookingRecord) => {
  const fields: (keyof BookingRecord)[] = [
    'name',
    'headcount',
    'occasion',
    'startTime',
    'endTime',
    'notes',
    'phone',
    'email',
    'reservationMode',
  ];

  return fields.some(f => {
    const b: any = (before as any)[f];
    const a: any = (after as any)[f];

    const bVal = b?.toMillis ? b.toMillis() : b;
    const aVal = a?.toMillis ? a.toMillis() : a;

    return bVal !== aVal;
  });
};

// ---------- TRIGGERS ----------

export const onReservationCreated = onDocumentCreated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const booking = event.data?.data() as BookingRecord | undefined;
    if (!booking) return;

    const unitId = event.params.unitId as string;
    const unitName = await getUnitName(unitId);

    const tasks: Promise<void>[] = [];

    tasks.push(
      sendGuestCreatedEmail(unitId, booking, unitName).catch(err =>
        logger.error("Failed to send guest created email", { unitId, err })
      )
    );

    tasks.push(
      sendAdminCreatedEmail(unitId, booking, unitName).catch(err =>
        functions.logger.error('Failed to send admin created email', {
          unitId,
          err,
        })
      )
    );

    await Promise.all(tasks);
  });

export const onReservationCreated = onDocumentCreated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const booking = event.data?.data() as BookingRecord | undefined;
    if (!booking) return;

    const unitId = event.params.unitId as string;
    const unitName = await getUnitName(unitId);

    const tasks: Promise<void>[] = [];

    tasks.push(
      sendGuestCreatedEmail(unitId, booking, unitName).catch(err =>
        logger.error("Failed to send guest created email", { unitId, err })
      )
    );

    tasks.push(
      sendAdminCreatedEmail(unitId, booking, unitName).catch(err =>
        logger.error("Failed to send admin created email", { unitId, err })
      )
    );

    await Promise.all(tasks);
  }
);

export const onReservationStatusChange = onDocumentUpdated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const before = event.data?.before.data() as BookingRecord | undefined;
    const after = event.data?.after.data() as BookingRecord | undefined;
    if (!before || !after) return;

    const statusChanged = before.status !== after.status;
    const statusOrCancelChanged =
      statusChanged || before.cancelledBy !== after.cancelledBy;

    const edited = hasMeaningfulEdit(before, after);

    if (!statusOrCancelChanged && !edited) return;

    const unitId = event.params.unitId as string;
    const bookingId = event.params.bookingId as string;

    logger.info("TRIGGER FIRED", {
      unitId,
      bookingId,
      beforeStatus: before.status,
      afterStatus: after.status,
      beforeCancelledBy: before.cancelledBy,
      afterCancelledBy: after.cancelledBy,
      edited,
    });

    const unitName = await getUnitName(unitId);

    const adminDecision =
      statusChanged &&
      before.status === "pending" &&
      (after.status === "confirmed" || after.status === "cancelled");

    const guestCancelled =
      statusChanged &&
      after.status === "cancelled" &&
      after.cancelledBy === "guest";

    const tasks: Promise<void>[] = [];

    if (adminDecision) {
      tasks.push(
        sendGuestStatusEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send guest status email", { unitId, err })
        )
      );
    }

    if (guestCancelled) {
      tasks.push(
        sendAdminCancellationEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send admin cancellation email", { unitId, err })
        )
      );
    }

    if (edited && !statusChanged) {
      tasks.push(
        sendGuestModifiedEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send guest modified email", { unitId, err })
        )
      );
      tasks.push(
        sendAdminModifiedEmail(unitId, after, unitName).catch(err =>
          logger.error("Failed to send admin modified email", { unitId, err })
        )
      );
    }

    await Promise.all(tasks);
  }
);
