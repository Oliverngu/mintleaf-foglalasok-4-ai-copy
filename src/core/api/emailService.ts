import { emailProviderConfig } from '../config/emailConfig';
import { User, Unit } from '../models/data';
import { registrationTemplate, newScheduleNotificationTemplate } from '../email/templates';

export interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
}

export const sendEmail = async (params: EmailParams): Promise<{ success: boolean; message: string }> => {
  if (emailProviderConfig.provider === 'mock') {
    console.log('--- MOCK EMAIL SENT ---');
    console.log('To:', params.to);
    console.log('Subject:', params.subject);
    // console.log('Body:', params.html);
    console.log('-----------------------');
    return { success: true, message: 'Mock email sent successfully.' };
  }

  // Future implementation for Resend/SendGrid
  // const { to, subject, html } = params;
  // const from = emailProviderConfig.fromDefault || 'noreply@yourdomain.com';
  // ... API call logic ...

  return { success: false, message: 'Email provider not configured.' };
};

export const createRegistrationEmail = (user: User): EmailParams => {
  const subject = `Üdv a MintLeaf rendszerében, ${user.firstName}!`;
  const html = registrationTemplate(user.firstName);
  return {
    to: user.email,
    subject,
    html,
  };
};

export const createNewScheduleNotificationEmail = (user: User, weekLabel: string): EmailParams => {
  const subject = `Új beosztás a(z) ${weekLabel} hétre`;
  const html = newScheduleNotificationTemplate(user.firstName, weekLabel);
  return {
    to: user.email,
    subject,
    html,
  };
};

export const createGuestReservationConfirmationEmail = (booking: any, unit: Unit): EmailParams | null => {
    if (!booking.contact?.email) return null;
    const locale = booking.locale || 'hu';
    const subject = locale === 'hu' ? `Foglalási kérés a ${unit.name} étterembe` : `Reservation request for ${unit.name}`;
    // A proper template should be used here. For now, a simple text.
    const html = `<p>Kedves ${booking.name},</p><p>Köszönjük foglalási kérését. Hamarosan jelentkezünk a megerősítéssel.</p><p>Azonosító: ${booking.referenceCode}</p>`;
    return {
        to: booking.contact.email,
        subject,
        html,
    };
};

export const createUnitNewReservationNotificationEmail = (booking: any, unit: Unit, recipientEmails: string[]): EmailParams => {
     const subject = `Új foglalási kérés érkezett - ${unit.name}`;
     const html = `<p>Új foglalási kérés érkezett a(z) ${unit.name} egységbe.</p>
        <p><strong>Név:</strong> ${booking.name}</p>
        <p><strong>Létszám:</strong> ${booking.headcount} fő</p>
        <p><strong>Időpont:</strong> ${booking.startTime.toDate().toLocaleString('hu-HU')}</p>
        <p>A foglalás kezeléséhez lépj be a MintLeaf admin felületére.</p>`;
    return {
        to: recipientEmails,
        subject,
        html,
    };
};
