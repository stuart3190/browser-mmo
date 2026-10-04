# Mobile display verification

After selecting a character on a touch-first device, tap **Start / Enter Fullscreen** or
**Continue in browser**. Fullscreen requests landscape if supported. Exiting fullscreen shows a
small button; it never forces re-entry. Browser menu **Install / Add to Home Screen** launches
standalone. An online connection is required; the worker caches no game/account data.

Regression against built candidate assets and the preview API (existing disposable account):

```sh
MMO_TEST_USERNAME=preview_check MMO_TEST_PASSWORD_FILE=/etc/brokenodyssey/check-password \
  node scripts/e2e/mobile-display.cjs
```

Build first with the deployment's `VITE_API_URL`/`VITE_REALTIME_URL`. Set `LIVE=1` to test the
actual deployed assets instead. Override `GAME_URL` and `PLAYWRIGHT_PATH` as needed.
Proof and screenshots go to `/tmp/mobile-proof.json` and `/tmp/mobile-{portrait,landscape,bars,desktop}.png`.
Worst-case Talk/Attack controls are DOM layout fixtures when no enemy/NPC is in range, not fabricated gameplay proof.

Deploy verified main using `sudo bash scripts/deploy-broken-odyssey.sh`.

## Physical Samsung/Android acceptance

- Log in and select a character: no unsolicited fullscreen before the Start tap.
- Tap Start: verify fullscreen; if rotation lock is refused, manually rotate landscape.
- Exit using Android/browser navigation: game continues, small fullscreen button works.
- Continue in browser with address/navigation bars expanded and collapsed: joystick, target,
  abilities, Attack and menu remain visible, touchable and clear of gesture navigation/cutouts.
- Open Bag, Quests, Party and dialogue in portrait and landscape; scroll sheets and close them.
- Install from browser menu, launch from the home-screen icon: standalone chrome-free window,
  expected landscape preference, login works and current online release loads.
- Test both Android gesture and three-button navigation. The OS may retain or temporarily reveal
  system bars even in fullscreen; a web page cannot suppress them permanently.
