# Physical Android acceptance

Not yet executed. Viewport emulation and SwiftShader are not physical-device evidence.
This VPS currently exposes no Android USB device or browser-debug target.

## One owner action: attach a real Android Chrome debugging target

Connect an unlocked Android phone by USB to your workstation, enable USB debugging, and accept
its authorization prompt. With Android platform-tools installed, run these commands on that
workstation (replace `VPS` with the SSH host used for this server):

```bash
adb devices -l
adb forward tcp:9222 localabstract:chrome_devtools_remote
adb reverse tcp:4443 tcp:4443
ssh -N -L 4443:127.0.0.1:4443 -R 127.0.0.1:9222:127.0.0.1:9222 root@VPS
```

Open Chrome on the phone and leave the USB authorization and SSH tunnel active. Tell the agent
that the target is ready. Server-side discovery is then `http://127.0.0.1:9222/json/version`;
connect with Playwright/CDP to that endpoint. Keep debugging bound to loopback, never the public
interface. The reverse port gives the phone access to the isolated qualification endpoint.
For the local test certificate, install/trust the qualification certificate on the test device
or use a provisioned public-CA staging endpoint. Do not disable TLS verification in the product.
Do not send passwords, tokens or a full browser profile in chat.

## Acceptance record

Record phone model, SoC/GPU, RAM, Android/Chrome versions, viewport/DPR, renderer, candidate SHA,
network, ambient temperature, battery state and all workload parameters. Use at least a lower-end
and a midrange phone before claiming broad Android support.

- [ ] Cold and warm startup on Wi-Fi and mobile data: requests, compressed bytes, time to login,
      time to playable scene; no errors or development debug hooks.
- [ ] Twenty to thirty minutes of combat/movement: frame-time p50/p95/p99, long tasks, JS/native/GPU
      memory where accessible, thermal throttling, battery consumption and crash/context loss.
- [ ] Agreed playability target: sustained 30 FPS or better (p95 frame time ≤ 33.3 ms), with no
      recurring control stalls; record failures rather than lowering the gate after measurement.
- [ ] Portrait and landscape: readable HUD, quest/dialogue/inventory/vault overlays, no obscured
      critical controls; safe-area, browser toolbar, keyboard and orientation transitions.
- [ ] Simultaneous joystick + camera drag + targeting/ability taps, cancellation and thumb reach.
- [ ] Repeated hits: server health = received vitals = HUD. Death, respawn, cooldowns, reconnect,
      background/resume and deliberate missed-message reconciliation retain authority.
- [ ] Wi-Fi/mobile handover and packet loss; session expiry/revocation causes explicit disconnect.
- [ ] Current admission-cap player density and wolf population; measure network traffic and heat.
- [ ] Hardware WebGL2 and supported WebGPU path, failed initialization fallback, context recovery.

A single phone passes only that device/configuration. Record evidence separately from desktop
software-renderer measurements. No physical FPS, battery, thermal or touch pass is claimed now.
