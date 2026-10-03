import { describe, expect, it } from 'vitest';
import { uuidv7 } from '@mmo/shared';
import {
  MAX_CLIENT_FRAME_BYTES,
  SequenceGuard,
  encodeClientMessage,
  encodeServerMessage,
  parseClientMessage,
  parseServerMessage,
} from './index';

describe('client message parsing', () => {
  it('round-trips a valid move intent', () => {
    const raw = encodeClientMessage('move.input', 7, {
      position: { x: 1, y: 0, z: 2 },
      rotationY: 0.5,
    });
    const res = parseClientMessage(raw);
    expect(res.ok).toBe(true);
    if (res.ok && res.message.t === 'move.input') {
      expect(res.message.seq).toBe(7);
      expect(res.message.d.position.x).toBe(1);
    }
  });

  it('rejects malformed JSON, unknown types, bad payloads and missing seq', () => {
    expect(parseClientMessage('{nope').ok).toBe(false);
    expect(
      parseClientMessage(JSON.stringify({ v: 1, t: 'admin.grant_item', seq: 1, d: {} })).ok,
    ).toBe(false);
    expect(
      parseClientMessage(
        JSON.stringify({ v: 1, t: 'move.input', seq: 1, d: { position: { x: 'a' } } }),
      ).ok,
    ).toBe(false);
    expect(parseClientMessage(JSON.stringify({ v: 1, t: 'ping', d: { clientTime: 1 } })).ok).toBe(
      false,
    );
    // Non-finite numbers cannot even be expressed in JSON; huge numbers are still finite but bounded by zone checks server-side.
    expect(
      parseClientMessage(
        JSON.stringify({ v: 1, t: 'chat.send', seq: 1, d: { channel: 'guild', text: 'hi' } }),
      ).ok,
    ).toBe(false);
  });

  it('rejects unsupported protocol versions with a specific code', () => {
    const res = parseClientMessage(
      JSON.stringify({ v: 99, t: 'ping', seq: 1, d: { clientTime: 1 } }),
    );
    expect(res).toMatchObject({ ok: false, code: 'PROTOCOL_VERSION_UNSUPPORTED' });
  });

  it('rejects oversized frames before parsing', () => {
    const text = 'x'.repeat(MAX_CLIENT_FRAME_BYTES);
    expect(
      parseClientMessage(
        JSON.stringify({ v: 1, t: 'chat.send', seq: 1, d: { channel: 'say', text } }),
      ).ok,
    ).toBe(false);
  });

  it('validates the auth handshake shape', () => {
    const ok = encodeClientMessage('auth.hello', 1, {
      token: 'a'.repeat(43),
      characterId: uuidv7(),
      client: 'game_web',
    });
    expect(parseClientMessage(ok).ok).toBe(true);
    const bad = encodeClientMessage('auth.hello', 1, {
      token: 'short',
      characterId: 'nope',
      client: 'game_web',
    });
    expect(parseClientMessage(bad).ok).toBe(false);
  });
});

describe('server message parsing', () => {
  it('round-trips a world.moves batch and an ack', () => {
    const raw = encodeServerMessage('world.moves', { tick: 3, moves: [['e:1', 1, 0, 2, 0.1]] });
    const res = parseServerMessage(raw);
    expect(res.ok && res.message.t === 'world.moves' && res.message.d.moves[0]![0]).toBe('e:1');
    const err = parseServerMessage(
      encodeServerMessage('error', { code: 'OUT_OF_RANGE', message: 'too far', fatal: false }, 12),
    );
    expect(err.ok && err.message.ack).toBe(12);
  });
});

describe('SequenceGuard', () => {
  it('rejects replayed and out-of-order sequence numbers', () => {
    const g = new SequenceGuard();
    expect(g.accept(1)).toBe(true);
    expect(g.accept(2)).toBe(true);
    expect(g.accept(2)).toBe(false);
    expect(g.accept(1)).toBe(false);
    expect(g.accept(10)).toBe(true);
  });
});
