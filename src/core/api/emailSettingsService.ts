import { db } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { EmailTypeId } from '../email/emailTypes';
import { defaultTemplates } from '../email/defaultTemplates';

// Definiáljuk a beállítások dokumentumának struktúráját
export interface EmailSettingsDocument {
  enabledTypes: Record<string, boolean>;
  adminRecipients: Record<string, string[]>;
  templateOverrides?: {
    [key in EmailTypeId]?: {
      subject: string;
      html: string;
    }
  };
  adminDefaultEmail?: string;
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
    adminDefaultEmail: '',
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
      adminDefaultEmail: data.adminDefaultEmail || '',
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
 * Menti a beállítások egy részletét a Firestore-ba.
 * Az `updateDoc` használatával biztonságosan frissít beágyazott objektumokat is.
 * Ha a dokumentum nem létezik, `setDoc`-kal létrehozza.
 *
 * @param unitId Az egység azonosítója.
 * @param partial A menteni kívánt részleges adat.
 */
export const savePartialEmailSettings = async (unitId: string, partial: Record<string, any>): Promise<void> => {
    if (!unitId) {
        throw new Error("Unit ID is required to save email settings.");
    }
    const docRef = doc(db, 'email_settings', unitId);
    try {
        // Először megpróbáljuk frissíteni. Ez a leggyakoribb eset és kezeli a beágyazott mezőket.
        await updateDoc(docRef, partial);
    } catch (err: any) {
        if (err.code === 'not-found') {
            // Ha a dokumentum nem létezik, hozzuk létre a `setDoc`-kal.
            try {
                await setDoc(docRef, partial, { merge: true });
            } catch (createErr) {
                 console.error(`Failed to CREATE email settings for unit ${unitId}:`, createErr);
                 throw createErr;
            }
        } else {
            // Bármilyen más hiba esetén dobjuk tovább.
            console.error(`Failed to UPDATE email settings for unit ${unitId}:`, err);
            throw err;
        }
    } finally {
        // Írás után mindig érvénytelenítjük a cache-t, hogy a következő olvasás friss legyen.
        settingsCache.delete(unitId);
    }
};

/**
 * Checks if an email should be sent for a given type and unit.
 * It checks the unit-specific setting first, then the global 'default' setting.
 * @param typeId The type of email.
 * @param unitId The unit ID.
 * @returns `false` only if the email type is explicitly disabled, otherwise `true`.
 */
export async function shouldSendEmail(typeId: string, unitId: string | null | undefined): Promise<boolean> {
    const checkOrder = [unitId, 'default'].filter(Boolean) as string[];

    for (const id of checkOrder) {
        try {
            const settings = await getEmailSettingsForUnit(id);
            if (settings.enabledTypes.hasOwnProperty(typeId)) {
                return settings.enabledTypes[typeId]; // Return explicit setting (true or false)
            }
        } catch (error) {
            console.error(`Error checking email settings for ${id}. Defaulting to sending.`, error);
            return true; // Fail open
        }
    }
    return true; // Default to true if no setting is found
}

/**
 * Resolves the final list of admin recipients for a notification.
 * It prioritizes unit-specific overrides, then falls back to the unit's default email,
 * and finally to the legacy fallback list.
 * @param typeId The type of email.
 * @param unitId The unit ID.
 * @param legacyFallback A list of emails to use if no other setting is found.
 * @returns A deduplicated array of recipient email addresses.
 */
export async function getAdminRecipientsOverride(
  typeId: string,
  unitId: string | null | undefined,
  legacyFallback: string[] = []
): Promise<string[]> {
  const allRecipients = new Set<string>();

  const processSettings = (settings: EmailSettingsDocument | null) => {
    if (!settings) return false;
    const overrideList = settings.adminRecipients?.[typeId];
    if (overrideList && overrideList.length > 0) {
      overrideList.forEach(email => allRecipients.add(email));
      return true; // Found a specific override, stop processing.
    }
    if (settings.adminDefaultEmail) {
      allRecipients.add(settings.adminDefaultEmail);
    }
    return false;
  };

  try {
    if (unitId) {
      const unitSettings = await getEmailSettingsForUnit(unitId);
      if (processSettings(unitSettings)) {
         return [...allRecipients].filter(Boolean);
      }
    }
    const defaultSettings = await getEmailSettingsForUnit('default');
    processSettings(defaultSettings);
  } catch (error) {
    console.error(`Error getting admin recipients for ${typeId}:`, error);
  }

  // If after all checks there are still no recipients, use the legacy fallback.
  if (allRecipients.size === 0) {
    legacyFallback.forEach(email => allRecipients.add(email));
  }

  return [...allRecipients].filter(email => email && email.includes('@'));
}

// Simple template renderer
const renderTemplate = (template: string, payload: Record<string, any>): string => {
  let rendered = template;
  rendered = rendered.replace(/{{#each (\w+)}}([\s\S]*?){{\/each}}/g, (match, key, blockContent) => {
    const list = payload[key.trim()];
    if (Array.isArray(list)) {
      return list.map(item => {
        let itemBlock = blockContent;
        if (typeof item === 'object' && item !== null) {
          itemBlock = itemBlock.replace(/{{this\.(\w+)}}/g, (itemMatch, itemKey) => item[itemKey.trim()] ?? itemMatch);
        }
        return itemBlock;
      }).join('');
    }
    return '';
  });
  rendered = rendered.replace(/{{(.*?)}}/g, (match, key) => payload[key.trim()] ?? match);
  return rendered;
};


/**
 * Resolves the correct email template (subject and HTML) for a given type and unit.
 * It checks for a unit-specific override, then a global override, and finally falls back
 * to the hardcoded default template.
 * @param unitId The unit ID.
 * @param typeId The type of email.
 * @param payload The data to inject into the template.
 * @returns The rendered subject and HTML content.
 */
export const resolveEmailTemplate = async (
  unitId: string | null | undefined,
  typeId: EmailTypeId,
  payload: Record<string, any>
): Promise<{ subject: string; html: string }> => {
  const defaultTemplate = defaultTemplates[typeId];
  if (!defaultTemplate) throw new Error(`No default template for typeId: ${typeId}`);

  let finalTemplateData = { ...defaultTemplate };

  const checkOrder = [unitId, 'default'].filter(Boolean) as string[];
  for (const id of checkOrder) {
    try {
      const settings = await getEmailSettingsForUnit(id);
      const override = settings.templateOverrides?.[typeId];
      if (override && override.subject && override.html) {
        finalTemplateData = override;
        break; // Found the most specific override, stop searching.
      }
    } catch (error) {
      console.error(`Error resolving template override for ${typeId} in ${id}.`, error);
    }
  }

  return {
    subject: renderTemplate(finalTemplateData.subject, payload),
    html: renderTemplate(finalTemplateData.html, payload),
  };
};
