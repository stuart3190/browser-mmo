import { getGameData } from '@mmo/game-data';
import type { PlayerCharacter } from '@mmo/schemas';
import type { ApiClient } from './api';

/** Minimal dev login + character select/create screen. Deliberately plain. */
export function showLogin(
  root: HTMLElement,
  api: ApiClient,
): Promise<{ token: string; character: PlayerCharacter }> {
  const classes = [...getGameData().classes.values()].filter((c) => c.playable);
  const panel = document.createElement('div');
  panel.className = 'login';
  panel.innerHTML = `
    <h2 style="margin-top:0">Greenvale (dev)</h2>
    <form id="login-form">
      <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" /></label>
      <button type="submit">Dev login</button>
    </form>
    <div id="chars" hidden>
      <div id="char-list"></div>
      <form id="create-form">
        <input name="name" placeholder="New character name" required minlength="3" maxlength="20" />
        <select name="classId">${classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        <button type="submit">Create character</button>
      </form>
    </div>
    <p id="login-error" class="error"></p>`;
  root.appendChild(panel);
  const err = panel.querySelector<HTMLElement>('#login-error')!;
  const list = panel.querySelector<HTMLElement>('#char-list')!;

  return new Promise((resolve) => {
    let token = '';
    const choose = (c: PlayerCharacter) => {
      panel.remove();
      resolve({ token, character: c });
    };
    const renderChars = (chars: PlayerCharacter[]) => {
      list.innerHTML = '';
      for (const c of chars) {
        const b = document.createElement('button');
        b.textContent = `Play ${c.name} (level ${c.level} ${getGameData().classes.get(c.classId)?.name ?? c.classId})`;
        b.onclick = () => choose(c);
        list.appendChild(b);
      }
    };
    panel.querySelector<HTMLFormElement>('#login-form')!.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const username = new FormData(e.target as HTMLFormElement).get('username') as string;
        token = (await api.devLogin(username)).token;
        renderChars((await api.listCharacters()).characters);
        panel.querySelector<HTMLElement>('#login-form')!.hidden = true;
        panel.querySelector<HTMLElement>('#chars')!.hidden = false;
      } catch (ex) {
        err.textContent = (ex as Error).message;
      }
    };
    panel.querySelector<HTMLFormElement>('#create-form')!.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      try {
        const fd = new FormData(e.target as HTMLFormElement);
        const { character } = await api.createCharacter(
          fd.get('name') as string,
          fd.get('classId') as string,
        );
        choose(character);
      } catch (ex) {
        err.textContent = (ex as Error).message;
      }
    };
  });
}
