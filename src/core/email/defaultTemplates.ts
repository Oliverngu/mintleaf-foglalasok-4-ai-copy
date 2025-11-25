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
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Foglalás visszaigazolás</h1>
            <p style="margin:0 0 8px;">Szia {{guestName}}!</p>
            <p style="margin:0;color:#0f172a;">Köszönjük a foglalásodat a(z) <strong>{{unitName}}</strong> egységnél.</p>
            {{#if isAutoConfirm}}
              <p style="margin:12px 0 0;color:#047857;font-weight:600;">A foglalásod automatikusan visszaigazolásra került.</p>
            {{/if}}
            {{#if isRequestMode}}
              <p style="margin:12px 0 0;color:#b45309;font-weight:600;">A foglalás jelenleg <strong>jóváhagyásra vár</strong>. Hamarosan e-mailben értesítünk a döntésről.</p>
            {{/if}}
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
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Létszám</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{headcount}} fő</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Egység</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{unitName}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Hivatkozási kód: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Üdvözlettel,<br />A MintLeaf Csapata</p>
          </div>
        </div>
      </div>
    `,
  },

  // ============ ADMIN FOGALALÁS EMAIL ============
  booking_created_admin: {
    subject: 'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <div style="margin:0;padding:0;background:linear-gradient(135deg,#ecfdf3,#ffffff 45%,#d1fae5);padding:24px;font-family:'Inter','Segoe UI',sans-serif;color:#0f172a;">
        <div style="max-width:640px;margin:0 auto;background:rgba(255,255,255,0.9);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.6);box-shadow:0 8px 32px rgba(16,185,129,0.12);border-radius:18px;overflow:hidden;">
          <div style="padding:30px 32px 18px;">
            <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#047857;font-weight:700;">WizardBooking</p>
            <h1 style="margin:10px 0 6px;font-family:'Playfair Display',serif;font-size:28px;color:#064e3b;">Új foglalás érkezett</h1>
            <p style="margin:0;color:#0f172a;">Egység: <strong>{{unitName}}</strong></p>
            {{#if isAutoConfirm}}
              <p style="margin:12px 0 0;color:#047857;font-weight:600;">Ez a foglalás automatikusan megerősítésre került.</p>
            {{/if}}
            {{#if isRequestMode}}
              <p style="margin:12px 0 0;color:#b45309;font-weight:600;">Ez a foglalás jóváhagyásra vár. A döntési gombok a részletek felett találhatók.</p>
            {{/if}}
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
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
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
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Alkalom</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{occasion}}</p>
              </div>
              <div style="padding:12px;border-radius:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#065f46;">Foglalás módja</p>
                <p style="margin:0;font-weight:700;color:#0f172a;">{{reservationModeLabel}}</p>
              </div>
            </div>
          </div>

          <div style="border-top:1px solid rgba(16,185,129,0.15);padding:18px 32px 26px;">
            <p style="margin:0 0 8px;color:#065f46;font-weight:700;">Ref: <span style="font-family:'Roboto Mono',monospace;">{{bookingRef}}</span></p>
            <p style="margin:0;color:#0f172a;">Részletes adatlap és döntési lehetőségek az admin felületen.</p>
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
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
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
                <p style="margin:0;font-weight:700;color:#0f172a;">{{bookingTimeFrom}}{{bookingTimeTo}}</p>
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

  user_registration_welcome: {
    subject: 'Üdv a MintLeaf rendszerében, {{firstName}}!',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Sikeresen regisztráltál a MintLeaf rendszerébe. Mostantól be tudsz jelentkezni a megadott email címeddel és jelszavaddal.</p>
      <p>Üdvözlettel,<br>A MintLeaf Csapata</p>
    `,
  },

  new_schedule_published: {
    subject: 'Új beosztás publikálva - {{weekLabel}}',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Publikálásra került a(z) <strong>{{weekLabel}}</strong> hétre vonatkozó beosztásod.</p>
      <p>A részletekért jelentkezz be a MintLeaf alkalmazásba.</p>
      <p>Üdvözlettel,<br>A MintLeaf Csapata</p>
    `,
  },
};