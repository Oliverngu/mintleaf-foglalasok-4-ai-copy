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
  customData?: Record<string, any>;
}

interface EmailSettingsDocument {
  enabledTypes?: Record<string, boolean>;
  adminRecipients?: Record<string, string[]>;
  templateOverrides?: Record<string, { subject: string; html: string }>;
  adminDefaultEmail?: string;
}

interface CustomSelectField {
  id: string;
  label: string;
  options?: string[];
}

interface ReservationSettings {
  notificationEmails?: string[];
  guestForm?: {
    customSelects?: CustomSelectField[];
  };
  publicBaseUrl?: string;
  themeMode?: 'light' | 'dark';
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
        <li><strong>Időpont:</strong> {{bookingTimeRange}}</li>
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
    logger.error('Failed to fetch email settings', { unitId, err });
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
    subject: subjectTemplate,
    html: htmlTemplate,
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
  try {
    const response = await fetch(EMAIL_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      logger.error("EMAIL GATEWAY ERROR", {
        status: response.status,
        body: text,
        typeId: params.typeId,
        unitId: params.unitId,
        to: params.to,
      });
      throw new Error(`Email gateway error ${response.status}: ${text}`);
    }

    logger.info("EMAIL GATEWAY OK", {
      status: response.status,
      typeId: params.typeId,
      unitId: params.unitId,
      to: params.to,
    });
  } catch (err: any) {
    logger.error("sendEmail() FAILED", {
      typeId: params.typeId,
      unitId: params.unitId,
      to: params.to,
      message: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
};

type TimestampLike =
  | FirebaseFirestore.Timestamp
  | admin.firestore.Timestamp;

const toJsDate = (v: TimestampLike | Date | null | undefined): Date => {
  if (!v) return new Date(0);
  if (v instanceof Date) return v;

  const anyV = v as any;
  if (typeof anyV.toDate === "function") return anyV.toDate();

  return new Date(anyV);
};

const buildTimeFields = (
  start: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date,
  end: FirebaseFirestore.Timestamp | admin.firestore.Timestamp | Date | null | undefined,
  locale: 'hu' | 'en'
) => {
  const date = toJsDate(start);
  const endDate = end ? toJsDate(end) : null;

  const dateFormatter = new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat(locale === 'hu' ? 'hu-HU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const bookingDate = dateFormatter.format(date);
  const bookingTimeFrom = timeFormatter.format(date);
  const bookingTimeTo = endDate ? timeFormatter.format(endDate) : '';
  const bookingTimeRange = bookingTimeTo
    ? `${bookingTimeFrom} – ${bookingTimeTo}`
    : bookingTimeFrom;

  return { bookingDate, bookingTimeFrom, bookingTimeTo, bookingTimeRange };
};

const buildCustomFieldItems = (
  customSelects: CustomSelectField[] = [],
  customData: Record<string, string> = {}
) => {
  const items: { label: string; value: string }[] = [];

  customSelects.forEach(select => {
    const value = customData[select.id];
    const displayValue = value === undefined || value === null ? '' : String(value);
    if (displayValue) {
      items.push({ label: select.label, value: displayValue });
    }
  });

  Object.entries(customData || {}).forEach(([key, value]) => {
    const displayValue = value === undefined || value === null ? '' : String(value);
    if (!displayValue) return;
    if (key === 'occasion' || key === 'occasionOther') return;
    if (customSelects.some(select => select.id === key)) return;
    items.push({ label: key, value: displayValue });
  });

  return items;
};

const buildUnifiedEmailSection = (
  payload: Record<string, any>,
  theme: 'light' | 'dark',
  actions: { label: string; url: string; variant?: 'primary' | 'danger' }[] = []
) => {
  const isDark = theme === 'dark';
  const background = isDark ? '#0f172a' : '#f4f7fb';
  const cardBackground = isDark ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.82)';
  const borderColor = isDark ? '#1f2937' : '#e5e7eb';
  const textColor = isDark ? '#e5e7eb' : '#0f172a';
  const mutedColor = isDark ? '#cbd5e1' : '#4b5563';
  const chipBg = isDark ? 'rgba(52,211,153,0.12)' : '#ecfdf3';
  const chipColor = isDark ? '#34d399' : '#15803d';

  const yesText = payload.locale === 'en' ? 'Yes' : 'Igen';
  const noText = payload.locale === 'en' ? 'No' : 'Nem';

  const labels = payload.locale === 'en'
    ? {
        details: 'Reservation details',
        unit: 'Unit name',
        guest: 'Guest name',
        date: 'Date',
        time: 'Time range',
        headcount: 'Headcount',
        occasion: 'Occasion',
        email: 'Email',
        phone: 'Phone',
        ref: 'Booking reference',
        auto: 'Auto confirm',
        status: 'Status',
        custom: 'Additional details',
      }
    : {
        details: 'Foglalás részletei',
        unit: 'Egység neve',
        guest: 'Vendég neve',
        date: 'Dátum',
        time: 'Időpont',
        headcount: 'Létszám',
        occasion: 'Alkalom',
        email: 'Email',
        phone: 'Telefon',
        ref: 'Foglalási azonosító',
        auto: 'Automatikus megerősítés',
        status: 'Státusz',
        custom: 'További adatok',
      };

  const rows: { label: string; value: string }[] = [
    { label: labels.unit, value: payload.unitName || '' },
    { label: labels.guest, value: payload.guestName || '' },
    { label: labels.date, value: payload.bookingDate || '' },
    { label: labels.time, value: payload.bookingTimeRange || '' },
    { label: labels.headcount, value: `${payload.headcount || 0}` },
  ];

  if (payload.occasion) rows.push({ label: labels.occasion, value: payload.occasion });
  if (payload.guestEmail) rows.push({ label: labels.email, value: payload.guestEmail });
  if (payload.guestPhone) rows.push({ label: labels.phone, value: payload.guestPhone });
  if (payload.bookingRef) rows.push({ label: labels.ref, value: payload.bookingRef });
  rows.push({ label: labels.auto, value: payload.reservationMode === 'auto' ? yesText : noText });
  if (payload.decisionLabel) rows.push({ label: labels.status, value: payload.decisionLabel });

  const customItems = buildCustomFieldItems(payload.customSelects, payload.customData || {});

  const actionsHtml = actions.length
    ? `<div style="margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px;">
        ${actions
          .map(
            (btn) =>
              `<a href="${btn.url}" style="text-decoration: none; font-family: 'Inter', sans-serif; font-weight: 700; padding: 12px 18px; border-radius: 12px; border: 1px solid ${btn.variant === 'danger' ? '#ef4444' : '#10b981'}; background: ${btn.variant === 'danger' ? '#fee2e2' : '#ecfdf3'}; color: ${btn.variant === 'danger' ? '#991b1b' : '#166534'}; display: inline-block; box-shadow: 0 10px 30px rgba(0,0,0,0.06);">${btn.label}</a>`
          )
          .join('')}
      </div>`
    : '';

  const detailGrid = rows
    .map(
      (row) => `
        <div style="padding: 12px 14px; border-radius: 12px; background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.02)'}; border: 1px solid ${borderColor};">
          <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: ${mutedColor}; font-family: 'Inter', sans-serif;">${row.label}</div>
          <div style="margin-top: 6px; font-size: 15px; color: ${textColor}; font-family: 'Inter', sans-serif; line-height: 1.5;">${row.value}</div>
        </div>`
    )
    .join('');

  const customSection = customItems.length
    ? `
      <div style="margin-top: 16px;">
        <div style="font-size: 13px; color: ${mutedColor}; letter-spacing: 0.08em; text-transform: uppercase; font-family: 'Inter', sans-serif; margin-bottom: 6px;">${labels.custom}</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
          ${customItems
            .map(
              (item) => `
                <div style="padding: 10px 12px; border-radius: 12px; background: ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.02)'}; border: 1px solid ${borderColor};">
                  <div style="font-size: 12px; color: ${mutedColor}; font-family: 'Inter', sans-serif; letter-spacing: 0.05em; text-transform: uppercase;">${item.label}</div>
                  <div style="margin-top: 4px; font-size: 14px; color: ${textColor}; font-family: 'Inter', sans-serif;">${item.value}</div>
                </div>`
            )
            .join('')}
        </div>
      </div>`
    : '';

  return `
    <div style="background: ${background}; padding: 18px;">
      <div style="max-width: 760px; margin: 0 auto; background: ${cardBackground}; border: 1px solid ${borderColor}; border-radius: 18px; padding: 24px; box-shadow: 0 24px 70px rgba(15,23,42,0.12); backdrop-filter: blur(12px); color: ${textColor};">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px;">
          <div>
            <div style="font-size: 13px; color: ${mutedColor}; letter-spacing: 0.12em; text-transform: uppercase; font-family: 'Inter', sans-serif;">${labels.details}</div>
            <h2 style="margin: 4px 0 0; font-size: 24px; color: ${textColor}; font-family: 'Playfair Display', serif;">${payload.unitName || ''}</h2>
          </div>
          ${payload.decisionLabel ? `<span style="padding: 8px 14px; border-radius: 9999px; background: ${chipBg}; color: ${chipColor}; font-weight: 700; font-family: 'Inter', sans-serif; border: 1px solid ${borderColor};">${payload.decisionLabel}</span>` : ''}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;">
          ${detailGrid}
        </div>
        ${customSection}
        ${actionsHtml}
      </div>
    </div>
  `;
};

const appendHtmlSafely = (baseHtml: string, extraHtml: string): string => {
  if (!baseHtml) return extraHtml;

  if (/<\/body>/i.test(baseHtml)) {
    return baseHtml.replace(/<\/body>/i, `${extraHtml}</body>`);
  }

  if (/<\/html>/i.test(baseHtml)) {
    return baseHtml.replace(/<\/html>/i, `${extraHtml}</html>`);
  }

  return `${baseHtml}${extraHtml}`;
};

const getPublicBaseUrl = (settings?: ReservationSettings) => {
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL;
  const baseUrl = settings?.publicBaseUrl || envUrl || 'https://mintleaf.hu';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const buildPayload = (
  booking: BookingRecord,
  unitName: string,
  locale: 'hu' | 'en',
  decisionLabel: string,
  options: {
    bookingId?: string;
    customSelects?: CustomSelectField[];
    publicBaseUrl?: string;
  } = {}
) => {
  const { bookingDate, bookingTimeFrom, bookingTimeTo, bookingTimeRange } = buildTimeFields(
    booking.startTime,
    booking.endTime,
    locale
  );

  const customData = booking.customData || {};
  const occasion = (customData.occasion as string) || booking.occasion || '';
  const occasionOther = (customData.occasionOther as string) || '';

  const bookingRef =
    booking.referenceCode?.substring(0, 8).toUpperCase() || booking.referenceCode || '';

  return {
    guestName: booking.name || '',
    unitName,
    bookingDate,
    bookingTimeFrom,
    bookingTimeTo,
    bookingTimeRange,
    headcount: booking.headcount || 0,
    decisionLabel,
    bookingRef,
    guestEmail: booking.contact?.email || booking.email || '',
    guestPhone: booking.contact?.phoneE164 || booking.phone || '',
    occasion,
    occasionOther,
    notes: booking.notes || '',
    reservationMode: booking.reservationMode,
    adminActionToken: booking.adminActionToken,
    status: booking.status,
    bookingId: options.bookingId || bookingRef,
    customSelects: options.customSelects || [],
    customData,
    locale,
    publicBaseUrl: options.publicBaseUrl,
  };
};

const getUnitName = async (unitId: string) => {
  try {
    const snap = await db.doc(`units/${unitId}`).get();
    return (snap.data()?.name as string) || 'MintLeaf egység';
  } catch (err) {
    logger.error('Failed to load unit', { unitId, err });
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
    logger.error('Failed to fetch reservation settings', {
      unitId,
      err,
    });
    return {};
  }
};

const sendGuestCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_created_guest', unitId);
  if (!allowed) return;

  const settings = await getReservationSettings(unitId);
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}`;
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_created_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_created_guest.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_created_guest.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(payload, theme, [
      { label: locale === 'en' ? 'Open reservation' : 'Foglalás megnyitása', url: manageUrl },
    ])
  );

  await sendEmail({
    typeId: 'booking_created_guest',
    unitId,
    to: guestEmail,
    subject,
    html: finalHtml,
    payload,
  });
};

const sendAdminCreatedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_created_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  const allowed = await shouldSendEmail('booking_created_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });

  const manageApproveUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}&adminToken=${
    payload.adminActionToken || ''
  }&action=approve`;
  const manageRejectUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}&adminToken=${
    payload.adminActionToken || ''
  }&action=reject`;

  const showAdminButtons =
    booking.reservationMode === 'request' && !!payload.adminActionToken;

  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_created_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_created_admin.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_created_admin.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(
      payload,
      theme,
      showAdminButtons
        ? [
            { label: locale === 'en' ? 'Accept' : 'Elfogadás', url: manageApproveUrl },
            {
              label: locale === 'en' ? 'Reject' : 'Elutasítás',
              url: manageRejectUrl,
              variant: 'danger',
            },
          ]
        : []
    )
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_created_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
      })
    )
  );
};

const sendGuestStatusEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_status_updated_guest', unitId);
  if (!allowed) return;

  const settings = await getReservationSettings(unitId);
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const decisionLabel =
    booking.status === 'confirmed'
      ? decisionLabels[locale].approved
      : decisionLabels[locale].rejected;

  const payload = buildPayload(booking, unitName, locale, decisionLabel, {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}`;
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_status_updated_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_status_updated_guest.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_status_updated_guest.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(payload, theme, [
      { label: locale === 'en' ? 'Open reservation' : 'Foglalás megnyitása', url: manageUrl },
    ])
  );

  await sendEmail({
    typeId: 'booking_status_updated_guest',
    unitId,
    to: guestEmail,
    subject,
    html: finalHtml,
    payload,
  });
};

const sendAdminCancellationEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
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

  const allowed = await shouldSendEmail('booking_cancelled_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(
    booking,
    unitName,
    locale,
    decisionLabels[locale].cancelled,
    {
      bookingId,
      customSelects,
      publicBaseUrl,
    }
  );
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_cancelled_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_cancelled_admin.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_cancelled_admin.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(payload, theme)
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_cancelled_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
      })
    )
  );
};

const sendGuestModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_modified_guest', unitId);
  if (!allowed) return;

  const settings = await getReservationSettings(unitId);
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}`;
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_guest.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_guest.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(payload, theme, [
      { label: locale === 'en' ? 'Open reservation' : 'Foglalás megnyitása', url: manageUrl },
    ])
  );

  await sendEmail({
    typeId: 'booking_modified_guest',
    unitId,
    to: guestEmail,
    subject,
    html: finalHtml,
    payload,
  });
};

const sendAdminModifiedEmail = async (
  unitId: string,
  booking: BookingRecord,
  unitName: string,
  bookingId: string
) => {
  const settings = await getReservationSettings(unitId);
  const legacyRecipients = settings.notificationEmails || [];
  const recipients = await getAdminRecipientsOverride(
    unitId,
    'booking_modified_admin',
    legacyRecipients
  );
  if (!recipients.length) return;

  const allowed = await shouldSendEmail('booking_modified_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const customSelects = settings.guestForm?.customSelects || [];
  const publicBaseUrl = getPublicBaseUrl(settings);
  const theme = settings.themeMode === 'dark' ? 'dark' : 'light';

  const payload = buildPayload(booking, unitName, locale, '', {
    bookingId,
    customSelects,
    publicBaseUrl,
  });
  const manageUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}`;
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_admin.subject,
    payload
  );
  const baseHtmlRendered = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_admin.html,
    payload
  );

  const finalHtml = appendHtmlSafely(
    baseHtmlRendered,
    buildUnifiedEmailSection(payload, theme, [
      { label: locale === 'en' ? 'Open reservation' : 'Foglalás megnyitása', url: manageUrl },
    ])
  );

  await Promise.all(
    recipients.map(to =>
      sendEmail({
        typeId: 'booking_modified_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
      })
    )
  );
};

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

export const onReservationCreated = onDocumentCreated(
  {
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
  },
  async (event) => {
    const booking = event.data?.data() as BookingRecord | undefined;
    if (!booking) return;

    const unitId = event.params.unitId as string;
    const bookingId = event.params.bookingId as string;
    const unitName = await getUnitName(unitId);

    const tasks: Promise<void>[] = [];

    tasks.push(
      sendGuestCreatedEmail(unitId, booking, unitName, bookingId).catch(err =>
        logger.error("Failed to send guest created email", { unitId, err })
      )
    );

    tasks.push(
      sendAdminCreatedEmail(unitId, booking, unitName, bookingId).catch(err =>
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
        sendGuestStatusEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send guest status email", { unitId, err })
        )
      );
    }

    if (guestCancelled) {
      tasks.push(
        sendAdminCancellationEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send admin cancellation email", { unitId, err })
        )
      );
    }

    if (edited && !statusChanged) {
      tasks.push(
        sendGuestModifiedEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send guest modified email", { unitId, err })
        )
      );
      tasks.push(
        sendAdminModifiedEmail(unitId, after, unitName, bookingId).catch(err =>
          logger.error("Failed to send admin modified email", { unitId, err })
        )
      );
    }

    await Promise.all(tasks);
  }
);
