import { EmailTypeId } from './emailTypes';

export const defaultTemplates: Record<EmailTypeId, { subject: string; html: string }> = {
  leave_request_created: {
    subject: 'Új szabadságkérelem érkezett: {{userName}}',
    html: `
      <p>Szia!</p>
      <p><strong>{{userName}}</strong> ({{userEmail}}) új szabadságkérelmet nyújtott be a(z) <strong>{{unitName}}</strong> egységhez.</p>
      <p><strong>Kért időszak(ok):</strong></p>
      <ul>
        {{#each dateRanges}}
        <li>{{this.start}} - {{this.end}}</li>
        {{/each}}
      </ul>
      <p><strong>Megjegyzés:</strong> {{note}}</p>
      <p>A kérelem beérkezett: {{createdAt}}</p>
      <p>A kérelem elbírálásához kérjük, jelentkezz be a MintLeaf felületére.</p>
    `,
  },
  leave_request_approved: {
    subject: 'Szabadságkérelmed jóváhagyva',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Örömmel értesítünk, hogy a(z) <strong>{{startDate}} - {{endDate}}</strong> időszakra vonatkozó szabadságkérelmedet <strong>{{approverName}}</strong> jóváhagyta.</p>
      <p>Jó pihenést kívánunk!</p>
    `,
  },
  leave_request_rejected: {
    subject: 'Szabadságkérelmed elutasítva',
    html: `
      <p>Szia {{firstName}}!</p>
      <p>Sajnálattal értesítünk, hogy a(z) <strong>{{startDate}} - {{endDate}}</strong> időszakra vonatkozó szabadságkérelmedet <strong>{{approverName}}</strong> elutasította.</p>
      <p>További információért keresd a felettesedet.</p>
    `,
  },
  booking_created_guest: {
    subject: 'Foglalásod részletei a(z) {{unitName}} egységben',
    html: `
      <p>Kedves {{bookingName}}!</p>
      {{#if isAutoConfirm}}
      <p>Köszönjük, foglalásodat sikeresen rögzítettük a(z) <strong>{{unitName}}</strong> egységünkben az alábbi adatokkal:</p>
      {{else}}
      <p>Köszönjük, foglalási kérelmedet megkaptuk a(z) <strong>{{unitName}}</strong> egységünkbe. Hamarosan felvesszük veled a kapcsolatot a megerősítéssel kapcsolatban. Kérésed adatai:</p>
      {{/if}}
      <ul>
        <li><strong>Dátum:</strong> {{bookingDate}}</li>
        <li><strong>Időpont:</strong> {{bookingTime}}</li>
        <li><strong>Létszám:</strong> {{headcount}} fő</li>
        <li><strong>Foglalási azonosító:</strong> {{bookingRef}}</li>
      </ul>
      <p>Várunk szeretettel!</p>
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
