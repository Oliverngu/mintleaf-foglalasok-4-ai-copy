import { db } from '../firebase/config';
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { EmailTypeId } from '../email/emailTypes';
import { defaultTemplates } from '../email/defaultTemplates';
import { EmailSettingsDocument } from '../models/data';

// FIX: Re-export the type to satisfy imports from other modules.
export type { EmailSettingsDocument } from '../models/data';

export async function getEmailSettingsForUnit(unitId: string): Promise<EmailSettingsDocument> {
  const defaultSettings: EmailSettingsDocument = {
    enabledTypes: {},
    adminRecipients: {},
    templateOverrides: {},
    adminDefaultEmail: '',
  };

  try {
    const docRef = doc(db, 'email_settings', unitId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return defaultSettings;
    }

    const data = docSnap.data();
    const settings: EmailSettingsDocument = {
      enabledTypes: data.enabledTypes || {},
      adminRecipients: data.adminRecipients || {},
      templateOverrides: data.templateOverrides || {},
      adminDefaultEmail: data.adminDefaultEmail || '',
    };

    return settings;
  } catch (error) {
    console.error(`Failed to fetch settings for unit ${unitId}.`, error);
    return defaultSettings;
  }
}

// FIX: Replaced the synchronous 2-argument function with an asynchronous 3-argument version
// that aligns with its new usage pattern across components. This function now handles
// fetching settings and rendering the template content internally.
export async function resolveEmailTemplate(
  unitId: string | null,
  typeId: EmailTypeId,
  payload: Record<string, any>
): Promise<{ subject: string; html: string }> {
  const unitSettings = await getEmailSettingsForUnit(unitId || 'default');
  const defaultSettings = await getEmailSettingsForUnit('default');
  
  const unitOverride = unitSettings.templateOverrides?.[typeId];
  const defaultOverride = defaultSettings.templateOverrides?.[typeId];
  const hardcodedDefault = defaultTemplates[typeId];

  const subjectTemplate = unitOverride?.subject || defaultOverride?.subject || hardcodedDefault.subject;
  const htmlTemplate = unitOverride?.html || defaultOverride?.html || hardcodedDefault.html;

  return {
    subject: renderTemplate(subjectTemplate, payload),
    html: renderTemplate(htmlTemplate, payload),
  };
}


export const renderTemplate = (template: string, payload: Record<string, any> | undefined): string => {
  if (!payload) return template;

  let rendered = template;
  // Handle simple {{key}} replacements
  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim();
    // Handle nested properties like {{user.name}}
    const value = trimmedKey.split('.').reduce((obj, k) => obj && obj[k], payload);
    return value !== undefined ? String(value) : match;
  });

  // Handle simple conditional logic like {{#if isAutoConfirm}}...{{/if}}
  rendered = rendered.replace(/{{#if (.*?)}}(.*?){{\/if}}/gs, (match, key, content) => {
    const trimmedKey = key.trim();
    const value = trimmedKey.split('.').reduce((obj, k) => obj && obj[k], payload);
    return value ? content : '';
  });

  return rendered;
};

// FIX: Added missing 'shouldSendEmail' export.
export async function shouldSendEmail(typeId: EmailTypeId, unitId: string | null): Promise<boolean> {
  if (!unitId) return true; // Default to true if no unit context
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');
  
  // Unit specific setting overrides default. If undefined, it's enabled.
  if (unitSettings.enabledTypes[typeId] !== undefined) {
    return unitSettings.enabledTypes[typeId];
  }
  if (defaultSettings.enabledTypes[typeId] !== undefined) {
    return defaultSettings.enabledTypes[typeId];
  }
  return true; // Enabled by default
}

// FIX: Added missing 'getAdminRecipientsOverride' export.
export async function getAdminRecipientsOverride(
  unitId: string,
  typeId: EmailTypeId,
  legacyRecipients: string[] = []
): Promise<string[]> {
  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  const unitSpecificRecipients = unitSettings.adminRecipients?.[typeId];
  if (unitSpecificRecipients && unitSpecificRecipients.length > 0) {
    return [...new Set(unitSpecificRecipients)];
  }

  const defaultSpecificRecipients = defaultSettings.adminRecipients?.[typeId];
  if (defaultSpecificRecipients && defaultSpecificRecipients.length > 0) {
    return [...new Set(defaultSpecificRecipients)];
  }

  const recipients = new Set<string>();
  if (unitSettings.adminDefaultEmail) recipients.add(unitSettings.adminDefaultEmail);
  if (defaultSettings.adminDefaultEmail) recipients.add(defaultSettings.adminDefaultEmail);

  (legacyRecipients || []).forEach((email) => recipients.add(email));

  return Array.from(recipients);
}

// FIX: Added missing 'savePartialEmailSettings' export.
export async function savePartialEmailSettings(unitId: string, data: Record<string, any>): Promise<void> {
  console.log('[savePartialEmailSettings] unitId =', unitId, 'data =', data);
  const docRef = doc(db, 'email_settings', unitId);
  await setDoc(docRef, data, { merge: true });
  console.log('[savePartialEmailSettings] OK for', unitId);
}
