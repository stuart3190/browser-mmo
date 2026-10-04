/* eslint-disable */
// Real production build, sustained RAF/CDP sampling. Software-rendered results are NOT phone GPU results.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const WEB = process.env.WEB_URL || 'http://127.0.0.1:4173';
const API = process.env.API_URL || 'http://127.0.0.1:4400';
const OUT = process.env.PERF_DIR || '/tmp/mmo-browser-performance';
const SECONDS = Number(process.env.PERF_SECONDS || 120);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  try {
    for (const profile of [
      { name: 'desktop', width: 1400, height: 900, touch: false },
      { name: 'phone-portrait', width: 390, height: 844, touch: true },
      { name: 'phone-landscape', width: 844, height: 390, touch: true },
    ]) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        hasTouch: profile.touch,
        isMobile: profile.touch,
        deviceScaleFactor: profile.touch ? 2 : 1,
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Network.enable');
      let bytes = 0,
        wsBytes = 0;
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
      cdp.on(
        'Network.webSocketFrameReceived',
        (e) => (wsBytes += Buffer.byteLength(e.response.payloadData)),
      );
      await page.addInitScript(() => {
        window.__perf = { frames: [], gaps: 0, longTasks: [], start: performance.now() };
        let last = performance.now();
        function frame(now) {
          const delta = now - last;
          last = now;
          window.__perf.frames.push(delta);
          if (delta > 50) window.__perf.gaps++;
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        new PerformanceObserver((list) =>
          window.__perf.longTasks.push(...list.getEntries().map((e) => e.duration)),
        ).observe({ type: 'longtask', buffered: true });
      });
      const start = Date.now();
      await page.goto(WEB, { waitUntil: 'networkidle' });
      const loginReadyMs = Date.now() - start;
      const suffix = String(Date.now());
      const username = 'perf_' + suffix;
      await page.locator('[name=username]').fill(username);
      await page.locator('#login-form button').click();
      await page
        .locator('[name=name]')
        .fill('Perf' + suffix.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]));
      await page.locator('#create-form button').click();
      await page.locator('canvas').waitFor();
      // Wait for the live HUD, then warm up compilation before measuring sustained rendering.
      await sleep(10000);
      const startupMs = Date.now() - start;
      const renderer = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
          debugHookExposed: '__mmo' in window,
          userAgent: navigator.userAgent,
        };
      });
      await page.evaluate(() => {
        window.__perf.frames = [];
        window.__perf.longTasks = [];
        window.__perf.gaps = 0;
      });
      const heap = [],
        task = [];
      const initialWs = wsBytes;
      for (let i = 0; i < SECONDS / 5; i++) {
        // Alternate short movement bursts and rest, exercising networking, prediction and UI updates.
        await page.keyboard.down(i % 2 ? 'a' : 'd');
        await sleep(300);
        await page.keyboard.up(i % 2 ? 'a' : 'd');
        await sleep(4700);
        const metrics = (await cdp.send('Performance.getMetrics')).metrics;
        heap.push(metrics.find((m) => m.name === 'JSHeapUsedSize')?.value || 0);
        task.push(metrics.find((m) => m.name === 'TaskDuration')?.value || 0);
      }
      const measured = await page.evaluate(() => window.__perf);
      const sorted = measured.frames.sort((a, b) => a - b);
      const percentile = (p) => sorted[Math.floor(sorted.length * p)] || 0;
      await page.screenshot({ path: path.join(OUT, profile.name + '.png') });
      const result = {
        profile,
        renderer,
        loginReadyMs,
        startupMsIncluding10sWarmup: startupMs,
        seconds: SECONDS,
        frameSamples: sorted.length,
        frameP50Ms: percentile(0.5),
        frameP95Ms: percentile(0.95),
        frameP99Ms: percentile(0.99),
        framesOver50ms: measured.gaps,
        heapStart: heap[0],
        heapEnd: heap.at(-1),
        heapMax: Math.max(...heap),
        taskSeconds: task.at(-1) - task[0],
        startupAndAssetBytes: bytes,
        realtimeBytes: wsBytes - initialWs,
        errors,
      };
      results.push(result);
      console.log(JSON.stringify(result));
      await context.close();
    }
    fs.writeFileSync(
      path.join(OUT, 'results.json'),
      JSON.stringify(
        { at: new Date().toISOString(), browser: browser.version(), results },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
