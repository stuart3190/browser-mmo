import type {
  CharacterItems,
  CurrencyBalance,
  MeResponse,
  PlayerAccount,
  PlayerCharacter,
  SessionResponse,
} from '@mmo/schemas';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export interface HistoryRow {
  id: string;
  eventType: string;
  actorAccountId: string | null;
  fromOwnerAccountId: string | null;
  toOwnerAccountId: string | null;
  toLocation: unknown;
  details: Record<string, unknown>;
  occurredAt: string;
}

export class AdminApi {
  constructor(public token: string | null = null) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : null,
    });
    const json = (await res.json()) as T & { error?: { code: string; message: string } };
    if (!res.ok) throw new Error(`${json.error?.code ?? res.status}: ${json.error?.message ?? ''}`);
    return json;
  }

  async login(username: string, password: string) {
    const { providers } = await this.req<{ providers: string[] }>('GET', '/v1/auth/providers');
    const provider = providers.includes('password') ? 'password-login' : 'dev-login';
    const s = await this.req<SessionResponse>('POST', `/v1/auth/${provider}`, {
      password,
      username,
      client: 'admin',
    });
    this.token = s.token;
    return s;
  }
  me = () => this.req<MeResponse>('GET', '/v1/me');
  accounts = (q: string) =>
    this.req<{ accounts: PlayerAccount[] }>('GET', `/v1/admin/accounts?q=${encodeURIComponent(q)}`);
  characters = (q: string) =>
    this.req<{ characters: PlayerCharacter[] }>(
      'GET',
      `/v1/admin/characters?q=${encodeURIComponent(q)}`,
    );
  characterItems = (id: string) =>
    this.req<{ items: CharacterItems; balances: CurrencyBalance[] }>(
      'GET',
      `/v1/admin/characters/${id}/items`,
    );
  itemHistory = (id: string) =>
    this.req<{ history: HistoryRow[] }>('GET', `/v1/admin/items/${id}/history`);
}
