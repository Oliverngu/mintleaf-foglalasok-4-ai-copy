/**
 * =============================================================================
 * MintLeaf Email Type Registry
 * =============================================================================
 * This file serves as a central registry for all transactional email types
 * used in the application. It ensures type safety and prevents typos when
 * calling the email service.
 *
 * It also documents the purpose of each email and outlines the future plan
 * for dynamic, database-driven templates.
 */

// --- Type Definitions ---

/**
 * A union type of all known and valid email type identifiers.
 * This provides autocompletion and compile-time checks.
 */
export type EmailTypeId =
  // Leave Requests
  | "leave_request_created"   // Sent to admins when a new leave request is submitted.
  | "leave_request_approved"  // Sent to the user when their request is approved.
  | "leave_request_rejected"  // Sent to the user when their request is rejected.
  // Guest Bookings
  | "booking_created_guest"   // Confirmation sent to the guest after booking.
  | "booking_created_admin"   // Notification sent to the unit/admins about a new booking.
  // User Management
  | "user_registration_welcome" // Sent to a new user upon successful registration.
  | "new_schedule_published";   // Sent to users when a new weekly schedule is published.

// --- Registry & Validation ---

/**
 * An array of all known email type IDs for runtime validation.
 */
// Fix: Export 'KNOWN_TYPE_IDS' to make it accessible to other modules that import it.
export const KNOWN_TYPE_IDS: EmailTypeId[] = [
  "leave_request_created",
  "leave_request_approved",
  "leave_request_rejected",
  "booking_created_guest",
  "booking_created_admin",
  "user_registration_welcome",
  "new_schedule_published",
];

/**
 * Validates if a given string is a known and registered EmailTypeId.
 * Logs a warning to the console if the ID is unknown.
 *
 * @param typeId The string identifier to validate.
 * @returns `true` if the typeId is valid, `false` otherwise.
 */
export const isValidTypeId = (typeId: string): typeId is EmailTypeId => {
  if (KNOWN_TYPE_IDS.includes(typeId as EmailTypeId)) {
    return true;
  }
  
  console.warn(
    `[EmailService] Attempted to send an email with an unknown typeId: "${typeId}". ` +
    `Please register this typeId in 'src/core/email/emailTypes.ts' to ensure it is handled correctly.`
  );
  
  return false;
};


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