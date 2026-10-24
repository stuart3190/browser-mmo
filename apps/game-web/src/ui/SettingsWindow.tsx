import { useSyncExternalStore } from 'react';
import { useGame } from './context';
import { Window } from './Window';
export function SettingsWindow() {
  const { audio } = useGame();
  const prefs = useSyncExternalStore(audio.subscribe, audio.snapshot);
  return (
    <Window id="settings" title="Settings & Controls">
      <h3>Sound effects</h3>
      <p className="small">
        Weapon hits, spells, danger cues and rewards. Sound starts after you interact with the game;
        these preferences stay on this browser.
      </p>
      {!prefs.available && (
        <p role="status">
          Audio is unavailable in this browser. All combat warnings also appear on screen.
        </p>
      )}
      <button
        data-testid="sound-toggle"
        aria-pressed={prefs.muted}
        onClick={() => {
          audio.setMuted(!prefs.muted);
          audio.unlock();
        }}
      >
        {prefs.muted ? 'Sound muted — enable' : 'Sound on — mute'}
      </button>
      <div className="sound-volume">
        <label htmlFor="sound-effects-volume">Sound effects volume</label>{' '}
        <output>{Math.round(prefs.volume * 100)}%</output>
        <input
          id="sound-effects-volume"
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(prefs.volume * 100)}
          onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
        />
      </div>
      <button
        disabled={prefs.muted || prefs.volume === 0 || !prefs.available}
        onClick={() => {
          audio.unlock();
          audio.play('quest');
        }}
      >
        Test sound
      </button>
      <h3>Explore and fight</h3>
      <p>
        WASD moves. Drag the world to look; scroll to zoom. Tab cycles nearby enemies. F toggles
        attack, 1–4 use abilities and H drinks a carried remedy.
      </p>
      <p>
        On touch, move with the left stick, drag the world to look, tap an enemy and use the combat
        buttons. Swipe the bottom menu to find more panels.
      </p>
      <p>
        E talks, gathers or chooses a nearby passage. Enter opens chat. Escape closes the current
        panel or clears a stopped target. K opens these settings.
      </p>
    </Window>
  );
}
