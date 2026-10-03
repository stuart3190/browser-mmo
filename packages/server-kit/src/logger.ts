import { pino } from 'pino';
import type { Logger } from 'pino';

export type { Logger };

/**
 * Structured JSON logging (pino). One logger per process, child loggers per request/connection.
 * Never log session tokens, passwords or full request bodies.
 */
export function createLogger(opts: { service: string; level: string; pretty?: boolean }): Logger {
  return pino({
    level: opts.level,
    base: { service: opts.service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'token', '*.token', 'password', '*.password'],
      censor: '[redacted]',
    },
  });
}
