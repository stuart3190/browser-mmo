/**
 * Stable, machine-readable error codes shared by the server and every client.
 *
 * Clients (browser game, admin, future mobile app) switch on `code`, never on message text.
 * Adding a code is safe; renaming or removing one is a breaking API change.
 */
export const ErrorCode = {
  // Generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // Items / storage
  ITEM_NOT_OWNED: 'ITEM_NOT_OWNED',
  ITEM_LOCKED: 'ITEM_LOCKED',
  ITEM_NOT_IN_EXPECTED_LOCATION: 'ITEM_NOT_IN_EXPECTED_LOCATION',
  ITEM_NOT_TRADEABLE: 'ITEM_NOT_TRADEABLE',
  ITEM_NOT_VAULTABLE: 'ITEM_NOT_VAULTABLE',
  ITEM_BOUND: 'ITEM_BOUND',
  CONTAINER_FULL: 'CONTAINER_FULL',
  SLOT_OCCUPIED: 'SLOT_OCCUPIED',
  INVALID_SLOT: 'INVALID_SLOT',
  CONTAINER_KIND_MISMATCH: 'CONTAINER_KIND_MISMATCH',

  // Equipment
  CANNOT_EQUIP: 'CANNOT_EQUIP',
  LEVEL_TOO_LOW: 'LEVEL_TOO_LOW',
  CLASS_RESTRICTED: 'CLASS_RESTRICTED',

  // Economy
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  LISTING_NOT_ACTIVE: 'LISTING_NOT_ACTIVE',
  CANNOT_BUY_OWN_LISTING: 'CANNOT_BUY_OWN_LISTING',

  // World / realtime
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  ALREADY_CLAIMED: 'ALREADY_CLAIMED',
  PROTOCOL_VERSION_UNSUPPORTED: 'PROTOCOL_VERSION_UNSUPPORTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Error thrown by domain logic for expected, user-facing failures (as opposed to bugs).
 * Transport layers (HTTP, WebSocket) translate it into a structured error response.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
