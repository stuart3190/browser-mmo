import type {
  CharacterItems,
  CharacterStats,
  Item,
  MoveItemRequest,
  PlayerCharacter,
  SessionResponse,
  DirectTrade,
  TradeAction,
  MarketplaceListing,
  CreateListingRequest,
  Friendship,
  FriendAction,
  DirectMessage,
  GuildState,
  GuildMessage,
  GuildMemberAction,
} from '@mmo/schemas';
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

  providers() {
    return this.request<{ providers: string[] }>('GET', '/v1/auth/providers');
  }
  async login(username: string, password: string, provider: string): Promise<SessionResponse> {
    const s = await this.request<SessionResponse>(
      'POST',
      `/v1/auth/${provider === 'password' ? 'password-login' : 'dev-login'}`,
      { username, password, client: 'game_web' },
    );
    this.token = s.token;
    return s;
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
  /** Server-authoritative move/equip/unequip. Returns every item whose state changed. */
  moveItem(characterId: string, request: MoveItemRequest) {
    return this.request<{ items: Item[] }>(
      'POST',
      `/v1/characters/${characterId}/items/move`,
      request,
    );
  }
  characterStats(characterId: string) {
    return this.request<{ stats: CharacterStats }>('GET', `/v1/characters/${characterId}/stats`);
  }
  characterItems(characterId: string) {
    return this.request<{ items: CharacterItems }>('GET', `/v1/characters/${characterId}/items`);
  }
  trades(characterId: string) {
    return this.request<{ trades: DirectTrade[] }>('GET', `/v1/characters/${characterId}/trades`);
  }
  createTrade(characterId: string, targetName: string, requestId: string) {
    return this.request<{ trade: DirectTrade }>('POST', `/v1/characters/${characterId}/trades`, {
      targetName,
      requestId,
    });
  }
  tradeAction(characterId: string, tradeId: string, action: TradeAction) {
    return this.request<{ trade: DirectTrade }>(
      'POST',
      `/v1/characters/${characterId}/trades/${tradeId}`,
      action,
    );
  }
  marketListings(templateId = '', after?: MarketplaceListing) {
    const query = new URLSearchParams({ limit: '51' });
    if (templateId) query.set('templateId', templateId);
    if (after) {
      query.set('afterPrice', String(after.price));
      query.set('afterId', after.id);
    }
    return this.request<{ listings: MarketplaceListing[] }>(
      'GET',
      `/v1/marketplace/listings?${query}`,
    );
  }
  myListings() {
    return this.request<{ listings: MarketplaceListing[] }>('GET', '/v1/marketplace/mine');
  }
  marketOffer(id: string) {
    return this.request<{ listing: MarketplaceListing; item: Item }>(
      'GET',
      `/v1/marketplace/listings/${id}`,
    );
  }
  createListing(request: CreateListingRequest) {
    return this.request<{ listing: MarketplaceListing }>(
      'POST',
      '/v1/marketplace/listings',
      request,
    );
  }
  cancelListing(id: string) {
    return this.request<{ listing: MarketplaceListing }>(
      'POST',
      `/v1/marketplace/listings/${id}/cancel`,
    );
  }
  buyListing(characterId: string, id: string, expectedPrice: number) {
    return this.request<{ listing: MarketplaceListing }>(
      'POST',
      `/v1/marketplace/listings/${id}/buy`,
      { characterId, expectedPrice },
    );
  }
  guild(characterId: string) {
    return this.request<GuildState>('GET', `/v1/characters/${characterId}/guild`);
  }
  createGuild(characterId: string, name: string, tag: string) {
    return this.request<{ guildId: string }>('POST', `/v1/characters/${characterId}/guild`, {
      name,
      tag,
    });
  }
  inviteGuild(characterId: string, guildId: string, name: string) {
    return this.request<void>('POST', `/v1/characters/${characterId}/guild/invite`, {
      guildId,
      name,
    });
  }
  respondGuild(characterId: string, guildId: string, accept: boolean) {
    return this.request<void>('POST', `/v1/characters/${characterId}/guild/respond`, {
      guildId,
      accept,
    });
  }
  guildMember(characterId: string, guildId: string, targetId: string, action: GuildMemberAction) {
    return this.request<void>('POST', `/v1/characters/${characterId}/guild/member`, {
      guildId,
      targetId,
      action,
    });
  }
  leaveGuild(characterId: string, guildId: string, disband: boolean) {
    return this.request<void>('POST', `/v1/characters/${characterId}/guild/leave`, {
      guildId,
      disband,
    });
  }
  guildNotice(characterId: string, guildId: string, motd: string) {
    return this.request<void>('POST', `/v1/characters/${characterId}/guild/notice`, {
      guildId,
      motd,
    });
  }
  guildMessages(characterId: string, guildId: string) {
    return this.request<{ messages: GuildMessage[] }>(
      'GET',
      `/v1/characters/${characterId}/guild/messages?guildId=${encodeURIComponent(guildId)}`,
    );
  }
  sendGuildMessage(characterId: string, guildId: string, id: string, body: string) {
    return this.request<{ message: GuildMessage }>(
      'POST',
      `/v1/characters/${characterId}/guild/messages`,
      { guildId, id, body },
    );
  }
  friends(characterId: string) {
    return this.request<{ friends: Friendship[] }>('GET', `/v1/characters/${characterId}/social`);
  }
  requestFriend(characterId: string, name: string) {
    return this.request<{ friend: Friendship }>('POST', `/v1/characters/${characterId}/social`, {
      name,
    });
  }
  friendAction(characterId: string, peer: string, action: FriendAction) {
    return this.request<void>('POST', `/v1/characters/${characterId}/social/${peer}`, { action });
  }
  directMessages(characterId: string, peer: string, before?: string) {
    return this.request<{ messages: DirectMessage[]; hasMore: boolean }>(
      'GET',
      `/v1/characters/${characterId}/social/${peer}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    );
  }
  sendDirectMessage(characterId: string, peer: string, id: string, body: string) {
    return this.request<{ message: DirectMessage }>(
      'POST',
      `/v1/characters/${characterId}/social/${peer}/messages`,
      { id, body },
    );
  }
  readDirectMessages(characterId: string, peer: string, ids: string[]) {
    return this.request<{ readAt: string }>(
      'POST',
      `/v1/characters/${characterId}/social/${peer}/messages/read`,
      { ids },
    );
  }
}
