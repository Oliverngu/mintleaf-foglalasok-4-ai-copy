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
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#ecfdf3,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#16a34a;font-weight:700;">Foglalás beérkezett</p>
                    <h1 style="margin:0;font-size:24px;color:#065f46;">Foglalásodat megkaptuk</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Kedves {{guestName}}!</p>
                    <p style="margin:6px 0 0 0;color:#475569;">Köszönjük a foglalást a(z) <strong style="color:#0f172a;">{{unitName}}</strong> egységbe. Hamarosan visszajelzünk a státuszról.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      {{#if occasion}}<tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Alkalom</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{occasion}}{{#if occasionOther}} – {{occasionOther}}{{/if}}</td>
                      </tr>{{/if}}
                      {{#if notes}}<tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Megjegyzés</td>
                        <td style="font-size:15px;color:#0f172a;">{{notes}}</td>
                      </tr>{{/if}}
                      {{#if bookingRef}}<tr>
                        <td style="width:180px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  },

  booking_created_admin: {
    subject:
      'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő) – {{guestName}}',
    html: `
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#ecfdf3,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#16a34a;font-weight:700;">Új foglalási kérelem</p>
                    <h1 style="margin:0;font-size:24px;color:#065f46;">Új foglalás érkezett</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Egység: <strong style="color:#0f172a;">{{unitName}}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Vendég neve</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{guestName}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      {{#if occasion}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Alkalom</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{occasion}}{{#if occasionOther}} – {{occasionOther}}{{/if}}</td>
                      </tr>{{/if}}
                      {{#if notes}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Megjegyzés</td>
                        <td style="font-size:15px;color:#0f172a;">{{notes}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Email</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestEmail}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Telefon</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestPhone}}</td>
                      </tr>
                      {{#if bookingRef}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  },

  booking_status_updated_guest: {
    subject:
      'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
    html: `
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#ecfdf3,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#16a34a;font-weight:700;">Foglalás frissült</p>
                    <h1 style="margin:0;font-size:24px;color:#065f46;">Státusz: {{decisionLabel}}</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Kedves {{guestName}}!</p>
                    <p style="margin:6px 0 0 0;color:#475569;">A(z) <strong style="color:#0f172a;">{{unitName}}</strong> egységnél leadott foglalásod státusza frissült.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      {{#if bookingRef}}<tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  },

  booking_cancelled_admin: {
    subject:
      'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#fef2f2,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#dc2626;font-weight:700;">Lemondva vendég által</p>
                    <h1 style="margin:0;font-size:24px;color:#7f1d1d;">Foglalás lemondva</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Egység: <strong style="color:#0f172a;">{{unitName}}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Vendég neve</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{guestName}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Email</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestEmail}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Telefon</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestPhone}}</td>
                      </tr>
                      {{#if bookingRef}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  },

  booking_modified_guest: {
    subject: 'Foglalás módosítva: {{bookingDate}} {{bookingTimeFrom}}',
    html: `
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#ecfdf3,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#16a34a;font-weight:700;">Foglalás módosítva</p>
                    <h1 style="margin:0;font-size:24px;color:#065f46;">Frissített adatok</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Kedves {{guestName}}!</p>
                    <p style="margin:6px 0 0 0;color:#475569;">A(z) <strong style="color:#0f172a;">{{unitName}}</strong> egységnél a foglalásod módosult.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      {{#if bookingRef}}<tr>
                        <td style="width:190px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `,
  },

  booking_modified_admin: {
    subject:
      'Foglalás módosítva (admin): {{bookingDate}} {{bookingTimeFrom}} – {{guestName}}',
    html: `
      <div style="margin:0;padding:24px 0;background:#f8fafc;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;color:#0f172a;line-height:1.6;">
                <tr>
                  <td style="padding:28px 32px 12px 32px;background:linear-gradient(135deg,#ecfdf3,#ffffff);">
                    <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#16a34a;font-weight:700;">Foglalás módosítva</p>
                    <h1 style="margin:0;font-size:24px;color:#065f46;">Frissített adatok</h1>
                    <p style="margin:10px 0 0 0;color:#475569;">Egység: <strong style="color:#0f172a;">{{unitName}}</strong></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 28px 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 10px;">
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Vendég neve</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{guestName}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Dátum</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingDate}}</td>
                      </tr>
                      {{#if bookingTimeRange}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Időpont</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</td>
                      </tr>{{/if}}
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Létszám</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{headcount}} fő</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Email</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestEmail}}</td>
                      </tr>
                      <tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Telefon</td>
                        <td style="font-size:15px;color:#0f172a;">{{guestPhone}}</td>
                      </tr>
                      {{#if bookingRef}}<tr>
                        <td style="width:200px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Hivatkozás</td>
                        <td style="font-size:15px;font-weight:700;color:#0f172a;">{{bookingRef}}</td>
                      </tr>{{/if}}
                    </table>
                    {{#if publicBaseUrl}}
                      <div style="margin-top:18px;">
                        <a href="{{publicBaseUrl}}/manage?token={{bookingId}}" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid #16a34a;background:#16a34a;color:#ffffff;font-weight:700;font-size:14px;text-decoration:none;">Foglalás megtekintése</a>
                      </div>
                    {{/if}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
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

  // Firestore Timestamp mind admin, mind client oldalon tud toDate()-et
  const anyV = v as any;
  if (typeof anyV.toDate === "function") return anyV.toDate();

  // fallback, ha valami furcsa jön
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

const buildCustomFieldsHtml = (
  customSelects: CustomSelectField[] = [],
  customData: Record<string, string> = {},
  mutedColor: string
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

  if (!items.length) return '';

  const listItems = items
    .map(
      item =>
        `<li style="margin: 4px 0; padding: 0; list-style: none;"><strong>${item.label}:</strong> <span style="color: ${mutedColor};">${item.value}</span></li>`
    )
    .join('');

  return `
    <div style="margin-top: 12px;">
      <strong>További adatok:</strong>
      <ul style="margin: 8px 0 0 0; padding: 0;">
        ${listItems}
      </ul>
    </div>
  `;
};

const buildDetailsCardHtml = (
  payload: Record<string, any>,
  theme: 'light' | 'dark' = 'light'
) => {
  const isDark = theme === 'dark';
  const background = isDark ? '#111827' : '#f9fafb';
  const cardBackground = isDark ? '#1f2937' : '#ffffff';
  const borderColor = isDark ? '#374151' : '#e5e7eb';
  const textColor = isDark ? '#e5e7eb' : '#111827';
  const mutedColor = isDark ? '#9ca3af' : '#4b5563';

  const customFieldsHtml = buildCustomFieldsHtml(
    payload.customSelects,
    payload.customData || {},
    mutedColor
  );

  const statusRow = payload.decisionLabel
    ? `<div style="display: flex; gap: 8px; align-items: center;"><strong>Státusz:</strong><span style="display: inline-flex; padding: 4px 10px; border-radius: 9999px; background: ${
        payload.status === 'confirmed' ? '#dcfce7' : '#fee2e2'
      }; color: ${payload.status === 'confirmed' ? '#166534' : '#991b1b'}; font-weight: 700;">${
        payload.decisionLabel
      }</span></div>`
    : '';

  const occasionRow = payload.occasion
    ? `<div><strong>Alkalom:</strong> <span style="color: ${mutedColor};">${payload.occasion}</span></div>`
    : '';

  const occasionOtherRow = payload.occasionOther
    ? `<div><strong>Alkalom (egyéb):</strong> <span style="color: ${mutedColor};">${payload.occasionOther}</span></div>`
    : '';

  const notesRow = payload.notes
    ? `<div style="margin-top: 12px;"><strong>Megjegyzés:</strong><div style="margin-top: 4px; color: ${mutedColor}; white-space: pre-line;">${payload.notes}</div></div>`
    : '';

  const autoConfirmRow =
    payload.reservationMode === 'auto'
      ? payload.locale === 'en'
        ? 'Yes'
        : 'Igen'
      : payload.locale === 'en'
      ? 'No'
      : 'Nem';

  return `
    <div class="mintleaf-card-wrapper" style="background: ${background}; padding: 16px;">
      <div
        class="mintleaf-card"
        style="background: ${cardBackground}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 24px; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${textColor};"
      >
        <h3 style="margin: 0 0 12px 0; font-size: 20px;">Foglalás részletei</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; font-size: 14px; line-height: 1.5;">
          <div><strong>Egység neve:</strong> <span style="color: ${mutedColor};">${payload.unitName}</span></div>
          <div><strong>Vendég neve:</strong> <span style="color: ${mutedColor};">${payload.guestName}</span></div>
          <div><strong>Dátum:</strong> <span style="color: ${mutedColor};">${payload.bookingDate}</span></div>
          <div><strong>Időpont:</strong> <span style="color: ${mutedColor};">${payload.bookingTimeRange}</span></div>
          <div><strong>Létszám:</strong> <span style="color: ${mutedColor};">${payload.headcount}</span></div>
          ${occasionRow}
          ${occasionOtherRow}
          <div><strong>Email:</strong> <span style="color: ${mutedColor};">${payload.guestEmail}</span></div>
          <div><strong>Telefon:</strong> <span style="color: ${mutedColor};">${payload.guestPhone}</span></div>
          <div><strong>Foglalás azonosító:</strong> <span style="color: ${mutedColor};">${payload.bookingRef}</span></div>
          <div><strong>Automatikus megerősítés:</strong> <span style="color: ${mutedColor};">${autoConfirmRow}</span></div>
        </div>
        ${statusRow}
        ${customFieldsHtml}
        ${notesRow}
      </div>
    </div>
    <style>
      .mintleaf-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 12px 18px;
        border-radius: 9999px;
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-weight: 700;
        text-decoration: none;
        background: #16a34a;
        color: #ffffff;
        border: 1px solid transparent;
      }
      .mintleaf-btn-danger {
        background: #dc2626;
      }
      @media (prefers-color-scheme: dark) {
        .mintleaf-card-wrapper { background-color: #111827 !important; }
        .mintleaf-card { background-color: #1f2937 !important; border-color: #374151 !important; color: #e5e7eb !important; }
        .mintleaf-card strong { color: #e5e7eb !important; }
        .mintleaf-card span { color: #d1d5db !important; }
        .mintleaf-btn { color: #ffffff !important; }
      }
    </style>
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
    guestName: booking.name || 'Vendég',
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

// ---------- EMAIL SENDERS ----------

const buildButtonBlock = (
  buttons: { label: string; url: string; variant?: 'primary' | 'danger' }[],
  theme: 'light' | 'dark'
) => {
  const background = theme === 'dark' ? '#111827' : '#f9fafb';
  const spacing =
    '<span style="display: inline-block; width: 4px; height: 4px;"></span>';
  const buttonsHtml = buttons
    .map(
      btn =>
        `<a class="mintleaf-btn${btn.variant === 'danger' ? ' mintleaf-btn-danger' : ''}" href="${btn.url}" style="background: ${
          btn.variant === 'danger' ? '#dc2626' : '#16a34a'
        }; color: #ffffff; text-decoration: none;">${btn.label}</a>`
    )
    .join(spacing);

  return `
    <div class="mintleaf-card-wrapper" style="background: ${background}; padding: 16px 16px 0 16px; display: flex; gap: 12px; flex-wrap: wrap;">
      ${buttonsHtml}
    </div>
  `;
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

  const extraHtml = `${buildButtonBlock(
    [
      {
        label: 'FOGLALÁS MÓDOSÍTÁSA',
        url: manageUrl,
      },
    ],
    theme
  )}${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

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

  const extraHtml = `${
    showAdminButtons
      ? buildButtonBlock(
          [
            { label: 'ELFOGADÁS', url: manageApproveUrl },
            { label: 'ELUTASÍTÁS', url: manageRejectUrl, variant: 'danger' },
          ],
          theme
        )
      : ''
  }${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

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

  const extraHtml = `${buildButtonBlock(
    [
      {
        label: 'FOGLALÁS MÓDOSÍTÁSA',
        url: manageUrl,
      },
    ],
    theme
  )}${buildDetailsCardHtml(payload, theme)}`;

  const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);

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
    buildDetailsCardHtml(payload, theme)
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
  unitName: string
) => {
  const locale = booking.locale || 'hu';
  const guestEmail = booking.contact?.email || booking.email;
  if (!guestEmail) return;

  const allowed = await shouldSendEmail('booking_modified_guest', unitId);
  if (!allowed) return;

  const payload = buildPayload(booking, unitName, locale, '');
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_guest',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_guest.subject,
    payload
  );
  const html = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_guest.html,
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

  const allowed = await shouldSendEmail('booking_modified_admin', unitId);
  if (!allowed) return;

  const locale = booking.locale || 'hu';
  const payload = buildPayload(booking, unitName, locale, '');
  const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(
    unitId,
    'booking_modified_admin',
    payload
  );

  const subject = renderTemplate(
    rawSubject || defaultTemplates.booking_modified_admin.subject,
    payload
  );
  const html = renderTemplate(
    rawHtml || defaultTemplates.booking_modified_admin.html,
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
