import { ErrorCode } from '@mmo/shared';
import type { z } from 'zod';
import {
  ClientMessageSchema,
  MAX_CLIENT_FRAME_BYTES,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  ServerMessageSchema,
} from './protocol';
import type {
  ClientMessage,
  ClientMessageType,
  ClientPayload,
  ServerMessage,
  ServerMessageType,
  ServerPayload,
} from './protocol';

export type ParseResult<T> =
  { ok: true; message: T } | { ok: false; code: ErrorCode; reason: string };

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function parseWith<T>(schema: z.ZodType<T>, raw: string, maxBytes: number): ParseResult<T> {
  if (raw.length > maxBytes || byteLength(raw) > maxBytes) {
    return { ok: false, code: ErrorCode.VALIDATION_FAILED, reason: 'frame too large' };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: ErrorCode.VALIDATION_FAILED, reason: 'invalid JSON' };
  }
  if (typeof json !== 'object' || json === null)
    return { ok: false, code: ErrorCode.VALIDATION_FAILED, reason: 'not an object' };
  const v = (json as { v?: unknown }).v;
  if (typeof v !== 'number' || !SUPPORTED_PROTOCOL_VERSIONS.includes(v)) {
    return {
      ok: false,
      code: ErrorCode.PROTOCOL_VERSION_UNSUPPORTED,
      reason: `unsupported protocol version ${String(v)}`,
    };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      code: ErrorCode.VALIDATION_FAILED,
      reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'invalid'}`,
    };
  }
  return { ok: true, message: parsed.data };
}

/** Server side: validate an inbound frame from an untrusted client. */
export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseWith(ClientMessageSchema, raw, MAX_CLIENT_FRAME_BYTES);
}

/** Client side: validate an inbound frame from the server (defensive; catches version skew). */
export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseWith(
    ServerMessageSchema as unknown as z.ZodType<ServerMessage>,
    raw,
    4 * 1024 * 1024,
  );
}

export function encodeClientMessage<T extends ClientMessageType>(
  t: T,
  seq: number,
  d: ClientPayload<T>,
): string {
  return JSON.stringify({ v: PROTOCOL_VERSION, t, seq, d });
}

export function encodeServerMessage<T extends ServerMessageType>(
  t: T,
  d: ServerPayload<T>,
  ack?: number,
): string {
  return JSON.stringify(
    ack === undefined ? { v: PROTOCOL_VERSION, t, d } : { v: PROTOCOL_VERSION, t, ack, d },
  );
}

/** Tracks the last accepted client seq on a connection; rejects replays and out-of-order frames. */
export class SequenceGuard {
  private last = -1;
  accept(seq: number): boolean {
    if (seq <= this.last) return false;
    this.last = seq;
    return true;
  }
}

export type { ServerMessage, ClientMessage };
