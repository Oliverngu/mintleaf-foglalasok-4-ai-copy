import { db } from './db'; // Mock DB client

export enum AuditAction {
  // User Actions
  USER_LOGIN = 'USER_LOGIN',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  // Shift Actions
  SHIFT_CREATE = 'SHIFT_CREATE',
  SHIFT_EDIT = 'SHIFT_EDIT',
  SHIFT_DELETE = 'SHIFT_DELETE',
  SHIFT_PUBLISH = 'SHIFT_PUBLISH',
  // Request Actions
  LEAVE_REQUEST_CREATE = 'LEAVE_REQUEST_CREATE',
  LEAVE_REQUEST_APPROVE = 'LEAVE_REQUEST_APPROVE',
  LEAVE_REQUEST_REJECT = 'LEAVE_REQUEST_REJECT',
}

interface AuditLogPayload {
  userId: string; // The ID of the user who performed the action
  action: AuditAction;
  targetId?: string; // Optional ID of the entity that was affected (e.g., shift ID, user ID)
  details?: string; // Human-readable description of the action
}

/**
 * Creates an audit log entry.
 * This should be called after any critical action is successfully performed.
 * @param payload - The data for the audit log entry.
 */
export async function logAuditEvent(payload: AuditLogPayload): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        timestamp: new Date(),
        userId: payload.userId,
        action: payload.action,
        targetId: payload.targetId,
        details: payload.details,
      },
    });
  } catch (error) {
    // It's crucial that audit logging failures do not crash the main application flow.
    // Log the error to a separate monitoring service (e.g., Sentry, DataDog).
    console.error('CRITICAL: Failed to create audit log entry', {
      payload,
      error,
    });
  }
}
