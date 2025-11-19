// src/core/api/emailSettingsService.ts

import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { EmailTypeId } from '../email/emailTypes';
import { defaultTemplates } from '../email/defaultTemplates';
import { EmailSettingsDocument } from '../models/data';

// Re-export, hogy máshonnan is lehessen használni a típust
export type { EmailSettingsDocument } from '../models/data';

/**
 * Email beállítások lekérése egy egységhez (vagy 'default'-hoz).
 * NINCS cache – mindig Firestore-ból olvas.
 */
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

/**
 * Template feloldása:
 *  1) unit override
 *  2) default unit override
 *  3) hardcoded defaultTemplates
 */
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

  const subjectTemplate =
    unitOverride?.subject || defaultOverride?.subject || hardcodedDefault.subject;
  const htmlTemplate =
    unitOverride?.html || defaultOverride?.html || hardcodedDefault.html;

  return {
    subject: renderTemplate(subjectTemplate, payload),
    html: renderTemplate(htmlTemplate, payload),
  };
}

/**
 * Egyszerű Mustache-szerű render: {{key}} + {{#if flag}}...{{/if}}
 */
export const renderTemplate = (
  template: string,
  payload: Record<string, any> | undefined
): string => {
  if (!payload) return template;

  let rendered = template;

  // {{key}} vagy {{user.name}} jellegű placeholder
  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => {
    const trimmedKey = key.trim();
    const value = trimmedKey.split('.').reduce((obj: any, k: string) => obj && obj[k], payload);
    return value !== undefined ? String(value) : match;
  });

  // {{#if flag}} ... {{/if}}
  rendered = rendered.replace(/{{#if (.*?)}}(.*?){{\/if}}/gs, (match, key, content) => {
    const trimmedKey = key.trim();
    const value = trimmedKey.split('.').reduce((obj: any, k: string) => obj && obj[k], payload);
    return value ? content : '';
  });

  return rendered;
};

/**
 * Eldönti, hogy egy adott email-típus küldhető-e az adott egységnél.
 * Logika: unit override → default override → alapértelmezés: true
 */
export async function shouldSendEmail(
  typeId: EmailTypeId,
  unitId: string | null
): Promise<boolean> {
  if (!unitId) return true;

  const unitSettings = await getEmailSettingsForUnit(unitId);
  const defaultSettings = await getEmailSettingsForUnit('default');

  if (unitSettings.enabledTypes[typeId] !== undefined) {
    return unitSettings.enabledTypes[typeId];
  }
  if (defaultSettings.enabledTypes[typeId] !== undefined) {
    return defaultSettings.enabledTypes[typeId];
  }

  return true;
}

/**
 * Admin címzettek kinyerése:
 *  1) unit-specifikus adminRecipients[typeId]
 *  2) default adminRecipients[typeId]
 *  3) adminDefaultEmail (unit + default)
 *  4) legacyRecipients fallback-ből
 */
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

  if (unitSettings.adminDefaultEmail) {
    recipients.add(unitSettings.adminDefaultEmail);
  }
  if (defaultSettings.adminDefaultEmail) {
    recipients.add(defaultSettings.adminDefaultEmail);
  }

  (legacyRecipients || []).forEach((email) => recipients.add(email));

  return Array.from(recipients);
}

/**
 * Részleges mentés egy egység email_settings dokumentumára.
 * (EmailSettingsApp ebből hívja: enabledTypes, adminRecipients, adminDefaultEmail, templateOverrides, stb.)
 */
export async function savePartialEmailSettings(
  unitId: string,
  data: Record<string, any>
): Promise<void> {
  console.log('[savePartialEmailSettings] unitId =', unitId, 'data =', data);
  const docRef = doc(db, 'email_settings', unitId);
  await setDoc(docRef, data, { merge: true });
  console.log('[savePartialEmailSettings] OK for', unitId);
}