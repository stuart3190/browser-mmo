/* Online-only game: never cache authenticated requests, game state or old releases. */
globalThis.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
