/** Fullscreen is requested only by the Start/re-entry click, never by page load. */
export async function prepareMobileDisplay(): Promise<void> {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const host = document.createElement('div');
  host.className = 'mobile-display';
  document.body.append(host);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const supported = document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  let started = standalone || !!document.fullscreenElement;
  let busy = false;
  let message = '';
  let enter!: () => void;
  const ready = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const render = () => {
    host.replaceChildren();
    if (document.fullscreenElement) return;
    const panel = document.createElement('div');
    panel.className = started ? 'fullscreen-return' : 'fullscreen-start panel';
    if (!started) {
      const title = document.createElement('h2');
      title.textContent = 'Enter Broken Odyssey';
      const hint = document.createElement('p');
      hint.textContent =
        'Play landscape for more room. Fullscreen hides browser bars when supported. You can also install from your browser menu / Add to Home Screen.';
      panel.append(title, hint);
    }
    if (supported) {
      const button = document.createElement('button');
      button.textContent = started ? '⛶ Fullscreen' : 'Start / Enter Fullscreen';
      button.dataset.testid = 'enter-fullscreen';
      button.disabled = busy;
      button.onclick = async () => {
        busy = true;
        // Call before any await to preserve transient user activation.
        try {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (value: string) => Promise<void>;
          };
          try {
            await orientation?.lock?.('landscape');
          } catch {
            /* Rotation is optional. */
          }
          message = '';
        } catch {
          message = 'Fullscreen unavailable. Rotate your phone or use Add to Home Screen.';
        }
        busy = false;
        started = true;
        enter();
        render();
      };
      panel.append(button);
    }
    if (!started) {
      const skip = document.createElement('button');
      skip.textContent = supported ? 'Continue in browser' : 'Start in browser';
      skip.dataset.testid = 'continue-browser';
      skip.onclick = () => {
        started = true;
        enter();
        render();
      };
      panel.append(skip);
    }
    if (message) {
      const note = document.createElement('button');
      note.className = 'fullscreen-note';
      note.textContent = message + ' Dismiss';
      note.onclick = () => {
        message = '';
        render();
      };
      panel.append(note);
    }
    host.append(panel);
  };
  document.addEventListener('fullscreenchange', render);
  render();
  if (started) enter();
  await ready;
}
