/*
 * Headless smoke test.
 *
 * Type-checking cannot catch a shader that fails to compile or a worklet that
 * fails to register, and those are the two ways this app actually breaks. So
 * the built bundle is loaded in Chromium and driven for real:
 *
 *   1. every GLSL program links and the app mounts without a fatal screen
 *   2. a test pattern pushed through the pipeline comes out lit, with contrast,
 *      and with visible horizontal line structure — i.e. the beam pass ran
 *   3. a real video clip reaches the tube — this is the one that matters most,
 *      because uploading a <video> through texSubImage2D silently writes
 *      nothing while every API call reports success, which once shipped a build
 *      where stills worked perfectly and video was a black screen
 *   4. the DSP worklet registers both processors, passes audio through the
 *      transport, and generates a non-silent noise bed
 *
 *   node scripts/smoke.mjs
 */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');

const MIME = {
  '.webm': 'video/webm',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const fixtures = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'tests', 'fixtures');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname));
  if (path === '/fixture.webm') {
    const body = await readFile(join(fixtures, 'motion.webm'));
    res.writeHead(200, { 'content-type': 'video/webm', 'content-length': body.length });
    res.end(body);
    return;
  }
  if (path === '/' || path.endsWith('/')) path += 'index.html';
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const failures = [];
// Use an explicit binary when one is provided or present, otherwise let
// playwright resolve the browser it installed. Keeps this runnable both in the
// dev container and on a CI runner.
const explicitChromium = process.env.CRTBOX_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  ...(existsSync(explicitChromium) ? { executablePath: explicitChromium } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error' && !/favicon/.test(text) && !/status of 404/.test(text)) {
    failures.push(`console: ${text}`);
  }
});
page.on('response', (res) => {
  if (res.status() >= 400 && !res.url().endsWith('favicon.ico')) {
    failures.push(`http ${res.status()}: ${res.url()}`);
  }
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

/* -------- 1. the app mounted and every shader linked -------- */

if (await page.locator('.fatal').count()) {
  failures.push(`fatal: ${await page.locator('.fatal p').innerText()}`);
}

const gl = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { ok: false, error: 'no canvas in the document' };
  const ctx = canvas.getContext('webgl2');
  return ctx
    ? { ok: true, version: ctx.getParameter(ctx.VERSION) }
    : { ok: false, error: 'no webgl2 context' };
});
if (!gl.ok) failures.push(`gl: ${gl.error}`);

/* -------- 2. drive a test pattern through the whole pipeline -------- */

const picture = await page.evaluate(async () => {
  const out = { lit: 0, contrast: 0, lineStructure: 0, lineSamples: 0, error: null };
  try {
    // Colour bars over a black pedestal with a white block: enough for the
    // mask, the beam profile and the halation pass to all have something to
    // bite on.
    const src = document.createElement('canvas');
    src.width = 640;
    src.height = 480;
    const ctx = src.getContext('2d');
    const bars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    bars.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect((i * src.width) / bars.length, 0, src.width / bars.length + 1, 360);
    });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 360, src.width, 120);
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 385, 160, 70);

    const blob = await new Promise((r) => src.toBlob(r, 'image/png'));
    const file = new File([blob], 'pattern.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

    await new Promise((resolve, reject) => {
      const t0 = performance.now();
      const poll = () => {
        const img = document.querySelector('img');
        if (img && img.naturalWidth > 0) resolve();
        else if (performance.now() - t0 > 10000) reject(new Error('image never decoded'));
        else setTimeout(poll, 60);
      };
      poll();
    });
    // Several frames, so the persistence and burn-in feedback buffers fill.
    await new Promise((r) => setTimeout(r, 900));

    const app = document.querySelector('canvas');
    const probe = document.createElement('canvas');
    probe.width = app.width;
    probe.height = app.height;
    const p = probe.getContext('2d', { willReadFrequently: true });
    p.drawImage(app, 0, 0);
    const { data } = p.getImageData(0, 0, probe.width, probe.height);

    let lit = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (l > 24) lit++;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    out.lit = lit / (probe.width * probe.height);
    out.contrast = (max - min) / 255;

    // Scanlines: a vertical run through a *lit* part of the picture must
    // alternate light and dark. Black areas stay black whatever the beam does,
    // so they are excluded rather than diluting the measurement.
    let deltas = 0;
    let samples = 0;
    for (let x = 8; x < probe.width - 8; x += 7) {
      for (let y = 8; y < probe.height - 9; y++) {
        const a = data[(y * probe.width + x) * 4 + 1];
        const b = data[((y + 1) * probe.width + x) * 4 + 1];
        if (a < 40 && b < 40) continue;
        deltas += Math.abs(a - b);
        samples++;
      }
    }
    out.lineStructure = samples ? deltas / samples / 255 : 0;
    out.lineSamples = samples;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
});

if (picture.error) failures.push(`picture: ${picture.error}`);
if (picture.lit < 0.15) {
  failures.push(`picture: only ${(picture.lit * 100).toFixed(1)}% of the canvas is lit`);
}
if (picture.contrast < 0.4) {
  failures.push(`picture: contrast is only ${picture.contrast.toFixed(2)}`);
}
if (picture.lineStructure < 0.01) {
  failures.push(
    `picture: no horizontal line structure (${picture.lineStructure.toFixed(4)}) — the beam pass did not run`,
  );
}

/* -------- 3. a real video clip reaches the tube -------- */

const videoResult = await page.evaluate(async () => {
  const out = { presented: 0, lit: 0, error: null };
  try {
    const blob = await (await fetch('/fixture.webm')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'motion.webm', { type: 'video/webm' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));

    const video = await new Promise((resolve, reject) => {
      const t0 = performance.now();
      const poll = () => {
        const v = document.querySelector('video');
        if (v && v.readyState >= 2 && v.videoWidth > 0) resolve(v);
        else if (performance.now() - t0 > 20000) reject(new Error('video never decoded'));
        else setTimeout(poll, 80);
      };
      poll();
    });

    document.querySelector('.transport .play')?.click();
    await new Promise((r) => setTimeout(r, 2500));

    // Is the element handing out frames at all?
    const vp = document.createElement('canvas');
    vp.width = 48; vp.height = 36;
    const vg = vp.getContext('2d', { willReadFrequently: true });
    vg.drawImage(video, 0, 0, 48, 36);
    const vd = vg.getImageData(0, 0, 48, 36).data;
    for (let i = 0; i < vd.length; i += 4) {
      out.presented = Math.max(out.presented, (vd[i] + vd[i + 1] + vd[i + 2]) / 3);
    }

    // And did those frames make it through the pipeline onto the tube?
    const app = document.querySelector('canvas');
    const probe = document.createElement('canvas');
    probe.width = app.width; probe.height = app.height;
    const p = probe.getContext('2d', { willReadFrequently: true });
    p.drawImage(app, 0, 0);
    const { data } = p.getImageData(0, 0, probe.width, probe.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 24) lit++;
    }
    out.lit = lit / (probe.width * probe.height);
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
});

if (videoResult.error) failures.push(`video: ${videoResult.error}`);
if (videoResult.presented < 6) {
  failures.push(`video: the element presented no frame (max ${videoResult.presented.toFixed(1)})`);
}
if (videoResult.lit < 0.10) {
  failures.push(
    `video: frames exist but the tube is black (${(videoResult.lit * 100).toFixed(1)}% lit) — the source texture upload is broken`,
  );
}

/* -------- 4. the DSP worklet -------- */

const audio = await page.evaluate(async (workletUrl) => {
  const out = { registered: false, transportRms: 0, noiseRms: 0, error: null };
  try {
    const sr = 48000;
    const ctx = new OfflineAudioContext(2, sr, sr);
    await ctx.audioWorklet.addModule(workletUrl);
    out.registered = true;

    const params = {
      'transport.enabled': true,
      'transport.wowDepth': 0.4,
      'transport.flutterDepth': 0.2,
      'transport.dropoutRate': 0,
      'noise.enabled': true,
      'noise.flybackLevel': -20,
      'noise.flybackSqueal': 0.4,
      'noise.rumble': 0.4,
      'crackle.enabled': false,
      'link.enabled': false,
    };

    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const transport = new AudioWorkletNode(ctx, 'crt-transport', {
      outputChannelCount: [2],
      processorOptions: { params, seed: 3 },
    });
    const noise = new AudioWorkletNode(ctx, 'crt-noise', {
      numberOfInputs: 0,
      outputChannelCount: [2],
      processorOptions: { params, seed: 4, bus: 'acoustic' },
    });
    // Transport on the left, noise bed on the right, so both can be measured
    // from one render.
    const merger = ctx.createChannelMerger(2);
    osc.connect(transport);
    transport.connect(merger, 0, 0);
    noise.connect(merger, 0, 1);
    merger.connect(ctx.destination);
    osc.start();

    const rendered = await ctx.startRendering();
    const rms = (ch) => {
      const d = rendered.getChannelData(ch);
      // Skip past the transport's base delay before measuring.
      const from = Math.floor(sr * 0.2);
      let sum = 0;
      for (let i = from; i < d.length; i++) sum += d[i] * d[i];
      return Math.sqrt(sum / (d.length - from));
    };
    out.transportRms = rms(0);
    out.noiseRms = rms(1);
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  return out;
}, `http://127.0.0.1:${port}/worklets/crtbox-dsp.js`);

if (audio.error) failures.push(`audio: ${audio.error}`);
if (!audio.registered) failures.push('audio: the worklet module did not register');
if (audio.transportRms < 0.05) {
  failures.push(`audio: the transport passed no signal (rms ${audio.transportRms.toExponential(2)})`);
}
if (audio.noiseRms < 1e-4) {
  failures.push(`audio: the noise bed is silent (rms ${audio.noiseRms.toExponential(2)})`);
}

await browser.close();
server.close();

if (failures.length) {
  console.error('SMOKE TEST FAILED');
  for (const f of failures) console.error('  •', f);
  process.exit(1);
}

console.log('smoke test passed');
console.log(`  gl        ${gl.version}`);
console.log(
  `  picture   ${(picture.lit * 100).toFixed(1)}% lit · contrast ${picture.contrast.toFixed(2)} · line structure ${picture.lineStructure.toFixed(3)}`,
);
console.log(
  `  video     element ${videoResult.presented.toFixed(0)} · tube ${(videoResult.lit * 100).toFixed(1)}% lit`,
);
console.log(
  `  audio     transport rms ${audio.transportRms.toFixed(4)} · noise rms ${audio.noiseRms.toFixed(4)}`,
);
