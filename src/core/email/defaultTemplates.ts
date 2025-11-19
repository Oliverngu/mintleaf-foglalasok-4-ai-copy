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
  subject: '[DEFAULT TESZT] Foglalás visszaigazolás – {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
  html: ` ... `
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
      </ul>

      <p>A levél alján egy részletes, fix adatlap blokk található a foglalásról.</p>
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