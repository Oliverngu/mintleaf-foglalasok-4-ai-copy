import { EmailTypeId } from './emailTypes';

type TemplateDef = {
  subject: string;
  html: string;
};

export const defaultTemplates: Record<EmailTypeId, TemplateDef> = {
  leave_request_created: {
    subject: 'Új szabadságkérelem érkezett: {{userName}}',
    html: `
      <p>Szia!</p>
      <p><strong>{{userName}}</strong> ({{userEmail}}) új szabadságkérelmet nyújtott be a(z) <strong>{{unitName}}</strong> egységhez.</p>
      <p><strong>Kért időszak(ok):</strong> {{dates}}</p>
      <p><strong>Megjegyzés:</strong> {{note}}</p>
      <p>A kérelem beérkezett: {{createdAt}}</p>
      <p>A kérelem elbírálásához kérjük, jelentkezz be a MintLeaf felületére.</p>
    `,
  },

  leave_request_approved: {
    subject: 'Szabadságkérelmed jóváhagyva',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Örömmel értesítünk, hogy a(z) <strong>{{dates}}</strong> időszakra vonatkozó szabadságkérelmedet <strong>{{approverName}}</strong> jóváhagyta.</p>
      <p>Jó pihenést kívánunk!</p>
    `,
  },

  leave_request_rejected: {
    subject: 'Szabadságkérelmed elutasítva',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Sajnálattal értesítünk, hogy a(z) <strong>{{dates}}</strong> időszakra vonatkozó szabadságkérelmedet <strong>{{approverName}}</strong> elutasította.</p>
      <p>További információért keresd a felettesedet.</p>
    `,
  },

  // ============ VENDÉG FOGALALÁS EMAIL ============
  booking_created_guest: {
    subject: '[DEFAULT TEMPLATE] Foglalás visszaigazolás – {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:28px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:rgba(255,255,255,0.45);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 18px 48px rgba(16,185,129,0.15);border-radius:20px;overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 20% 20%,rgba(16,185,129,0.12),transparent 35%),radial-gradient(circle at 80% 0%,rgba(52,211,153,0.12),transparent 25%);"></div>
          <div style="position:relative;padding:32px 32px 18px 32px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 8px;font-family:'Playfair Display',serif;font-size:30px;color:#064e3b;">Foglalás visszaigazolás</h1>
            <p style="margin:0 0 6px;font-size:16px;">Szia {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;line-height:1.6;">Köszönjük a foglalásodat a(z) <strong>{{unitName}}</strong> egységnél. Lentebb találod a részleteket és a foglalásod hivatkozási kódját.</p>
            {{#if isAutoConfirm}}
              <p style="margin:14px 0 0;color:#047857;font-weight:700;">A foglalásod automatikusan visszaigazolva.</p>
            {{/if}}
            {{#if isRequestMode}}
              <p style="margin:14px 0 0;color:#b45309;font-weight:700;">A foglalás jóváhagyásra vár. Értesítünk, amint döntés születik.</p>
            {{/if}}
          </div>

          <div style="padding:0 32px 28px 32px;">
            <div style="height:1px;background:linear-gradient(90deg,rgba(16,185,129,0.35),rgba(16,185,129,0));margin-bottom:18px;"></div>
            <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(16,185,129,0.18);border-radius:16px;padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <h2 style="margin:0;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalási adatok</h2>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(16,185,129,0.12);color:#065f46;font-weight:700;font-size:12px;">REF: {{bookingRef}}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;line-height:1.6;color:#0f172a;">
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Dátum</p>
                  <p style="margin:0;font-weight:700;">{{bookingDate}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Időpont</p>
                  <p style="margin:0;font-weight:700;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Létszám</p>
                  <p style="margin:0;font-weight:700;">{{headcount}} fő</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Egység</p>
                  <p style="margin:0;font-weight:700;">{{unitName}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Email</p>
                  <p style="margin:0;font-weight:700;">{{guestEmail}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Telefon</p>
                  <p style="margin:0;font-weight:700;">{{guestPhone}}</p>
                </div>
              </div>
              {{#if notes}}
                <div style="margin-top:16px;padding:14px;border-radius:12px;background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.2);">
                  <p style="margin:0 0 6px;font-weight:700;color:#065f46;">Megjegyzés</p>
                  <p style="margin:0;color:#0f172a;white-space:pre-line;">{{notes}}</p>
                </div>
              {{/if}}
            </div>
            <div style="margin-top:18px;border-top:1px solid rgba(16,185,129,0.15);padding-top:14px;color:#065f46;font-weight:700;">
              Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span>
            </div>
            <p style="margin:12px 0 0;color:#0f172a;">Üdvözlettel,<br />A MintLeaf csapata</p>
          </div>
        </div>
      </div>
    `,
  },

  // ============ ADMIN FOGALALÁS EMAIL ============
  booking_created_admin: {
    subject: 'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:28px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:rgba(255,255,255,0.45);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 18px 48px rgba(16,185,129,0.15);border-radius:20px;overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 10% 15%,rgba(16,185,129,0.12),transparent 35%),radial-gradient(circle at 85% 15%,rgba(52,211,153,0.12),transparent 30%);"></div>
          <div style="position:relative;padding:32px 32px 18px 32px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 8px;font-family:'Playfair Display',serif;font-size:30px;color:#064e3b;">Új foglalás érkezett</h1>
            <p style="margin:0;color:#0f172a;line-height:1.6;">Egység: <strong>{{unitName}}</strong>. Ellenőrizd a részleteket és jelezz vissza a vendégnek.</p>
            {{#if isAutoConfirm}}
              <p style="margin:14px 0 0;color:#047857;font-weight:700;">Ez a foglalás automatikusan megerősítve.</p>
            {{/if}}
            {{#if isRequestMode}}
              <p style="margin:14px 0 0;color:#b45309;font-weight:700;">Jóváhagyásra váró foglalás – használd a lenti gombokat a döntéshez.</p>
            {{/if}}
          </div>

          <div style="padding:0 32px 28px 32px;">
            <div style="height:1px;background:linear-gradient(90deg,rgba(16,185,129,0.35),rgba(16,185,129,0));margin-bottom:18px;"></div>
            <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(16,185,129,0.18);border-radius:16px;padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <h2 style="margin:0;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalási adatok</h2>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(16,185,129,0.12);color:#065f46;font-weight:700;font-size:12px;">REF: {{bookingRef}}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;line-height:1.6;color:#0f172a;">
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Vendég neve</p>
                  <p style="margin:0;font-weight:700;">{{guestName}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Dátum</p>
                  <p style="margin:0;font-weight:700;">{{bookingDate}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Időpont</p>
                  <p style="margin:0;font-weight:700;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Létszám</p>
                  <p style="margin:0;font-weight:700;">{{headcount}} fő</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Email</p>
                  <p style="margin:0;font-weight:700;">{{guestEmail}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Telefon</p>
                  <p style="margin:0;font-weight:700;">{{guestPhone}}</p>
                </div>
              </div>
              {{#if notes}}
                <div style="margin-top:16px;padding:14px;border-radius:12px;background:rgba(16,185,129,0.05);border:1px dashed rgba(16,185,129,0.2);">
                  <p style="margin:0 0 6px;font-weight:700;color:#065f46;">Megjegyzés</p>
                  <p style="margin:0;color:#0f172a;white-space:pre-line;">{{notes}}</p>
                </div>
              {{/if}}
            </div>
            <div style="margin-top:18px;border-top:1px solid rgba(16,185,129,0.15);padding-top:14px;color:#065f46;font-weight:700;">
              Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span>
            </div>
            <p style="margin:12px 0 0;color:#0f172a;">Részletes adatlap és döntési lehetőségek az admin felületen.</p>
          </div>
        </div>
      </div>
    `,
  },

  booking_status_updated_guest: {
    subject: 'Foglalás frissítés: {{bookingDate}} {{bookingTimeFrom}} – {{decisionLabel}}',
    html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:28px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:rgba(255,255,255,0.45);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 18px 48px rgba(16,185,129,0.15);border-radius:20px;overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 15% 15%,rgba(16,185,129,0.12),transparent 32%),radial-gradient(circle at 85% 10%,rgba(52,211,153,0.12),transparent 28%);"></div>
          <div style="position:relative;padding:32px 32px 18px 32px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 8px;font-family:'Playfair Display',serif;font-size:30px;color:#064e3b;">Foglalás frissítése</h1>
            <p style="margin:0 0 8px;">Kedves {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;line-height:1.6;">A(z) <strong>{{unitName}}</strong> egységnél leadott foglalásod státusza frissült.</p>
          </div>

          <div style="padding:0 32px 28px 32px;">
            <div style="height:1px;background:linear-gradient(90deg,rgba(16,185,129,0.35),rgba(16,185,129,0));margin-bottom:18px;"></div>
            <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(16,185,129,0.18);border-radius:16px;padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <h2 style="margin:0;font-family:'Playfair Display',serif;font-size:20px;color:#065f46;">Foglalási adatok</h2>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(16,185,129,0.12);color:#065f46;font-weight:700;font-size:12px;">REF: {{bookingRef}}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;line-height:1.6;color:#0f172a;">
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Dátum</p>
                  <p style="margin:0;font-weight:700;">{{bookingDate}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Időpont</p>
                  <p style="margin:0;font-weight:700;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Létszám</p>
                  <p style="margin:0;font-weight:700;">{{headcount}} fő</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.16);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#065f46;">Döntés</p>
                  <p style="margin:0;font-weight:700;">{{decisionLabel}}</p>
                </div>
              </div>
            </div>
            <div style="margin-top:18px;border-top:1px solid rgba(16,185,129,0.15);padding-top:14px;color:#065f46;font-weight:700;">
              Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span>
            </div>
            <p style="margin:12px 0 0;color:#0f172a;">Köszönjük a türelmedet!</p>
          </div>
        </div>
      </div>
    `,
  },

  booking_cancelled_admin: {
    subject: 'Foglalás lemondva: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:28px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:720px;margin:0 auto;background:rgba(255,255,255,0.45);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 18px 48px rgba(16,185,129,0.15);border-radius:20px;overflow:hidden;position:relative;">
          <div style="position:absolute;inset:0;background:radial-gradient(circle at 15% 20%,rgba(220,38,38,0.12),transparent 35%),radial-gradient(circle at 80% 5%,rgba(16,185,129,0.12),transparent 30%);"></div>
          <div style="position:relative;padding:32px 32px 18px 32px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 8px;font-family:'Playfair Display',serif;font-size:30px;color:#7f1d1d;">Vendég lemondta a foglalást</h1>
            <p style="margin:0;color:#0f172a;line-height:1.6;">Egység: <strong>{{unitName}}</strong></p>
          </div>

          <div style="padding:0 32px 28px 32px;">
            <div style="height:1px;background:linear-gradient(90deg,rgba(248,113,113,0.35),rgba(248,113,113,0));margin-bottom:18px;"></div>
            <div style="background:rgba(255,255,255,0.7);border:1px solid rgba(248,113,113,0.25);border-radius:16px;padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.6);">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <h2 style="margin:0;font-family:'Playfair Display',serif;font-size:20px;color:#7f1d1d;">Foglalási adatok</h2>
                <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(248,113,113,0.12);color:#7f1d1d;font-weight:700;font-size:12px;">REF: {{bookingRef}}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:14px;line-height:1.6;color:#0f172a;">
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Vendég neve</p>
                  <p style="margin:0;font-weight:700;">{{guestName}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Dátum</p>
                  <p style="margin:0;font-weight:700;">{{bookingDate}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Időpont</p>
                  <p style="margin:0;font-weight:700;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Létszám</p>
                  <p style="margin:0;font-weight:700;">{{headcount}} fő</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Email</p>
                  <p style="margin:0;font-weight:700;">{{guestEmail}}</p>
                </div>
                <div style="padding:12px;border-radius:12px;background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.2);">
                  <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#7f1d1d;">Telefon</p>
                  <p style="margin:0;font-weight:700;">{{guestPhone}}</p>
                </div>
              </div>
              {{#if notes}}
                <div style="margin-top:16px;padding:14px;border-radius:12px;background:rgba(248,113,113,0.05);border:1px dashed rgba(248,113,113,0.25);">
                  <p style="margin:0 0 6px;font-weight:700;color:#7f1d1d;">Megjegyzés</p>
                  <p style="margin:0;color:#0f172a;white-space:pre-line;">{{notes}}</p>
                </div>
              {{/if}}
            </div>
            <div style="margin-top:18px;border-top:1px solid rgba(248,113,113,0.25);padding-top:14px;color:#7f1d1d;font-weight:700;">
              Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span>
            </div>
            <p style="margin:12px 0 0;color:#0f172a;">A foglalás le lett mondva a vendég oldaláról.</p>
          </div>
        </div>
      </div>
    `,
  },
};
