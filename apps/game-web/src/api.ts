import type { CharacterItems, PlayerCharacter, SessionResponse } from '@mmo/schemas';
import { config } from './config';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Thin typed HTTP client for the game. All authority lives on the server. */
export class ApiClient {
  token: string | null = null;

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : null,
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json()) as T & { error?: { code: string; message: string } };
    if (!res.ok)
      throw new ApiError(json.error?.code ?? 'INTERNAL', json.error?.message ?? res.statusText);
    return json;
  }

  async devLogin(username: string): Promise<SessionResponse> {
    const s = await this.request<SessionResponse>('POST', '/v1/auth/dev-login', {
      username,
      client: 'game_web',
    });
    this.token = s.token;
    return s;
  }
  listCharacters() {
    return this.request<{ characters: PlayerCharacter[] }>('GET', '/v1/characters');
  }
  createCharacter(name: string, classId: string) {
    return this.request<{ character: PlayerCharacter }>('POST', '/v1/characters', {
      name,
      classId,
    });
  }
  characterItems(characterId: string) {
    return this.request<{ items: CharacterItems }>('GET', `/v1/characters/${characterId}/items`);
  }
}
