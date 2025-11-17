/**
 * =============================================================================
 * MintLeaf Email Service
 * =============================================================================
 * This service provides a unified interface for sending transactional emails
 * through a dedicated backend email gateway.
 *
 * How it works:
 * 1. The frontend calls the `sendEmail` function with a `typeId` and a `payload`.
 * 2. The `sendEmail` function sends a POST request to the gateway endpoint.
 * 3. The gateway uses the `typeId` (and `unitId`, if provided) to find the
 *    correct email template (either a unit-specific one from Firestore or a
 *    built-in default).
 * 4. The gateway populates the template with the `payload` data and sends the
 *    email via the configured provider (e.g., Resend).
 *
 * This architecture keeps all template logic and sensitive keys on the server-side,
 * making the frontend cleaner and more secure.
 */
// FIX: Added 'isValidTypeId' to the import from '../email/emailTypes' to resolve the module resolution error.
import { isValidTypeId, EmailTypeId } from '../email/emailTypes';

// --- Type Definitions ---

interface SendEmailParams {
  /** A unique identifier for the type of email to be sent (e.g., 'user_registration_welcome'). */
  typeId: string;
  /** Optional Unit ID to look for unit-specific templates. */
  unitId?: string | null;
  /** The recipient's email address or an array of addresses. */
  to: string | string[];
  /** Optional CC recipients. */
  cc?: string[];
  /** Optional BCC recipients. */
  bcc?: string[];
  /** The locale for the email template (defaults to 'hu' on the worker). */
  locale?: 'hu' | 'en';
  /** The data payload to populate the email template. */
  payload?: Record<string, any>;
  /** Optional metadata for logging or tracking. */
  meta?: Record<string, any>;
  /** Pre-rendered subject line. If provided, the worker will use this instead of its own template logic. */
  subject?: string;
  /** Pre-rendered HTML body. If provided, the worker will use this instead of its own template logic. */
  html?: string;
}

interface SendEmailResponse {
  ok: boolean;
  error?: string;
}

// --- Service Implementation ---

// The stable, correct endpoint for the email gateway.
const EMAIL_API_URL = "https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send";

/**
 * Sends an email by calling the backend email service.
 *
 * @param params - The parameters for the email request.
 * @returns A promise that resolves to a response object indicating success or failure.
 */
export const sendEmail = async (params: SendEmailParams): Promise<SendEmailResponse> => {
  // Validate the typeId against the central registry before sending.
  if (!isValidTypeId(params.typeId)) {
    console.warn("sendEmail called with invalid typeId:", params.typeId);
    return { ok: false, error: "invalid_typeId" };
  }

  try {
    const response = await fetch(EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // Ensure the body matches the structure expected by the worker
      body: JSON.stringify({
        typeId: params.typeId,
        unitId: params.unitId ?? null,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        locale: params.locale ?? "hu",
        payload: params.payload ?? {},
        meta: params.meta ?? {},
        // Pass pre-rendered content to the worker
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("Email sending failed:", response.status, text);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    // Handle cases where the gateway itself returns a structured error with a 200 OK status
    const data = await response.json().catch(() => ({}));
    if (data && data.ok === false && data.error) {
      console.error("Email gateway returned an error:", data.error);
      return { ok: false, error: data.error };
    }

    return { ok: true };
  } catch (err) {
    console.error("Network or other error while sending email:", err);
    return { ok: false, error: "network_error" };
  }
};
