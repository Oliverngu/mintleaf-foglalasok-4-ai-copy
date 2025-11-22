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
    <p>Szia {{guestName}}!</p>
    <p>Köszönjük a foglalásodat a(z) <strong>{{unitName}}</strong> egységnél.</p>

    {{#if isAutoConfirm}}
      <p>A foglalásod automatikusan visszaigazolásra került.</p>
    {{/if}}
    {{#if isRequestMode}}
      <p>A foglalás jelenleg <strong>jóváhagyásra vár</strong>. Hamarosan e-mailben értesítünk a döntésről.</p>
    {{/if}}

    <ul>
      <li><strong>Dátum:</strong> {{bookingDate}}</li>
      <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
      <li><strong>Létszám:</strong> {{headcount}} fő</li>
    </ul>

    <p>Hivatkozási kód: <strong>{{bookingRef}}</strong></p>
    <p>Üdvözlettel,<br />A MintLeaf Csapata</p>
    `,
  },

  // ============ ADMIN FOGALALÁS EMAIL ============
  booking_created_admin: {
    subject: 'Új foglalás: {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
    html: `
      <h2>Új foglalás érkezett</h2>
      <p>Egység: <strong>{{unitName}}</strong></p>

      <h3>Foglalás röviden</h3>
      <ul>
        <li><strong>Vendég neve:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{bookingTimeTo}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
        <li><strong>Alkalom:</strong> {{occasion}}</li>
        <li><strong>Foglalás módja:</strong> {{reservationModeLabel}}</li>
      </ul>

      {{#if isAutoConfirm}}
        <p><em>Ez a foglalás automatikusan megerősítésre került.</em></p>
      {{/if}}
      {{#if isRequestMode}}
        <p><em>Ez a foglalás jóváhagyásra vár. A döntési gombok a részletek felett találhatók.</em></p>
      {{/if}}

      <p>A levél alján egy részletes, fix adatlap blokk található a foglalásról.</p>
    `,
  },

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