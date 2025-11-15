/**
 * Custom error class for handling API-specific errors with status codes.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors?: any[];

  constructor(statusCode: number, message: string, errors?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;

    // This is necessary to make `instanceof ApiError` work correctly
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
