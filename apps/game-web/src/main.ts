import { ApiClient } from './api';
import { showLogin } from './login';
import { startGame } from './game/game';

/**
 * Entry point: dev login + character select (DOM), then the 3D world.
 * Session token is kept in memory (sessionStorage for reloads during development only).
 */
const ui = document.getElementById('ui')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const api = new ApiClient();

const { token, character } = await showLogin(ui, api);
api.token = token;
await startGame({ canvas, ui, api, token, character });
