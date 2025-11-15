// src/core/email/templates.ts

export const registrationTemplate = (firstName: string): string => `
  <h1>Üdvözlünk, ${firstName}!</h1>
  <p>Sikeresen regisztráltál a MintLeaf rendszerébe.</p>
  <p>Mostantól be tudsz jelentkezni a megadott email címeddel és jelszavaddal.</p>
  <p>Üdvözlettel,<br>A MintLeaf Csapata</p>
`;

export const newScheduleNotificationTemplate = (firstName: string, weekLabel: string): string => `
  <h1>Szia ${firstName},</h1>
  <p>Publikálásra került a(z) <strong>${weekLabel}</strong> hétre vonatkozó beosztásod.</p>
  <p>A részletekért jelentkezz be a MintLeaf alkalmazásba.</p>
  <p>Üdvözlettel,<br>A MintLeaf Csapata</p>
`;
