import { ErrorCode } from '@mmo/shared';

/** Maps domain error codes to HTTP status codes. One table, used by every HTTP surface. */
export function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.VALIDATION_FAILED:
    case ErrorCode.INVALID_SLOT:
    case ErrorCode.CONTAINER_KIND_MISMATCH:
    case ErrorCode.PROTOCOL_VERSION_UNSUPPORTED:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.ITEM_NOT_OWNED:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.INTERNAL:
      return 500;
    default:
      // Business-rule rejections (locked, bound, insufficient funds, conflicts...).
      return 409;
  }
}
