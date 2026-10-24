import { useEffect, useRef, useState } from 'react';
import type { ClientPayload } from '@mmo/networking';
import { useGame } from './context';
import { Window } from './Window';

type Channel = ClientPayload<'chat.send'>['channel'];
const labels: Record<Channel, string> = { say: 'Nearby', zone: 'Zone', party: 'Party' };

export function ChatWindow() {
  const { state } = useGame();
  return (
    <Window id="chat" title="Chat">
      {state.open.has('chat') && <ChatContents />}
    </Window>
  );
}

function ChatContents() {
  const { state, chat, controls } = useGame();
  const [channel, setChannel] = useState<Channel>('say');
  const [draft, setDraft] = useState('');
  const history = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const last = state.chatMessages.at(-1)?.id;
  useEffect(() => {
    controls.analog.clear();
    // Do not summon a phone keyboard until the player taps the composer.
    if (!matchMedia('(pointer: coarse)').matches) input.current?.focus();
  }, [controls]);
  useEffect(() => {
    if (atBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [last]);
  const canSend = state.connection === 'open' && (channel !== 'party' || !!state.party.partyId);
  return (
    <div className="chat-content">
      <div
        className="chat-history"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        ref={history}
        onScroll={() => {
          const el = history.current!;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
        }}
      >
        {!state.chatMessages.length && <p className="muted">Say hello to a fellow adventurer.</p>}
        {state.chatMessages.map((m) => (
          <p className={`chat-line chat-${m.channel}`} key={m.id}>
            <span className="chat-channel">[{labels[m.channel as Channel] ?? m.channel}]</span>{' '}
            <strong>{m.from.name}</strong>: <span>{m.text}</span>
          </p>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!canSend || !text) return;
          chat({ channel, text });
          setDraft('');
          atBottom.current = true;
          input.current?.focus();
        }}
      >
        <label>
          Send to
          <select
            aria-label="Chat channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
          >
            <option value="say">Nearby · 40 m</option>
            <option value="zone">Everyone in this zone</option>
            <option value="party" disabled={!state.party.partyId}>
              Party only
            </option>
          </select>
        </label>
        <div className="chat-send">
          <input
            ref={input}
            aria-label="Chat message"
            placeholder="Write a message…"
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                state.toggle('chat', false);
              }
            }}
          />
          <button type="submit" disabled={!canSend || !draft.trim()}>
            Send
          </button>
        </div>
        <span className="small muted">
          {state.connection !== 'open'
            ? 'Reconnect to send messages.'
            : channel === 'party' && !state.party.partyId
              ? 'Join a party to send privately.'
              : 'Recent messages stay here until you reload.'}{' '}
          {draft.length}/500
        </span>
      </form>
    </div>
  );
}
