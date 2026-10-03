/**
 * Identifier primitives.
 *
 * All persistent entities use UUIDs. New IDs are UUIDv7 (RFC 9562): the first 48 bits are a
 * millisecond timestamp, so IDs are roughly time-ordered. This keeps B-tree indexes on very large
 * tables (item_instances, item_history) append-friendly instead of randomly fragmented.
 *
 * IDs are generated in this isomorphic module so the server can create IDs before inserting
 * (useful for building history rows in the same transaction). Clients must NEVER mint IDs for
 * authoritative entities; the server ignores any client-provided entity ID.
 */

declare const brand: unique symbol;

/** Nominal typing helper so an AccountId cannot be passed where an ItemInstanceId is expected. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type AccountId = Brand<string, 'AccountId'>;
export type CharacterId = Brand<string, 'CharacterId'>;
export type ItemInstanceId = Brand<string, 'ItemInstanceId'>;
export type ContainerId = Brand<string, 'ContainerId'>;
export type ListingId = Brand<string, 'ListingId'>;
export type SessionId = Brand<string, 'SessionId'>;

/** Content IDs are human-readable stable slugs authored in game data, e.g. `weapon.sword.iron_longsword`. */
export type ContentId = string;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Generates a UUIDv7 string. `nowMs` is injectable for deterministic tests. */
export function uuidv7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ts = BigInt(nowMs);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newId<T extends string>(): Brand<string, T> {
  return uuidv7() as Brand<string, T>;
}
