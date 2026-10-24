/** Small authored Web Audio cues. Combat results remain entirely server-owned. */
export type SoundCue =
  | 'strike'
  | 'fire'
  | 'frost'
  | 'guard'
  | 'hurt'
  | 'warning'
  | 'loot'
  | 'quest'
  | 'level'
  | 'death'
  | 'heal';
type Note = {
  hz: number;
  end?: number;
  at?: number;
  duration: number;
  gain: number;
  wave?: OscillatorType;
};
export const soundNotes: Record<SoundCue, Note[]> = {
  strike: [
    { hz: 180, end: 65, duration: 0.12, gain: 0.15, wave: 'triangle' },
    { hz: 900, end: 500, duration: 0.055, gain: 0.035 },
  ],
  fire: [
    { hz: 330, end: 95, duration: 0.22, gain: 0.09, wave: 'sawtooth' },
    { hz: 95, end: 45, at: 0.08, duration: 0.18, gain: 0.1, wave: 'triangle' },
  ],
  frost: [
    { hz: 1320, end: 880, duration: 0.2, gain: 0.055 },
    { hz: 1760, end: 1320, at: 0.05, duration: 0.24, gain: 0.035 },
  ],
  guard: [
    { hz: 220, duration: 0.22, gain: 0.1, wave: 'triangle' },
    { hz: 990, end: 880, duration: 0.18, gain: 0.045 },
  ],
  hurt: [{ hz: 100, end: 45, duration: 0.15, gain: 0.16, wave: 'triangle' }],
  warning: [
    { hz: 220, duration: 0.14, gain: 0.1 },
    { hz: 294, at: 0.19, duration: 0.18, gain: 0.1 },
  ],
  loot: [
    { hz: 1047, duration: 0.09, gain: 0.04 },
    { hz: 1397, at: 0.06, duration: 0.12, gain: 0.025 },
  ],
  quest: [
    { hz: 523, duration: 0.28, gain: 0.08 },
    { hz: 659, at: 0.12, duration: 0.28, gain: 0.07 },
    { hz: 784, at: 0.24, duration: 0.4, gain: 0.06 },
  ],
  level: [
    { hz: 392, duration: 0.23, gain: 0.08 },
    { hz: 494, at: 0.12, duration: 0.23, gain: 0.07 },
    { hz: 587, at: 0.24, duration: 0.23, gain: 0.07 },
    { hz: 784, at: 0.36, duration: 0.5, gain: 0.07 },
  ],
  death: [{ hz: 220, end: 55, duration: 0.65, gain: 0.1, wave: 'triangle' }],
  heal: [
    { hz: 440, end: 660, duration: 0.24, gain: 0.05 },
    { hz: 880, at: 0.12, duration: 0.3, gain: 0.04 },
  ],
};
export interface AudioPreferences {
  muted: boolean;
  volume: number;
  available: boolean;
}
const storageKey = 'broken-odyssey:audio';
export class GameAudio {
  private prefs: AudioPreferences = { muted: false, volume: 0.35, available: true };
  private listeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources = new Set<OscillatorNode>();
  private lastCue = new Map<SoundCue, number>();
  private disposed = false;
  constructor(
    private createContext = () => new AudioContext(),
    private visible = () => document.visibilityState === 'visible',
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (typeof saved?.muted === 'boolean') this.prefs.muted = saved.muted;
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume))
        this.prefs.volume = Math.max(0, Math.min(1, saved.volume));
    } catch {
      /* Preferences are optional when storage is unavailable. */
    }
  }
  snapshot = () => this.prefs;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<AudioPreferences>) {
    this.prefs = { ...this.prefs, ...patch };
    if (this.master && this.context)
      this.master.gain.setValueAtTime(
        this.prefs.muted ? 0 : this.prefs.volume,
        this.context.currentTime,
      );
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ muted: this.prefs.muted, volume: this.prefs.volume }),
      );
    } catch {
      /* Optional. */
    }
    this.listeners.forEach((l) => l());
  }
  setMuted(muted: boolean) {
    if (muted) this.stopVoices();
    this.update({ muted });
  }
  setVolume(volume: number) {
    if (Number.isFinite(volume)) this.update({ volume: Math.max(0, Math.min(1, volume)) });
  }
  /** Called only from genuine user interaction. Missed events are never queued for later playback. */
  unlock = () => {
    if (this.disposed || this.prefs.muted || !this.visible()) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.prefs.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state !== 'running' && this.context.state !== 'closed')
        void this.context
          .resume()
          .then(() => {
            if (!this.prefs.available) this.update({ available: true });
          })
          .catch(() => this.update({ available: false }));
      else if (this.context.state === 'running' && !this.prefs.available)
        this.update({ available: true });
    } catch {
      this.update({ available: false });
    }
  };
  play(cue: SoundCue) {
    const ctx = this.context;
    if (
      this.disposed ||
      !ctx ||
      !this.master ||
      ctx.state !== 'running' ||
      this.prefs.muted ||
      this.prefs.volume === 0 ||
      !this.visible()
    )
      return;
    // Multi-target hits remain one readable cue, rather than a wall of overlapping notes.
    const now = ctx.currentTime;
    if (now - (this.lastCue.get(cue) ?? -10) < 0.12) return;
    if (this.sources.size + soundNotes[cue].length > 16) return;
    this.lastCue.set(cue, now);
    for (const note of soundNotes[cue]) {
      const source = ctx.createOscillator(),
        gain = ctx.createGain(),
        start = now + (note.at ?? 0);
      source.type = note.wave ?? 'sine';
      source.frequency.setValueAtTime(note.hz, start);
      if (note.end) source.frequency.exponentialRampToValueAtTime(note.end, start + note.duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      source.connect(gain);
      gain.connect(this.master);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start(start);
      source.stop(start + note.duration + 0.015);
    }
  }
  private stopVoices() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.sources.clear();
  }
  attach() {
    const hidden = () => {
      if (!this.visible()) this.stopVoices();
    };
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointerdown', this.unlock);
      window.removeEventListener('keydown', this.unlock);
      document.removeEventListener('visibilitychange', hidden);
      this.dispose();
    };
  }
  dispose() {
    this.disposed = true;
    this.stopVoices();
    this.listeners.clear();
    if (this.context) void this.context.close().catch(() => {});
  }
}
