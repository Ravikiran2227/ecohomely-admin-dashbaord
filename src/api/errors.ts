/**
 * Errors with the shape of MVP_API_CONTRACT.md section 1: `code` is one of forbidden 403, not_found 404,
 * validation 422, conflict 409; the specific cause goes in `reason` (the contract's `details.reason`).
 * The UI branches on `code` + `reason`, never on the message text.
 */
export type ErrorCode = "forbidden" | "not_found" | "validation" | "conflict" | "unauthorized" | "rate_limited" | "unavailable" | "internal";

export class ApiError extends Error {
  /** `details` is the server's non-sensitive detail object (for example `exclusion_reasons`), when it sent one. */
  constructor(readonly code: ErrorCode, message: string, readonly reason: string | null, readonly details: Record<string, unknown> | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(what: string, reason = "role_required") {
    super("forbidden", `Not allowed: ${what}`, reason);
    this.name = "ForbiddenError";
  }
}
export class ConflictError extends ApiError {
  constructor(message: string, reason = "state_changed") {
    super("conflict", message, reason);
    this.name = "ConflictError";
  }
}
export class ValidationError extends ApiError {
  constructor(message: string, reason: string) {
    super("validation", message, reason);
    this.name = "ValidationError";
  }
}
export class NotFoundError extends ApiError {
  constructor(what: string) {
    super("not_found", `${what} not found.`, null);
    this.name = "NotFoundError";
  }
}

/** Real-adapter only: the server answered 401, 429, 503 or 500, or could not be reached. The message never contains a token. */
export class TransportError extends ApiError {
  constructor(code: "unauthorized" | "rate_limited" | "unavailable" | "internal", message: string, reason: string | null, readonly requestId: string | null = null) {
    super(code, message, reason);
    this.name = "TransportError";
  }
}
