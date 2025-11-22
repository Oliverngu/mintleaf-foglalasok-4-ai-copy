export type EmailTypeId =
  | "leave_request_created"
  | "leave_request_approved"
  | "leave_request_rejected"
  | "booking_created_guest"
  | "booking_created_admin"
  | "booking_status_updated_guest"
  | "booking_cancelled_admin"
  | "user_registration_welcome"
  | "new_schedule_published";

// FIX: Added and exported the list of known email type IDs.
export const KNOWN_TYPE_IDS: EmailTypeId[] = [
  "leave_request_created",
  "leave_request_approved",
  "leave_request_rejected",
  "booking_created_guest",
  "booking_created_admin",
  "booking_status_updated_guest",
  "booking_cancelled_admin",
  "user_registration_welcome",
  "new_schedule_published",
];

const typeIdSet = new Set(KNOWN_TYPE_IDS);

// FIX: Added and exported the type validation function.
export const isValidTypeId = (typeId: string): typeId is EmailTypeId => {
  return typeIdSet.has(typeId as EmailTypeId);
};
