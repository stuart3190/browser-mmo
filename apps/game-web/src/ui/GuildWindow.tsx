import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuildMemberAction, GuildMessage, GuildState } from '@mmo/schemas';
import { useGame } from './context';
import { Window, Tabs } from './Window';

export function GuildWindow() {
  const { api, state } = useGame(),
    characterId = state.character.id,
    open = state.open.has('guild');
  const [data, setData] = useState<GuildState | null>(null),
    [messages, setMessages] = useState<GuildMessage[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [name, setName] = useState(''),
    [tag, setTag] = useState(''),
    [invite, setInvite] = useState(''),
    [body, setBody] = useState('');
  const [tab, setTab] = useState<'chat' | 'members' | 'manage'>('chat');
  const [confirm, setConfirm] = useState<{ label: string; work: () => Promise<unknown> } | null>(
    null,
  );
  const running = useRef(false),
    generation = useRef(0),
    mounted = useRef(true),
    history = useRef<HTMLDivElement>(null),
    atBottom = useRef(true),
    pendingMessage = useRef<{ id: string; body: string } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const version = generation.current;
    const next = await api.guild(characterId);
    const history = next.guild
      ? await api.guildMessages(characterId, next.guild.id)
      : { messages: [] };
    if (!mounted.current || version !== generation.current) return;
    setData(next);
    setMessages(history.messages);
  }, [api, characterId]);
  useEffect(() => {
    if (!open || state.connection !== 'open') return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!running.current)
        try {
          await refresh();
        } catch (e) {
          if (!stopped) {
            setError(e instanceof Error ? e.message : 'Cannot refresh guild');
            setData(null);
            setMessages([]);
          }
        }
      if (!stopped) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [open, state.connection === 'open', refresh]);
  useEffect(() => {
    if (atBottom.current && history.current)
      history.current.scrollTop = history.current.scrollHeight;
  }, [messages, tab, open]);
  const run = async (work: () => Promise<unknown>, success = '') => {
    if (running.current) return;
    running.current = true;
    generation.current++;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      setConfirm(null);
      await refresh();
      if (mounted.current) setNotice(success);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Guild action failed');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const guild = data?.guild,
    me = data?.members.find((m) => m.characterId === characterId),
    leader = me?.role === 'leader',
    officer = leader || me?.role === 'officer';
  const memberAction = (targetId: string, action: GuildMemberAction, label: string) =>
    setConfirm({ label, work: () => api.guildMember(characterId, guild!.id, targetId, action) });
  useEffect(() => {
    setBody('');
    atBottom.current = true;
    pendingMessage.current = null;
    setConfirm(null);
    setTab('chat');
  }, [guild?.id]);
  const send = () => {
    if (!guild) return;
    const text = body.trim();
    if (!text) return;
    if (pendingMessage.current?.body !== text)
      pendingMessage.current = { id: crypto.randomUUID(), body: text };
    const message = pendingMessage.current;
    void run(async () => {
      await api.sendGuildMessage(characterId, guild.id, message.id, message.body);
      atBottom.current = true;
      pendingMessage.current = null;
      setBody('');
    });
  };
  return (
    <Window id="guild" title="Guild">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {confirm && (
        <div className="guild-confirm" role="group" aria-label="Confirm guild change">
          <p>{confirm.label}</p>
          <button disabled={busy} onClick={() => void run(confirm.work)}>
            Confirm guild change
          </button>
          <button disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      )}
      {!data ? (
        <p className="muted">
          {error ? 'Guild unavailable. Reconnecting…' : 'Loading your guild…'}
        </p>
      ) : !guild ? (
        <>
          <p className="muted">
            Build a company for the long road. Each character can join one guild, with up to 50
            members. Invitations require your acceptance.
          </p>
          {data.invitations.map((invitation) => (
            <article className="guild-invitation" key={invitation.guildId}>
              <strong>
                {invitation.name} [{invitation.tag}]
              </strong>
              <p>
                Invited you to join · expires {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() => api.respondGuild(characterId, invitation.guildId, true))
                }
              >
                Join {invitation.name}
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void run(() => api.respondGuild(characterId, invitation.guildId, false))
                }
              >
                Decline {invitation.name}
              </button>
            </article>
          ))}
          <form
            className="guild-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api.createGuild(characterId, name, tag));
            }}
          >
            <h3>Found a guild</h3>
            <label>
              Guild name
              <input
                required
                minLength={3}
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Guild tag
              <input
                required
                minLength={2}
                maxLength={5}
                pattern="[A-Za-z0-9]{2,5}"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </label>
            <p className="small muted">
              Name: 3–32 letters, numbers, spaces, apostrophes or hyphens. Tag: 2–5 letters or
              numbers.
            </p>
            <button disabled={busy}>Found guild</button>
          </form>
        </>
      ) : (
        <>
          <h3 className="guild-title">
            {guild.name} <span className="muted">[{guild.tag}]</span>
          </h3>
          <p className="guild-notice">{guild.motd || 'No guild notice yet.'}</p>
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { id: 'chat', label: 'Guild chat' },
              { id: 'members', label: `Members (${data.members.length}/50)` },
              { id: 'manage', label: 'Guild settings' },
            ]}
          />
          {tab === 'chat' && (
            <>
              <div
                className="guild-messages"
                ref={history}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
                }}
                role="log"
                aria-label="Guild messages"
                aria-live="polite"
              >
                {!messages.length && (
                  <p className="muted">Your shared adventure starts here. Say hello.</p>
                )}
                {messages.map((m) => (
                  <p key={m.id}>
                    <strong>{m.fromName}</strong>{' '}
                    <time dateTime={m.sentAt}>
                      {new Date(m.sentAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <span>{m.body}</span>
                  </p>
                ))}
              </div>
              <form
                className="guild-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <label>
                  Guild message
                  <textarea
                    required
                    maxLength={500}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </label>
                <button disabled={busy || !body.trim()}>Send to guild</button>
                <span className="small muted">Latest 100 messages · current members only</span>
              </form>
            </>
          )}
          {tab === 'members' && (
            <div className="guild-roster">
              {data.members.map((m) => (
                <article key={m.characterId}>
                  <div>
                    <strong>{m.name}</strong>
                    <span>
                      {m.role} · Level {m.level} {m.classId === 'class.mage' ? 'Mage' : 'Warrior'}
                    </span>
                  </div>
                  {leader && m.characterId !== characterId && (
                    <div className="guild-member-actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            api.guildMember(
                              characterId,
                              guild.id,
                              m.characterId,
                              m.role === 'officer' ? 'demote' : 'promote',
                            ),
                          )
                        }
                      >
                        {m.role === 'officer' ? 'Demote' : 'Promote'} {m.name}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          memberAction(
                            m.characterId,
                            'transfer',
                            `Make ${m.name} leader? You will become a member.`,
                          )
                        }
                      >
                        Make leader {m.name}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          memberAction(m.characterId, 'remove', `Remove ${m.name} from the guild?`)
                        }
                      >
                        Remove {m.name}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === 'manage' && (
            <>
              {officer && (
                <>
                  <form
                    className="guild-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api.inviteGuild(characterId, guild!.id, invite);
                        setInvite('');
                      }, 'Guild invitation sent');
                    }}
                  >
                    <label>
                      Invite character
                      <input
                        required
                        minLength={3}
                        maxLength={20}
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Send guild invitation</button>
                  </form>
                  <form
                    className="guild-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = String(new FormData(e.currentTarget).get('motd') ?? '');
                      void run(
                        () => api.guildNotice(characterId, guild!.id, text),
                        'Guild notice saved',
                      );
                    }}
                  >
                    <label>
                      Guild notice
                      <textarea
                        name="motd"
                        maxLength={500}
                        defaultValue={guild.motd}
                        key={guild.id}
                      />
                    </label>
                    <button disabled={busy}>Save guild notice</button>
                  </form>
                </>
              )}
              <p className="small muted">
                Leaders manage membership and ranks. Officers can invite and edit the notice. Guild
                membership follows this character across regions and logins.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    label: leader
                      ? `Disband ${guild.name}? All members will leave and invitations will close.`
                      : `Leave ${guild.name}? You will need a new invitation to return.`,
                    work: () => api.leaveGuild(characterId, guild!.id, !!leader),
                  })
                }
              >
                {leader ? 'Disband guild' : 'Leave guild'}
              </button>
            </>
          )}
        </>
      )}
    </Window>
  );
}
