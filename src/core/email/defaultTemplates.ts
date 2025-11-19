import { EmailTypeId } from './emailTypes';

export const defaultTemplates: Record<EmailTypeId, { subject: string; html: string }> = {
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
  booking_created_guest: {
  subject: 'Foglalás visszaigazolás – {{bookingDate}} {{bookingTimeFrom}} ({{headcount}} fő)',
  html: `
    <h2>Kedves {{guestName}}!</h2>

    <p>Köszönjük a foglalásodat a(z) <strong>{{unitName}}</strong> egységünkbe.</p>

    <h3>Foglalás részletei</h3>
    <ul>
      <li><strong>Dátum:</strong> {{bookingDate}}</li>
      <li><strong>Időpont:</strong> {{bookingTimeFrom}}{{#bookingTimeTo}} – {{bookingTimeTo}}{{/bookingTimeTo}}</li>
      <li><strong>Létszám:</strong> {{headcount}} fő</li>
      {{#occasion}}
        <li><strong>Alkalom:</strong> {{occasion}} {{occasionOther}}</li>
      {{/occasion}}
    </ul>

    {{#comment}}
      <h3>Megjegyzésed</h3>
      <p>{{comment}}</p>
    {{/comment}}

    <h3>Elérhetőségeid</h3>
    <ul>
      <li><strong>Email:</strong> {{guestEmail}}</li>
      {{#guestPhone}}
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
      {{/guestPhone}}
    </ul>

    <p>Foglalási azonosító: <strong>{{bookingRef}}</strong></p>

    <p>Várunk szeretettel!<br/>{{unitName}} csapata</p>
  `,
  text: `
Kedves {{guestName}}!

Köszönjük a foglalásodat a(z) {{unitName}} egységünkbe.

Foglalás részletei:
- Dátum: {{bookingDate}}
- Időpont: {{bookingTimeFrom}}{{#bookingTimeTo}} – {{bookingTimeTo}}{{/bookingTimeTo}}
- Létszám: {{headcount}} fő
{{#occasion}}- Alkalom: {{occasion}} {{occasionOther}}{{/occasion}}

Elérhetőségeid:
- Email: {{guestEmail}}
{{#guestPhone}}- Telefon: {{guestPhone}}{{/guestPhone}}

Foglalási azonosító: {{bookingRef}}

Üdvözlettel,
{{unitName}} csapata
  `,
},
  booking_created_admin: {
    subject: 'Új foglalás érkezett: {{guestName}} ({{headcount}} fő)',
    html: `
      <p>Új foglalási kérelem érkezett a(z) <strong>{{unitName}}</strong> egységbe.</p>
      <ul>
        <li><strong>Név:</strong> {{guestName}}</li>
        <li><strong>Dátum:</strong> {{bookingDate}}, {{bookingTime}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Email:</strong> {{guestEmail}}</li>
        <li><strong>Telefon:</strong> {{guestPhone}}</li>
        <li><strong>Alkalom:</strong> {{occasion}}</li>
      </ul>
      <p>A foglalás státusza: <strong>{{#if isAutoConfirm}}Automatikusan megerősítve{{else}}Jóváhagyásra vár{{/if}}</strong>.</p>
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
