import { expect, it, vi } from 'vitest';
import { GameAudio, soundNotes } from './game-audio';
function setup() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const oscillators: {
    stop: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }),
    createOscillator: () => {
      const o = {
        type: 'sine',
        frequency: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      oscillators.push(o);
      return o;
    },
  };
  let visible = true;
  const create = vi.fn(() => context as unknown as AudioContext);
  const audio = new GameAudio(create, () => visible);
  return {
    audio,
    context,
    create,
    oscillators,
    hide: () => {
      visible = false;
    },
  };
}
it('plays no queued sounds before a gesture, suppresses repeat impacts, and mutes current/future voices', () => {
  const { audio, create, oscillators, context, hide } = setup();
  audio.play('strike');
  expect(create).not.toHaveBeenCalled();
  audio.unlock();
  expect(oscillators).toHaveLength(0);
  audio.play('strike');
  expect(oscillators).toHaveLength(2);
  audio.play('strike');
  expect(oscillators).toHaveLength(2);
  context.currentTime = 0.2;
  audio.play('strike');
  expect(oscillators).toHaveLength(4);
  audio.setMuted(true);
  expect(oscillators.every((s) => s.stop.mock.calls.length === 2)).toBe(true);
  audio.play('quest');
  expect(oscillators).toHaveLength(4);
  audio.setMuted(false);
  audio.setVolume(0);
  audio.play('quest');
  expect(oscillators).toHaveLength(4);
  audio.setVolume(0.25);
  hide();
  audio.play('quest');
  expect(oscillators).toHaveLength(4);
  audio.dispose();
  expect(context.close).toHaveBeenCalledOnce();
});
it('handles suspended/unavailable audio without interrupting gameplay and bounds saved volume', () => {
  const { audio, context, oscillators } = setup();
  context.state = 'suspended';
  audio.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
  audio.play('warning');
  expect(oscillators).toHaveLength(0);
  audio.setVolume(Infinity);
  expect(audio.snapshot().volume).toBe(0.35);
  audio.setVolume(20);
  expect(audio.snapshot().volume).toBe(1);
  audio.setVolume(-4);
  expect(audio.snapshot().volume).toBe(0);
  const unavailable = new GameAudio(
    () => {
      throw Error('Not supported');
    },
    () => true,
  );
  expect(() => unavailable.unlock()).not.toThrow();
  expect(unavailable.snapshot().available).toBe(false);
});
it('authors finite short envelopes and tears down finished nodes', () => {
  for (const notes of Object.values(soundNotes))
    for (const note of notes) {
      expect(note.hz).toBeGreaterThan(0);
      expect(note.duration).toBeGreaterThan(0.008);
      expect(note.duration).toBeLessThan(1);
      expect(note.gain).toBeLessThanOrEqual(0.16);
    }
  const { audio, oscillators } = setup();
  audio.unlock();
  audio.play('quest');
  for (const source of oscillators) source.onended?.();
  audio.dispose();
  expect(oscillators.every((s) => s.stop.mock.calls.length === 1)).toBe(true);
});
it('persists mute and volume while ignoring malformed saved preferences', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  try {
    const first = setup();
    first.audio.setVolume(0.2);
    first.audio.setMuted(true);
    const next = setup();
    expect(next.audio.snapshot()).toMatchObject({ volume: 0.2, muted: true });
    next.audio.unlock();
    expect(next.create).not.toHaveBeenCalled();
    values.set('broken-odyssey:audio', '{broken');
    expect(setup().audio.snapshot()).toMatchObject({ volume: 0.35, muted: false });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('stops playing cues when hidden and detaches interaction listeners on scene disposal', () => {
  const win = new EventTarget(),
    doc = new EventTarget();
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  try {
    const { audio, oscillators, create, hide, context } = setup();
    const detach = audio.attach();
    win.dispatchEvent(new Event('pointerdown'));
    expect(create).toHaveBeenCalledOnce();
    audio.play('quest');
    hide();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(oscillators.every((s) => s.stop.mock.calls.length === 2)).toBe(true);
    detach();
    expect(context.close).toHaveBeenCalledOnce();
    win.dispatchEvent(new Event('pointerdown'));
    expect(create).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
