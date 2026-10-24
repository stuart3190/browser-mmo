import { getGameData } from '@mmo/game-data';
import type { PlayerCharacter } from '@mmo/schemas';
import type { ApiClient } from './api';

/** Provider-aware login and character select/create screen. */
export function showLogin(
  root: HTMLElement,
  api: ApiClient,
): Promise<{ token: string; character: PlayerCharacter }> {
  const classes = [...getGameData().classes.values()].filter((c) => c.playable);
  const panel = document.createElement('div');
  panel.className = 'login';
  panel.innerHTML = `
    <div class="eyebrow">A world worth wandering</div>
    <h1 class="game-title">Broken Odyssey</h1>
    <p class="login-intro">Your journey begins in Greenvale. Beyond the village lights, the Northwood stirs. Find your way together.</p>
    <form id="login-form">
      <label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" /></label>
      <label id="password-label" hidden>Password <input name="password" type="password" autocomplete="current-password" maxlength="128" /></label>
      <button type="submit" disabled>Log in</button>
    </form>
    <div id="chars" hidden>
      <div id="char-list"></div>
      <form id="create-form">
        <label>Character name <input name="name" placeholder="Name your adventurer" required minlength="3" maxlength="20" autocomplete="off" /></label>
        <label for="class-choice">Class</label><select id="class-choice" name="classId" aria-describedby="class-hint">${classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        <p id="class-hint" class="class-hint"></p>
        <button type="submit">Begin your adventure</button>
      </form>
    </div>
    <p id="login-error" class="error"></p>`;
  root.appendChild(panel);
  const classSelect = panel.querySelector<HTMLSelectElement>('[name=classId]')!;
  const describeClass = () => {
    panel.querySelector<HTMLElement>('#class-hint')!.textContent =
      classSelect.value === 'class.mage'
        ? 'Ranged fire spells. Keep your distance and move out of enemy warnings. Flame Burst unlocks at level 2.'
        : 'Close-range weapon strikes and sturdy defenses. Battle Strike unlocks at level 2.';
  };
  classSelect.addEventListener('change', describeClass);
  describeClass();
  const err = panel.querySelector<HTMLElement>('#login-error')!;
  let provider = '';
  void api
    .providers()
    .then(({ providers }) => {
      provider = providers.includes('password')
        ? 'password'
        : providers.includes('dev')
          ? 'dev'
          : '';
      panel.querySelector<HTMLElement>('#password-label')!.hidden = provider !== 'password';
      panel.querySelector<HTMLInputElement>('[name=password]')!.required = provider === 'password';
      panel.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled = !provider;
      if (!provider) err.textContent = 'Login is unavailable';
    })
    .catch(() => {
      err.textContent = 'Cannot reach login service';
    });
  const list = panel.querySelector<HTMLElement>('#char-list')!;

  return new Promise((resolve) => {
    let token = '';
    let loginBusy = false;
    let creating = false;
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
      if (loginBusy) return;
      loginBusy = true;
      const button = panel.querySelector<HTMLButtonElement>('#login-form button')!;
      button.disabled = true;
      button.textContent = 'Signing in…';
      err.textContent = '';
      try {
        const username = new FormData(e.target as HTMLFormElement).get('username') as string;
        token = (
          await api.login(
            username,
            new FormData(e.target as HTMLFormElement).get('password') as string,
            provider,
          )
        ).token;
        renderChars((await api.listCharacters()).characters);
        panel.querySelector<HTMLElement>('#login-form')!.hidden = true;
        panel.querySelector<HTMLElement>('#chars')!.hidden = false;
      } catch (ex) {
        err.textContent = (ex as Error).message;
      } finally {
        loginBusy = false;
        button.disabled = false;
        button.textContent = 'Log in';
      }
    };
    panel.querySelector<HTMLFormElement>('#create-form')!.onsubmit = async (e) => {
      e.preventDefault();
      if (creating) return;
      creating = true;
      const button = panel.querySelector<HTMLButtonElement>('#create-form button')!;
      button.disabled = true;
      button.textContent = 'Entering Greenvale…';
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
      } finally {
        creating = false;
        button.disabled = false;
        button.textContent = 'Begin your adventure';
      }
    };
  });
}
