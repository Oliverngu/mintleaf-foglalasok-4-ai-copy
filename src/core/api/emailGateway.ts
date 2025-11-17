/**
 * =============================================================================
 * MintLeaf Email Gateway Service
 * =============================================================================
 * This service provides a direct interface for sending transactional emails
 * through the dedicated Cloudflare Worker email gateway.
 *
 * It sends pre-rendered content, allowing the client-side to handle template
 * resolution logic.
 */

// --- Type Definitions ---

export interface SendEmailParams {
  /** A unique identifier for the type of email to be sent (e.g., 'user_registration_welcome'). */
  typeId: string;
  /** Optional Unit ID for logging or context at the gateway. */
  unitId?: string | null;
  /** The recipient's email address or an array of addresses. */
  to: string | string[];
  /** The data payload used to generate the email (for logging purposes). */
  payload?: Record<string, any>;
  /** Pre-rendered subject line. The worker will use this directly. */
  subject?: string;
  /** Pre-rendered HTML body. The worker will use this directly. */
  html?: string;
  /** The locale for the email template (defaults to 'hu' on the worker). */
  locale?: 'hu' | 'en';
}

export interface SendEmailResponse {
  ok: boolean;
  error?: string;
  messageId?: string;
}

const EMAIL_API_URL = "https://mintleaf-email-gateway.oliverngu.workers.dev/api/email/send";

/**
 * Sends a pre-rendered email by calling the backend email gateway worker.
 *
 * @param params - The parameters for the email request, including subject and html.
 * @returns A promise that resolves to a response object from the gateway.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
  try {
    const response = await fetch(EMAIL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown server error');
      console.error("Email gateway HTTP error:", response.status, errorText);
      return { ok: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json().catch(() => ({ ok: false, error: 'Invalid JSON response' }));
    return data;
  } catch (err) {
    console.error("Network or other error while sending email via gateway:", err);
    return { ok: false, error: "network_error" };
  }
}
