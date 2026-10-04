import { prepareMobileDisplay } from './mobile-display';
import { ApiClient } from './api';
import { showLogin } from './login';
import { startGame } from './game/game';

/**
 * Entry point: dev login + character select (DOM), then the 3D world.
 * Session token is kept in memory (sessionStorage for reloads during development only).
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    /* Installation is optional. */
  });
}

const ui = document.getElementById('ui')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const api = new ApiClient();

const { token, character } = await showLogin(ui, api);
api.token = token;
await prepareMobileDisplay();
await startGame({ canvas, ui, api, token, character });
