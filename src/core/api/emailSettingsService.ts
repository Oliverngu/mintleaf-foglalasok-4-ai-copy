import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

// Definiáljuk a beállítások dokumentumának struktúráját
export interface EmailSettingsDocument {
  enabledTypes: Record<string, boolean>;
  adminRecipients: Record<string, string[]>;
  templateOverrides?: {
    [key: string]: {
      subject: string;
      html: string;
    }
  };
}

// Session-szintű cache, hogy ne kérdezzük le ugyanazt többször
const settingsCache = new Map<string, EmailSettingsDocument>();

/**
 * Lekéri és gyorsítótárazza egy adott egység email beállításait a Firestore-ból.
 * Ha a dokumentum nem létezik, vagy hiba történik, egy alapértelmezett, üres
 * beállítási objektummal tér vissza, így a hívó kód hibatűrő marad.
 *
 * @param unitId Az egység azonosítója ('default' a globális beállításokhoz).
 * @returns Promise, ami egy EmailSettingsDocument objektummal oldódik fel.
 */
export const getEmailSettingsForUnit = async (unitId: string): Promise<EmailSettingsDocument> => {
  if (settingsCache.has(unitId)) {
    return settingsCache.get(unitId)!;
  }

  const defaultSettings: EmailSettingsDocument = {
    enabledTypes: {},
    adminRecipients: {},
    templateOverrides: {},
  };

  try {
    const docRef = doc(db, 'email_settings', unitId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.log(`No email settings found for unitId: ${unitId}. Using defaults.`);
      settingsCache.set(unitId, defaultSettings);
      return defaultSettings;
    }

    const data = docSnap.data();
    const settings: EmailSettingsDocument = {
      enabledTypes: data.enabledTypes || {},
      adminRecipients: data.adminRecipients || {},
      templateOverrides: data.templateOverrides || {},
    };

    settingsCache.set(unitId, settings);
    return settings;
  } catch (error) {
    console.error(`Failed to fetch email settings for unit ${unitId}. Returning defaults.`, error);
    // Hiba esetén is a default objektumot adjuk vissza, hogy az app ne álljon le.
    return defaultSettings;
  }
};


/**
 * Decide if this email type should be sent for a unit, based on email_settings.
 * If settings.enabledTypes[typeId] === false → return false.
 * If missing or true → return true.
 */
export async function shouldSendEmail(typeId: string, unitId: string | null | undefined): Promise<boolean> {
  if (!unitId) {
    return true; // If no unitId, send by default.
  }
  try {
    const settings = await getEmailSettingsForUnit(unitId);
    // Only return false if explicitly disabled. Undefined or true means send.
    return settings.enabledTypes[typeId] !== false;
  } catch (error) {
    console.error(`Error in shouldSendEmail for type ${typeId} in unit ${unitId}:`, error);
    return true; // Fail open: send the email if settings check fails.
  }
}

/**
 * Calculate final admin recipients for an "admin notification" email type.
 *
 * - Reads email_settings/{unitId}.adminRecipients[typeId] if available.
 * - If that list is non-empty: uses it as PRIMARY list.
 * - If that list is empty/missing AND legacyFallback is provided:
 *     uses legacyFallback.
 * - Returns a deduplicated array of emails.
 */
export async function getAdminRecipientsOverride(
  typeId: string,
  unitId: string | null | undefined,
  legacyFallback: string[] = []
): Promise<string[]> {

  if (!unitId) {
    return [...new Set(legacyFallback)];
  }

  try {
    const settings = await getEmailSettingsForUnit(unitId);
    const overrideRecipients = settings.adminRecipients[typeId];

    if (overrideRecipients && overrideRecipients.length > 0) {
      // Use the override list, deduplicated.
      return [...new Set(overrideRecipients)];
    }
  } catch (error) {
    console.error(`Error in getAdminRecipientsOverride for type ${typeId} in unit ${unitId}:`, error);
    // Fall through to legacy fallback on error.
  }

  // Use legacy fallback if no override or if there was an error.
  return [...new Set(legacyFallback)];
}