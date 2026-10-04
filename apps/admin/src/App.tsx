import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { getGameData } from '@mmo/game-data';
import type {
  CharacterItems,
  CurrencyBalance,
  MeResponse,
  PlayerAccount,
  PlayerCharacter,
} from '@mmo/schemas';
import type { Permission } from '@mmo/shared';
import { describeLocation, formatCurrency, itemLabel, rarityColor } from '@mmo/ui';
import { AdminApi } from './api';
import type { HistoryRow } from './api';

/**
 * Admin skeleton: login, permission gate, account/character search, inventory and item history
 * inspection. Write actions (grant/revoke/bans) have API endpoints but no UI yet.
 */
export function App() {
  const api = useMemo(() => new AdminApi(), []);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');

  const can = (p: Permission) => me?.permissions.includes(p) ?? false;

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const data = new FormData(e.currentTarget);
      await api.login(data.get('username') as string, data.get('password') as string);
      setMe(await api.me());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!me) {
    return (
      <main>
        <h1>MMO Admin</h1>
        <form onSubmit={onLogin}>
          <input
            name="password"
            type="password"
            placeholder="password"
            autoComplete="current-password"
          />
          <input name="username" placeholder="username" required /> <button>Login</button>
        </form>
        <p className="error">{error}</p>
      </main>
    );
  }
  if (!can('admin.access')) {
    return (
      <main>
        <h1>MMO Admin</h1>
        <p className="error">
          Account “{me.account.username}” (role {me.role}) has no admin access.
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>MMO Admin</h1>
      <p>
        Signed in as <strong>{me.account.username}</strong> · role <code>{me.role}</code>
      </p>
      {can('admin.accounts.read') && <AccountSearch api={api} />}
      {can('admin.characters.read') && (
        <CharacterSearch
          api={api}
          canInventory={can('admin.inventory.read')}
          canHistory={can('admin.items.history.read')}
        />
      )}
      <section>
        <h2>Not yet implemented</h2>
        <p>
          Item grant/revoke UI, bans, marketplace activity, server state. API endpoints for
          grant/revoke exist and are permission-checked.
        </p>
      </section>
    </main>
  );
}

function AccountSearch({ api }: { api: AdminApi }) {
  const [rows, setRows] = useState<PlayerAccount[]>([]);
  const [err, setErr] = useState('');
  return (
    <section>
      <h2>Accounts</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q') as string;
          api.accounts(q).then(
            (r) => setRows(r.accounts),
            (x: Error) => setErr(x.message),
          );
        }}
      >
        <input name="q" placeholder="username contains…" required /> <button>Search</button>
      </form>
      <p className="error">{err}</p>
      <table>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{a.username}</td>
              <td>{a.role}</td>
              <td>{a.status}</td>
              <td>
                <code>{a.id}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CharacterSearch({
  api,
  canInventory,
  canHistory,
}: {
  api: AdminApi;
  canInventory: boolean;
  canHistory: boolean;
}) {
  const gd = getGameData();
  const [rows, setRows] = useState<PlayerCharacter[]>([]);
  const [selected, setSelected] = useState<{
    c: PlayerCharacter;
    items: CharacterItems;
    balances: CurrencyBalance[];
  } | null>(null);
  const [history, setHistory] = useState<{ itemId: string; rows: HistoryRow[] } | null>(null);
  const [err, setErr] = useState('');
  const fail = (x: Error) => setErr(x.message);

  return (
    <section>
      <h2>Characters</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          api
            .characters(new FormData(e.currentTarget).get('q') as string)
            .then((r) => setRows(r.characters), fail);
        }}
      >
        <input name="q" placeholder="name or id" required /> <button>Search</button>
      </form>
      <p className="error">{err}</p>
      <table>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{gd.classes.get(c.classId)?.name}</td>
              <td>lvl {c.level}</td>
              <td>
                {canInventory && (
                  <button
                    className="link"
                    onClick={() =>
                      api.characterItems(c.id).then((r) => setSelected({ c, ...r }), fail)
                    }
                  >
                    inspect inventory
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <>
          <h3>
            {selected.c.name} —{' '}
            {selected.balances
              .map((b) => formatCurrency(gd.currencies.get(b.currencyId)!, b.amount))
              .join(', ')}
          </h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Location</th>
                <th>Instance ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[
                ...Object.values(selected.items.equipment.slots),
                ...selected.items.containers.flatMap((c) => c.items),
              ].map((i) => (
                <tr key={i.instance.id}>
                  <td style={{ color: rarityColor(gd, i.instance.rarityId) }}>{itemLabel(i)}</td>
                  <td>{describeLocation(i.instance.location)}</td>
                  <td>
                    <code>{i.instance.id}</code>
                  </td>
                  <td>
                    {canHistory && (
                      <button
                        className="link"
                        onClick={() =>
                          api
                            .itemHistory(i.instance.id)
                            .then(
                              (r) => setHistory({ itemId: i.instance.id, rows: r.history }),
                              fail,
                            )
                        }
                      >
                        history
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {history && (
        <>
          <h3>
            History of <code>{history.itemId}</code>
          </h3>
          <table>
            <tbody>
              {history.rows.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.occurredAt).toLocaleString()}</td>
                  <td>{h.eventType}</td>
                  <td>
                    <code>{JSON.stringify(h.details)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
