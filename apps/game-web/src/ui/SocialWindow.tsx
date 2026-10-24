import { useCallback, useEffect, useRef, useState } from 'react';
import type { DirectMessage, FriendAction, Friendship } from '@mmo/schemas';
import { useGame } from './context';
import { Window } from './Window';

const statusLabels: Record<Friendship['status'], string> = {
  accepted: 'Friend',
  pending_incoming: 'Wants to be your friend',
  pending_outgoing: 'Request sent',
  blocked: 'Direct messages blocked',
};
export function SocialWindow() {
  const { api, state } = useGame();
  const open = state.open.has('social'),
    characterId = state.character.id,
    connected = state.connection === 'open';
  const [friends, setFriends] = useState<Friendship[]>([]),
    [name, setName] = useState(''),
    [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false),
    generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const version = generation.current;
    const result = await api.friends(characterId);
    if (!mounted.current || version !== generation.current) return;
    setFriends(result.friends);
    const unread = result.friends.reduce(
      (n, f) => n + f.unread + (f.status === 'pending_incoming' ? 1 : 0),
      0,
    );
    if (state.socialUnread !== unread)
      state.update((s) => {
        s.socialUnread = unread;
      });
  }, [api, characterId, state]);
  useEffect(() => {
    if (!connected) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!running.current)
        try {
          await refresh();
        } catch (e) {
          if (!stopped && open) setError(e instanceof Error ? e.message : 'Cannot refresh friends');
        }
      if (!stopped) timer = setTimeout(() => void poll(), open ? 3000 : 15000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh, open, connected]);
  const run = async (work: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    generation.current++;
    setBusy(true);
    setError('');
    try {
      await work();
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Contact change failed');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const act = (friend: Friendship, action: FriendAction) =>
    void run(() => api.friendAction(characterId, friend.friendAccountId, action));
  const contact = friends.find((f) => f.friendAccountId === selected && f.status === 'accepted');
  return (
    <Window id="social" title="Friends & messages">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {open && contact ? (
        <Conversation
          key={contact.friendAccountId}
          contact={contact}
          refreshContacts={refresh}
          back={() => setSelected(null)}
        />
      ) : (
        <>
          <p className="small muted">
            Friends and messages follow your account across characters. Both players must accept the
            friendship before messaging.
          </p>
          <form
            className="friend-request"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(async () => {
                await api.requestFriend(characterId, name.trim());
                setName('');
              });
            }}
          >
            <label>
              Character name
              <input
                aria-label="Add friend by character name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                required
                disabled={busy}
              />
            </label>
            <button disabled={busy || !name.trim() || !connected}>Send friend request</button>
          </form>
          {!friends.length && <p>No contacts yet. Add someone you meet on your adventure.</p>}
          <div className="friend-list">
            {friends.map((friend) => (
              <article key={friend.friendAccountId} data-friend={friend.friendAccountId}>
                <strong>
                  {friend.friendName}
                  {friend.unread ? ` · ${friend.unread} unread` : ''}
                </strong>
                <span className="small muted">{statusLabels[friend.status]}</span>
                <div className="friend-actions">
                  {friend.status === 'accepted' && (
                    <button onClick={() => setSelected(friend.friendAccountId)}>
                      Message {friend.friendName}
                    </button>
                  )}
                  {friend.status === 'pending_incoming' && (
                    <button disabled={busy} onClick={() => act(friend, 'accept')}>
                      Accept friend
                    </button>
                  )}
                  {friend.status !== 'blocked' && (
                    <button disabled={busy} onClick={() => act(friend, 'remove')}>
                      {friend.status === 'pending_incoming'
                        ? 'Decline request'
                        : friend.status === 'pending_outgoing'
                          ? 'Cancel request'
                          : 'Remove friend'}
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => act(friend, friend.status === 'blocked' ? 'unblock' : 'block')}
                  >
                    {friend.status === 'blocked' ? 'Unblock contact' : 'Block contact'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="small muted">
            Blocking stops friend requests and direct messages. Unblocking requires a new friend
            request; it does not restore the friendship.
          </p>
        </>
      )}
    </Window>
  );
}

function mergeMessages(previous: DirectMessage[], incoming: DirectMessage[], earliest = false) {
  const map = new Map(previous.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  const ordered = [...map.values()].sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
  );
  return earliest ? ordered.slice(0, 500) : ordered.slice(-500);
}
function Conversation({
  contact,
  refreshContacts,
  back,
}: {
  contact: Friendship;
  refreshContacts: () => Promise<void>;
  back: () => void;
}) {
  const { api, state, controls } = useGame(),
    peer = contact.friendAccountId,
    characterId = state.character.id;
  const [messages, setMessages] = useState<DirectMessage[]>([]),
    [draft, setDraft] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [hasMore, setHasMore] = useState(false),
    [earlier, setEarlier] = useState(false);
  const mounted = useRef(true),
    sending = useRef(false),
    loadingOlder = useRef(false),
    atBottom = useRef(true);
  const request = useRef<{ id: string; body: string } | null>(null),
    history = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    mounted.current = true;
    controls.analog.clear();
    if (!matchMedia('(pointer:coarse)').matches) input.current?.focus();
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (loadingOlder.current) {
        timer = setTimeout(() => void poll(), 2000);
        return;
      }

      try {
        const result = await api.directMessages(characterId, peer);
        if (stopped || loadingOlder.current) return;
        const unread = result.messages
          .filter((m) => m.toAccountId === state.character.accountId && !m.readAt)
          .map((m) => m.id);
        if (unread.length) {
          const { readAt } = await api.readDirectMessages(characterId, peer, unread);
          for (const m of result.messages) if (unread.includes(m.id)) m.readAt = readAt;
          await refreshContacts();
        }
        if (stopped) return;
        setMessages((old) => mergeMessages(old, result.messages));
        if (!loadingOlder.current) setHasMore(result.hasMore);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Cannot load messages');
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 2000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [api, characterId, peer, state.character.accountId, controls, refreshContacts]);
  useEffect(() => {
    if (atBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [last]);
  async function send() {
    const body = draft.trim();
    if (sending.current || !body || state.connection !== 'open') return;
    if (!request.current || request.current.body !== body)
      request.current = { id: crypto.randomUUID(), body };
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api.sendDirectMessage(characterId, peer, request.current.id, body);
      if (!mounted.current) return;
      const wasEarlier = loadingOlder.current;
      setMessages((old) => (wasEarlier ? [result.message] : mergeMessages(old, [result.message])));
      loadingOlder.current = false;
      setEarlier(false);
      setDraft('');
      request.current = null;
      atBottom.current = true;
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Message failed; retry to send the same request');
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function older() {
    const first = messages[0];
    if (!first || sending.current) return;
    sending.current = true;
    setBusy(true);
    loadingOlder.current = true;
    setEarlier(true);
    atBottom.current = false;
    try {
      const result = await api.directMessages(characterId, peer, first.id);
      if (!mounted.current) return;
      const unread = result.messages
        .filter((m) => m.toAccountId === state.character.accountId && !m.readAt)
        .map((m) => m.id);
      if (unread.length) {
        const { readAt } = await api.readDirectMessages(characterId, peer, unread);
        for (const m of result.messages) if (unread.includes(m.id)) m.readAt = readAt;
        await refreshContacts();
      }
      if (!mounted.current) return;
      setMessages((old) => mergeMessages(old, result.messages, true));
      setHasMore(result.hasMore);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : 'Cannot load earlier messages');
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="direct-conversation">
      <div className="conversation-heading">
        <button onClick={back}>Back to friends</button>
        <strong>{contact.friendName}</strong>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {earlier && (
        <button
          disabled={busy}
          onClick={() => {
            loadingOlder.current = false;
            setEarlier(false);
            setMessages([]);
            setHasMore(false);
            atBottom.current = true;
          }}
        >
          Back to latest messages
        </button>
      )}
      {hasMore && (
        <button disabled={busy} onClick={() => void older()}>
          Earlier messages
        </button>
      )}
      <div
        className="chat-history"
        role="log"
        aria-label="Direct messages"
        ref={history}
        onScroll={() => {
          const el = history.current!;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
        }}
      >
        {!messages.length && <p className="muted">Your conversation starts here.</p>}
        {messages.map((m) => (
          <div
            className={`direct-message${m.fromAccountId === state.character.accountId ? ' own' : ''}`}
            key={m.id}
          >
            <strong>{m.fromAccountId === state.character.accountId ? 'You' : m.fromName}</strong>
            <p>{m.body}</p>
            <span className="small muted">
              {new Date(m.sentAt).toLocaleString()}
              {m.fromAccountId === state.character.accountId
                ? m.readAt
                  ? ' · Read'
                  : ' · Sent'
                : ''}
            </span>
          </div>
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="chat-send">
          <input
            ref={input}
            aria-label="Direct message"
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a private message…"
            disabled={busy}
          />
          <button disabled={busy || !draft.trim() || state.connection !== 'open'}>
            Send message
          </button>
        </div>
        <span className="small muted">
          Only you and this friend can read this conversation. {draft.length}/500
        </span>
      </form>
    </div>
  );
}
