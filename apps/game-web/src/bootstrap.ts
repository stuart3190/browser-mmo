// Keep this entry independent of the game/engine imports so startup failures remain recoverable.
void import('./main').catch(() => {
  const root = document.getElementById('ui');
  if (!root) return;
  const panel = document.createElement('section');
  panel.className = 'login';
  panel.setAttribute('role', 'alert');
  const heading = document.createElement('h1');
  heading.className = 'game-title';
  heading.textContent = 'Your adventure could not load';
  const message = document.createElement('p');
  message.textContent = 'Check your connection and try again. Your saved character is safe.';
  const reload = document.createElement('a');
  reload.className = 'startup-reload';
  reload.href = '/';
  reload.textContent = 'Reload game';
  panel.append(heading, message, reload);
  root.replaceChildren(panel);
});
