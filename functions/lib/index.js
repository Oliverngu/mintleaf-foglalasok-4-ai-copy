"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReservationStatusChange = exports.onReservationCreated = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const REGION = 'europe-west3';
const EMAIL_GATEWAY_URL = process.env.EMAIL_GATEWAY_URL ||
    'https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send';
const decisionLabels = {
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
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Foglalásodat megkaptuk</h1>
            <p style="margin:0 0 8px;">Kedves {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;">Köszönjük a foglalást a(z) <strong>{{unitName}}</strong> egységbe.</p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalás részletei</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              {{#if occasion}}
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Alkalom</p>
                  <p style="margin:0;font-weight:700;color:#0f172a;">{{occasion}}</p>
                </div>
              {{/if}}
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Hamarosan visszajelzünk a foglalás státuszáról.</p>
          </div>
        </div>
      </div>
    `,
    },
    booking_created_admin: {
        subject: 'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő) – {{guestName}}',
        html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Új foglalási kérelem érkezett</h1>
            <p style="margin:0;color:#0f172a;">Egység: <strong>{{unitName}}</strong></p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalás röviden</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Vendég neve</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestName}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              {{#if occasion}}
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Alkalom</p>
                  <p style="margin:0;font-weight:700;color:#0f172a;">{{occasion}}</p>
                </div>
              {{/if}}
              {{#if notes}}
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Megjegyzés</p>
                  <p style="margin:0;font-weight:700;color:#0f172a;">{{notes}}</p>
                </div>
              {{/if}}
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Email</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestEmail}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Telefon</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestPhone}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Ref: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Döntés a rendszerben.</p>
          </div>
        </div>
      </div>
    `,
    },
    booking_status_updated_guest: {
        subject: 'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
        html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Foglalás frissítése</h1>
            <p style="margin:0 0 8px;">Kedves {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;">A(z) <strong>{{unitName}}</strong> egységnél leadott foglalásod státusza frissült.</p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalás részletei</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Döntés</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{decisionLabel}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Köszönjük a türelmedet!</p>
          </div>
        </div>
      </div>
    `,
    },
    booking_cancelled_admin: {
        subject: 'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
        html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Vendég lemondta a foglalást</h1>
            <p style="margin:0;color:#0f172a;">Egység: <strong>{{unitName}}</strong></p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalás részletei</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Vendég neve</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestName}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Email</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestEmail}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Telefon</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestPhone}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">A foglalás le lett mondva a vendég oldaláról.</p>
          </div>
        </div>
      </div>
    `,
    },
    booking_modified_guest: {
        subject: 'Foglalás módosítva: {{bookingDate}} {{bookingTimeFrom}}',
        html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Foglalás módosítva</h1>
            <p style="margin:0 0 8px;">Kedves {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;">A(z) <strong>{{unitName}}</strong> egységnél a foglalásod adatai módosultak.</p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Új részletek</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Köszönjük a rugalmas együttműködést!</p>
          </div>
        </div>
      </div>
    `,
    },
    booking_modified_admin: {
        subject: 'Foglalás módosítva (admin): {{bookingDate}} {{bookingTimeFrom}} – {{guestName}}',
        html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Foglalás módosítva</h1>
            <p style="margin:0;color:#0f172a;">Egység: <strong>{{unitName}}</strong></p>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:22px 32px;">
            <h2 style="margin:0 0 12px;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Új részletek</h2>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Vendég neve</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestName}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Dátum</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingDate}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Időpont</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeRange}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Email</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestEmail}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Telefon</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{guestPhone}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Ref: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Frissített adatok elérhetőek a rendszerben.</p>
          </div>
        </div>
      </div>
    `,
    },
};
const renderTemplate = (template, payload = {}) => {
    let rendered = template;
    rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
        const trimmedKey = key.trim();
        const value = trimmedKey
            .split('.')
            .reduce((obj, k) => obj && obj[k], payload);
        return value !== undefined ? String(value) : match;
    });
    rendered = rendered.replace(/{{#if (.*?)}}(.*?){{\/if}}/gs, (match, key, content) => {
        const trimmedKey = key.trim();
        const value = trimmedKey
            .split('.')
            .reduce((obj, k) => obj && obj[k], payload);
        return value ? content : '';
    });
    return rendered;
};
const getEmailSettingsForUnit = async (unitId) => {
    const defaultSettings = {
        enabledTypes: {},
        adminRecipients: {},
        templateOverrides: {},
        adminDefaultEmail: '',
    };
    try {
        const snap = await db.doc(`email_settings/${unitId}`).get();
        if (!snap.exists)
            return defaultSettings;
        const data = snap.data();
        return {
            enabledTypes: data.enabledTypes || {},
            adminRecipients: data.adminRecipients || {},
            templateOverrides: data.templateOverrides || {},
            adminDefaultEmail: data.adminDefaultEmail || '',
        };
    }
    catch (err) {
        v2_1.logger.error('Failed to fetch email settings', { unitId, err });
        return defaultSettings;
    }
};
const shouldSendEmail = async (typeId, unitId) => {
    if (!unitId)
        return true;
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
const getAdminRecipientsOverride = async (unitId, typeId, legacyRecipients = []) => {
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
    const recipients = new Set();
    if (unitSettings.adminDefaultEmail)
        recipients.add(unitSettings.adminDefaultEmail);
    if (defaultSettings.adminDefaultEmail)
        recipients.add(defaultSettings.adminDefaultEmail);
    (legacyRecipients || []).forEach(email => recipients.add(email));
    return Array.from(recipients);
};
const resolveEmailTemplate = async (unitId, typeId, payload) => {
    const unitSettings = await getEmailSettingsForUnit(unitId || 'default');
    const defaultSettings = await getEmailSettingsForUnit('default');
    const unitOverride = unitSettings.templateOverrides?.[typeId];
    const defaultOverride = defaultSettings.templateOverrides?.[typeId];
    const hardcoded = defaultTemplates[typeId];
    const subjectTemplate = unitOverride?.subject || defaultOverride?.subject || hardcoded.subject;
    const htmlTemplate = unitOverride?.html || defaultOverride?.html || hardcoded.html;
    return {
        subject: subjectTemplate,
        html: htmlTemplate,
    };
};
const sendEmail = async (params) => {
    try {
        const response = await fetch(EMAIL_GATEWAY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        });
        const text = await response.text().catch(() => "");
        if (!response.ok) {
            v2_1.logger.error("EMAIL GATEWAY ERROR", {
                status: response.status,
                body: text,
                typeId: params.typeId,
                unitId: params.unitId,
                to: params.to,
            });
            throw new Error(`Email gateway error ${response.status}: ${text}`);
        }
        v2_1.logger.info("EMAIL GATEWAY OK", {
            status: response.status,
            typeId: params.typeId,
            unitId: params.unitId,
            to: params.to,
        });
    }
    catch (err) {
        v2_1.logger.error("sendEmail() FAILED", {
            typeId: params.typeId,
            unitId: params.unitId,
            to: params.to,
            message: err?.message,
            stack: err?.stack,
        });
        throw err;
    }
};
const toJsDate = (v) => {
    if (!v)
        return new Date(0);
    if (v instanceof Date)
        return v;
    // Firestore Timestamp mind admin, mind client oldalon tud toDate()-et
    const anyV = v;
    if (typeof anyV.toDate === "function")
        return anyV.toDate();
    // fallback, ha valami furcsa jön
    return new Date(anyV);
};
const buildTimeFields = (start, end, locale) => {
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
const buildCustomFieldsHtml = (customSelects = [], customData = {}, mutedColor) => {
    const items = [];
    customSelects.forEach(select => {
        const value = customData[select.id];
        const displayValue = value === undefined || value === null ? '' : String(value);
        if (displayValue) {
            items.push({ label: select.label, value: displayValue });
        }
    });
    Object.entries(customData || {}).forEach(([key, value]) => {
        const displayValue = value === undefined || value === null ? '' : String(value);
        if (!displayValue)
            return;
        if (key === 'occasion' || key === 'occasionOther')
            return;
        if (customSelects.some(select => select.id === key))
            return;
        items.push({ label: key, value: displayValue });
    });
    if (!items.length)
        return '';
    const listItems = items
        .map(item => `<li style="margin: 4px 0; padding: 0; list-style: none;"><strong>${item.label}:</strong> <span style="color: ${mutedColor};">${item.value}</span></li>`)
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
const buildDetailsCardHtml = (payload, theme = 'light') => {
    const isDark = theme === 'dark';
    const background = isDark ? '#0b1220' : '#ecfdf3';
    const cardBackground = isDark ? '#111827' : 'rgba(255,255,255,0.68)';
    const borderColor = isDark ? '#1f2937' : 'rgba(16,185,129,0.2)';
    const textColor = isDark ? '#e5e7eb' : '#0f172a';
    const mutedColor = isDark ? '#9ca3af' : '#4b5563';
    const customFieldsHtml = buildCustomFieldsHtml(payload.customSelects, payload.customData || {}, mutedColor);
    const statusRow = payload.decisionLabel
        ? `<div style="display:flex;gap:8px;align-items:center;margin-top:10px;"><strong>Státusz:</strong><span style="display:inline-flex;padding:6px 12px;border-radius:999px;background:${payload.status === 'confirmed' ? 'rgba(16,185,129,0.15)' : 'rgba(220,38,38,0.12)'};color:${payload.status === 'confirmed' ? '#065f46' : '#7f1d1d'};font-weight:700;">${payload.decisionLabel}</span></div>`
        : '';
    const notesRow = payload.notes
        ? `<div style="margin-top:14px;padding:12px;border-radius:12px;background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.25);color:${textColor};"><strong style="display:block;margin-bottom:6px;">Megjegyzés</strong><div style="white-space:pre-line;color:${mutedColor};">${payload.notes}</div></div>`
        : '';
    const autoConfirmRow = payload.reservationMode === 'auto'
        ? payload.locale === 'en'
            ? 'Yes'
            : 'Igen'
        : payload.locale === 'en'
            ? 'No'
            : 'Nem';
    return `
    <div style="padding:20px;background:${background};">
      <div style="max-width:740px;margin:0 auto;background:${cardBackground};backdrop-filter:blur(14px);border:1px solid ${borderColor};border-radius:18px;padding:22px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${textColor};box-shadow:0 18px 48px rgba(16,185,129,0.12);">
        <h3 style="margin:0 0 12px;font-size:20px;font-family:'Playfair Display',serif;color:${isDark ? '#d1fae5' : '#065f46'};">Foglalási adatok</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;font-size:14px;line-height:1.6;">
          <div><strong>Egység neve:</strong> <span style="color:${mutedColor};">${payload.unitName}</span></div>
          <div><strong>Vendég neve:</strong> <span style="color:${mutedColor};">${payload.guestName}</span></div>
          <div><strong>Dátum:</strong> <span style="color:${mutedColor};">${payload.bookingDate}</span></div>
          <div><strong>Időpont:</strong> <span style="color:${mutedColor};">${payload.bookingTimeRange}</span></div>
          <div><strong>Létszám:</strong> <span style="color:${mutedColor};">${payload.headcount}</span></div>
          <div><strong>Email:</strong> <span style="color:${mutedColor};">${payload.guestEmail}</span></div>
          <div><strong>Telefon:</strong> <span style="color:${mutedColor};">${payload.guestPhone}</span></div>
          <div><strong>Foglalás azonosító:</strong> <span style="color:${mutedColor};">${payload.bookingRef}</span></div>
          <div><strong>Automatikus megerősítés:</strong> <span style="color:${mutedColor};">${autoConfirmRow}</span></div>
        </div>
        ${statusRow}
        ${customFieldsHtml}
        ${notesRow}
      </div>
    </div>
  `;
};
const appendHtmlSafely = (baseHtml, extraHtml) => {
    if (!baseHtml)
        return extraHtml;
    if (/<\/body>/i.test(baseHtml)) {
        return baseHtml.replace(/<\/body>/i, `${extraHtml}</body>`);
    }
    if (/<\/html>/i.test(baseHtml)) {
        return baseHtml.replace(/<\/html>/i, `${extraHtml}</html>`);
    }
    return `${baseHtml}${extraHtml}`;
};
const getPublicBaseUrl = (settings) => {
    const envUrl = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL;
    const baseUrl = settings?.publicBaseUrl || envUrl || 'https://mintleaf.hu';
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};
const buildPayload = (booking, unitName, locale, decisionLabel, options = {}) => {
    const { bookingDate, bookingTimeFrom, bookingTimeTo, bookingTimeRange } = buildTimeFields(booking.startTime, booking.endTime, locale);
    const customData = booking.customData || {};
    const occasion = customData.occasion || booking.occasion || '';
    const occasionOther = customData.occasionOther || '';
    const bookingRef = booking.referenceCode?.substring(0, 8).toUpperCase() || booking.referenceCode || '';
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
const getUnitName = async (unitId) => {
    try {
        const snap = await db.doc(`units/${unitId}`).get();
        return snap.data()?.name || 'MintLeaf egység';
    }
    catch (err) {
        v2_1.logger.error('Failed to load unit', { unitId, err });
        return 'MintLeaf egység';
    }
};
const getReservationSettings = async (unitId) => {
    try {
        const snap = await db.doc(`reservation_settings/${unitId}`).get();
        if (!snap.exists)
            return {};
        return snap.data();
    }
    catch (err) {
        v2_1.logger.error('Failed to fetch reservation settings', {
            unitId,
            err,
        });
        return {};
    }
};
// ---------- EMAIL SENDERS ----------
const buildButtonBlock = (buttons, theme) => {
    const background = theme === 'dark' ? '#0b1220' : '#ecfdf3';
    const cardBg = theme === 'dark' ? '#111827' : 'rgba(255,255,255,0.6)';
    const border = theme === 'dark' ? '#1f2937' : 'rgba(16,185,129,0.18)';
    const btnBase = 'display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:14px;font-weight:700;font-family:system-ui,-apple-system,\'Segoe UI\',sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(16,185,129,0.18);';
    const buttonsHtml = buttons
        .map(btn => {
        const isDanger = btn.variant === 'danger';
        const bg = isDanger ? '#dc2626' : '#16a34a';
        const shadow = isDanger
            ? '0 10px 30px rgba(220,38,38,0.2)'
            : '0 10px 30px rgba(16,185,129,0.25)';
        return `<a href="${btn.url}" style="${btnBase}background:${bg};color:#ffffff;border:1px solid rgba(255,255,255,0.45);box-shadow:${shadow};">${btn.label}</a>`;
    })
        .join('<span style="width:8px;display:inline-block;"></span>');
    return `
    <div style="padding:20px;background:${background};">
      <div style="max-width:740px;margin:0 auto;background:${cardBg};backdrop-filter:blur(14px);border:1px solid ${border};border-radius:18px;padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        ${buttonsHtml}
      </div>
    </div>
  `;
};
const sendGuestCreatedEmail = async (unitId, booking, unitName, bookingId) => {
    const locale = booking.locale || 'hu';
    const guestEmail = booking.contact?.email || booking.email;
    if (!guestEmail)
        return;
    const allowed = await shouldSendEmail('booking_created_guest', unitId);
    if (!allowed)
        return;
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
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_created_guest', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_created_guest.subject, payload);
    const baseHtmlRendered = renderTemplate(rawHtml || defaultTemplates.booking_created_guest.html, payload);
    const extraHtml = `${buildButtonBlock([
        {
            label: 'FOGLALÁS MÓDOSÍTÁSA',
            url: manageUrl,
        },
    ], theme)}${buildDetailsCardHtml(payload, theme)}`;
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
const sendAdminCreatedEmail = async (unitId, booking, unitName, bookingId) => {
    const settings = await getReservationSettings(unitId);
    const legacyRecipients = settings.notificationEmails || [];
    const recipients = await getAdminRecipientsOverride(unitId, 'booking_created_admin', legacyRecipients);
    if (!recipients.length)
        return;
    const allowed = await shouldSendEmail('booking_created_admin', unitId);
    if (!allowed)
        return;
    const locale = booking.locale || 'hu';
    const customSelects = settings.guestForm?.customSelects || [];
    const publicBaseUrl = getPublicBaseUrl(settings);
    const theme = settings.themeMode === 'dark' ? 'dark' : 'light';
    const payload = buildPayload(booking, unitName, locale, '', {
        bookingId,
        customSelects,
        publicBaseUrl,
    });
    const manageApproveUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}&adminToken=${payload.adminActionToken || ''}&action=approve`;
    const manageRejectUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}&adminToken=${payload.adminActionToken || ''}&action=reject`;
    const showAdminButtons = booking.reservationMode === 'request' && !!payload.adminActionToken;
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_created_admin', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_created_admin.subject, payload);
    const baseHtmlRendered = renderTemplate(rawHtml || defaultTemplates.booking_created_admin.html, payload);
    const extraHtml = `${showAdminButtons
        ? buildButtonBlock([
            { label: 'ELFOGADÁS', url: manageApproveUrl },
            { label: 'ELUTASÍTÁS', url: manageRejectUrl, variant: 'danger' },
        ], theme)
        : ''}${buildDetailsCardHtml(payload, theme)}`;
    const finalHtml = appendHtmlSafely(baseHtmlRendered, extraHtml);
    await Promise.all(recipients.map(to => sendEmail({
        typeId: 'booking_created_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
    })));
};
const sendGuestStatusEmail = async (unitId, booking, unitName, bookingId) => {
    const locale = booking.locale || 'hu';
    const guestEmail = booking.contact?.email || booking.email;
    if (!guestEmail)
        return;
    const allowed = await shouldSendEmail('booking_status_updated_guest', unitId);
    if (!allowed)
        return;
    const settings = await getReservationSettings(unitId);
    const customSelects = settings.guestForm?.customSelects || [];
    const publicBaseUrl = getPublicBaseUrl(settings);
    const theme = settings.themeMode === 'dark' ? 'dark' : 'light';
    const decisionLabel = booking.status === 'confirmed'
        ? decisionLabels[locale].approved
        : decisionLabels[locale].rejected;
    const payload = buildPayload(booking, unitName, locale, decisionLabel, {
        bookingId,
        customSelects,
        publicBaseUrl,
    });
    const manageUrl = `${publicBaseUrl}/manage?token=${payload.bookingId}`;
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_status_updated_guest', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_status_updated_guest.subject, payload);
    const baseHtmlRendered = renderTemplate(rawHtml || defaultTemplates.booking_status_updated_guest.html, payload);
    const extraHtml = `${buildButtonBlock([
        {
            label: 'FOGLALÁS MÓDOSÍTÁSA',
            url: manageUrl,
        },
    ], theme)}${buildDetailsCardHtml(payload, theme)}`;
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
const sendAdminCancellationEmail = async (unitId, booking, unitName, bookingId) => {
    const settings = await getReservationSettings(unitId);
    const legacyRecipients = settings.notificationEmails || [];
    const cancellationRecipients = await getAdminRecipientsOverride(unitId, 'booking_cancelled_admin', legacyRecipients);
    const createdRecipients = await getAdminRecipientsOverride(unitId, 'booking_created_admin', legacyRecipients);
    const recipients = Array.from(new Set([...(cancellationRecipients || []), ...(createdRecipients || [])]));
    if (!recipients.length)
        return;
    const allowed = await shouldSendEmail('booking_cancelled_admin', unitId);
    if (!allowed)
        return;
    const locale = booking.locale || 'hu';
    const customSelects = settings.guestForm?.customSelects || [];
    const publicBaseUrl = getPublicBaseUrl(settings);
    const theme = settings.themeMode === 'dark' ? 'dark' : 'light';
    const payload = buildPayload(booking, unitName, locale, decisionLabels[locale].cancelled, {
        bookingId,
        customSelects,
        publicBaseUrl,
    });
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_cancelled_admin', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_cancelled_admin.subject, payload);
    const baseHtmlRendered = renderTemplate(rawHtml || defaultTemplates.booking_cancelled_admin.html, payload);
    const finalHtml = appendHtmlSafely(baseHtmlRendered, buildDetailsCardHtml(payload, theme));
    await Promise.all(recipients.map(to => sendEmail({
        typeId: 'booking_cancelled_admin',
        unitId,
        to,
        subject,
        html: finalHtml,
        payload,
    })));
};
const sendGuestModifiedEmail = async (unitId, booking, unitName) => {
    const locale = booking.locale || 'hu';
    const guestEmail = booking.contact?.email || booking.email;
    if (!guestEmail)
        return;
    const allowed = await shouldSendEmail('booking_modified_guest', unitId);
    if (!allowed)
        return;
    const payload = buildPayload(booking, unitName, locale, '');
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_modified_guest', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_modified_guest.subject, payload);
    const html = renderTemplate(rawHtml || defaultTemplates.booking_modified_guest.html, payload);
    await sendEmail({
        typeId: 'booking_modified_guest',
        unitId,
        to: guestEmail,
        subject,
        html,
        payload,
    });
};
const sendAdminModifiedEmail = async (unitId, booking, unitName) => {
    const settings = await getReservationSettings(unitId);
    const legacyRecipients = settings.notificationEmails || [];
    const recipients = await getAdminRecipientsOverride(unitId, 'booking_modified_admin', legacyRecipients);
    if (!recipients.length)
        return;
    const allowed = await shouldSendEmail('booking_modified_admin', unitId);
    if (!allowed)
        return;
    const locale = booking.locale || 'hu';
    const payload = buildPayload(booking, unitName, locale, '');
    const { subject: rawSubject, html: rawHtml } = await resolveEmailTemplate(unitId, 'booking_modified_admin', payload);
    const subject = renderTemplate(rawSubject || defaultTemplates.booking_modified_admin.subject, payload);
    const html = renderTemplate(rawHtml || defaultTemplates.booking_modified_admin.html, payload);
    await Promise.all(recipients.map(to => sendEmail({
        typeId: 'booking_modified_admin',
        unitId,
        to,
        subject,
        html,
        payload,
    })));
};
// ---------- CHANGE DETECTOR ----------
const hasMeaningfulEdit = (before, after) => {
    const fields = [
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
        const b = before[f];
        const a = after[f];
        const bVal = b?.toMillis ? b.toMillis() : b;
        const aVal = a?.toMillis ? a.toMillis() : a;
        return bVal !== aVal;
    });
};
// ---------- TRIGGERS ----------
exports.onReservationCreated = (0, firestore_1.onDocumentCreated)({
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
}, async (event) => {
    const booking = event.data?.data();
    if (!booking)
        return;
    const unitId = event.params.unitId;
    const bookingId = event.params.bookingId;
    const unitName = await getUnitName(unitId);
    const tasks = [];
    tasks.push(sendGuestCreatedEmail(unitId, booking, unitName, bookingId).catch(err => v2_1.logger.error("Failed to send guest created email", { unitId, err })));
    tasks.push(sendAdminCreatedEmail(unitId, booking, unitName, bookingId).catch(err => v2_1.logger.error("Failed to send admin created email", { unitId, err })));
    await Promise.all(tasks);
});
exports.onReservationStatusChange = (0, firestore_1.onDocumentUpdated)({
    region: REGION,
    document: "units/{unitId}/reservations/{bookingId}",
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const statusChanged = before.status !== after.status;
    const statusOrCancelChanged = statusChanged || before.cancelledBy !== after.cancelledBy;
    const edited = hasMeaningfulEdit(before, after);
    if (!statusOrCancelChanged && !edited)
        return;
    const unitId = event.params.unitId;
    const bookingId = event.params.bookingId;
    v2_1.logger.info("TRIGGER FIRED", {
        unitId,
        bookingId,
        beforeStatus: before.status,
        afterStatus: after.status,
        beforeCancelledBy: before.cancelledBy,
        afterCancelledBy: after.cancelledBy,
        edited,
    });
    const unitName = await getUnitName(unitId);
    const adminDecision = statusChanged &&
        before.status === "pending" &&
        (after.status === "confirmed" || after.status === "cancelled");
    const guestCancelled = statusChanged &&
        after.status === "cancelled" &&
        after.cancelledBy === "guest";
    const tasks = [];
    if (adminDecision) {
        tasks.push(sendGuestStatusEmail(unitId, after, unitName, bookingId).catch(err => v2_1.logger.error("Failed to send guest status email", { unitId, err })));
    }
    if (guestCancelled) {
        tasks.push(sendAdminCancellationEmail(unitId, after, unitName, bookingId).catch(err => v2_1.logger.error("Failed to send admin cancellation email", { unitId, err })));
    }
    if (edited && !statusChanged) {
        tasks.push(sendGuestModifiedEmail(unitId, after, unitName).catch(err => v2_1.logger.error("Failed to send guest modified email", { unitId, err })));
        tasks.push(sendAdminModifiedEmail(unitId, after, unitName).catch(err => v2_1.logger.error("Failed to send admin modified email", { unitId, err })));
    }
    await Promise.all(tasks);
});
