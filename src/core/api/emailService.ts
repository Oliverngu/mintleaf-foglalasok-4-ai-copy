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
import { isValidTypeId } from '../email/emailTypes';

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

/**
 * =============================================================================
 * USAGE EXAMPLES
 * =============================================================================
 */

/*
// Example 1: Notify admins when a new leave request is created.
// This would be called from the component where a user submits a leave request.

async function handleLeaveRequestSubmit(requestData, adminEmails) {
  // ... code to save the request to Firestore ...

  const emailResponse = await sendEmail({
    typeId: 'leave_request_created', // Matches the template ID on the worker
    unitId: requestData.unitId,
    to: adminEmails, // An array of admin email addresses
    locale: 'hu',
    payload: {
      userName: requestData.userName,
      startDate: requestData.startDate.toDate().toLocaleDateString('hu-HU'),
      endDate: requestData.endDate.toDate().toLocaleDateString('hu-HU'),
      note: requestData.note || 'Nincs megjegyzés.'
    }
  });

  if (!emailResponse.ok) {
    console.warn("Leave request notification email could not be sent:", emailResponse.error);
    // Note: Don't block the user flow for this. The primary action (saving the request) succeeded.
  }
}
*/


/*
// Example 2: Notify a user when their leave request is approved.
// This would be called from the admin panel when an admin clicks "Approve".

async function handleLeaveRequestApproval(request, userEmail) {
  // ... code to update the request status in Firestore ...

  const emailResponse = await sendEmail({
    typeId: 'leave_request_approved', // Matches the template ID on the worker
    unitId: request.unitId,
    to: userEmail,
    locale: 'hu', // Or get user's preferred locale
    payload: {
      firstName: request.userName.split(' ')[1] || request.userName,
      startDate: request.startDate.toDate().toLocaleDateString('hu-HU'),
      endDate: request.endDate.toDate().toLocaleDateString('hu-HU'),
      reviewedBy: 'A vezetőség'
    }
  });

  if (!emailResponse.ok) {
    console.warn("Leave request approval email could not be sent:", emailResponse.error);
  }
}
*/


/*
// Example 3: Send a confirmation email to a guest after they make a booking.
// This would be called from the public reservation page.

async function handleGuestBooking(bookingData, unit) {
  // ... code to save the booking to Firestore ...

  const emailResponse = await sendEmail({
    typeId: 'booking_created_guest', // Matches the template ID on the worker
    unitId: unit.id,
    to: bookingData.contact.email,
    locale: bookingData.locale || 'hu',
    payload: {
      unitName: unit.name,
      bookingName: bookingData.name,
      bookingDate: bookingData.startTime.toDate().toLocaleDateString(bookingData.locale),
      bookingTime: bookingData.startTime.toDate().toLocaleTimeString(bookingData.locale, { hour: '2-digit', minute: '2-digit' }),
      headcount: bookingData.headcount,
      bookingRef: bookingData.referenceCode
    }
  });

   if (!emailResponse.ok) {
    console.warn("Guest booking confirmation email could not be sent:", emailResponse.error);
  }
}
*/


/**
 * =============================================================================
 * FUTURE DEVELOPMENT PLAN: DYNAMIC TEMPLATE EDITOR (COMMENT ONLY)
 * =============================================================================
 *
 * This section outlines a future enhancement and should NOT be implemented now.
 *
 * Goal: Allow admins to edit email templates directly within the application,
 * with overrides possible on a per-unit basis.
 *
 * --- Proposed Firestore Structure ---
 *
 * Collection: `email_templates`
 * Document ID: `unitId` (e.g., "central" for global defaults, or a specific unit ID for overrides)
 *
 * Document Fields:
 *   - templates: Map<string, TemplateData>
 *
 * --- TemplateData Map Structure ---
 *
 * The `templates` field would be a map where the key is the `typeId`.
 *
 * {
 *   "user_registration_welcome": {
 *     "subject": "Üdv a MintLeaf rendszerében, {{firstName}}!",
 *     "html": "<h1>Szia {{firstName}}!</h1><p>Sikeresen regisztráltál.</p>",
 *     "text": "Szia {{firstName}}! Sikeresen regisztráltál.",
 *     "updatedAt": Timestamp,
 *     "updatedBy": "userId"
 *   },
 *   "new_schedule_published": { ... }
 * }
 *
 * --- Worker Logic Enhancement ---
 *
 * The Cloudflare Worker's logic would be updated as follows when handling a request:
 *
 * 1. Receive `typeId` and optional `unitId` from the frontend.
 * 2. If a `unitId` is provided, first try to fetch the template from `email_templates/{unitId}`.
 *    - If `templates[typeId]` exists in the unit-specific document, use it.
 * 3. If no unit-specific template is found, fetch the global default from `email_templates/central`.
 *    - If `templates[typeId]` exists, use it.
 * 4. If no template is found in Firestore at all, fall back to the hardcoded default
 *    template currently built into the Worker.
 * 5. Populate the chosen template with the payload and send the email.
 *
 * This approach provides a flexible, multi-layered templating system without
 * complicating the frontend's responsibility. The frontend only needs to know
 * the `typeId` and what data the template requires.
 */