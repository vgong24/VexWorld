#!/usr/bin/env node
/**
 * Vex Relay Self-Play
 *
 * Drives the public browser build through Chrome DevTools Protocol using only
 * Node.js built-ins. This is an observer/test adapter: it does not become game
 * authority, call a model, publish evidence, or intentionally mutate saves.
 *
 * Runtime-resilience requirements:
 * - initial CDP readiness is retried inside one bounded total window;
 * - the Vextory server is spawned directly through Node (no npm wrapper child);
 * - CDP, browser and server handles are closed/reaped deterministically;
 * - product evidence and harness-cleanup disposition stay separate;
 * - a screenshot never turns an incomplete receipt into PASS.
 *
 * [VXG RealForever]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION_ROOT = resolve(HERE, '..');
const argv = new Set(process.argv.slice(2));
const HEADED = argv.has('--headed');
const KEEP = argv.has('--keep');
const OUT_ARG = process.argv.find((value) => value.startsWith('--out='));
const OUTPUT_ROOT = resolve(
  OUT_ARG
    ? OUT_ARG.slice('--out='.length)
    : join(homedir(), '.vexworld', 'evidence', 'self-play'),
);
const RUN_REF = `selfplay.vexworld.v1.${randomUUID()}`;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() =>
        port ? resolvePort(port) : reject(new Error('Could not allocate a port')),
      );
    });
  });
}

function browserCandidates() {
  return [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    process.platform === 'win32'
      ? join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.platform === 'win32'
      ? join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    process.platform === 'darwin' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : null,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
}

function findBrowser() {
  const found = browserCandidates().find((candidate) => existsSync(candidate));
  if (!found) throw new Error('No supported Chrome/Chromium/Edge executable was found. Set CHROME_BIN or EDGE_BIN.');
  return found;
}

async function waitForJson(url, timeoutMs = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

export async function waitForChildExit(child, timeoutMs = 1500) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise((resolveExit) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      resolveExit(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

export async function terminateChild(child, { termMs = 1500, killMs = 1500 } = {}) {
  if (!child) return { present: false, exited: true, forced: false, exitCode: null, signalCode: null };
  if (child.exitCode !== null || child.signalCode !== null) {
    return { present: true, exited: true, forced: false, exitCode: child.exitCode, signalCode: child.signalCode };
  }

  try { child.kill('SIGTERM'); } catch {}
  if (await waitForChildExit(child, termMs)) {
    return { present: true, exited: true, forced: false, exitCode: child.exitCode, signalCode: child.signalCode };
  }

  try { child.kill('SIGKILL'); } catch {}
  const exited = await waitForChildExit(child, killMs);
  return { present: true, exited, forced: true, exitCode: child.exitCode, signalCode: child.signalCode };
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveSocket, reject) => {
      socket.addEventListener('open', resolveSocket, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
  }

  async close(timeoutMs = 700) {
    const socket = this.socket;
    if (!socket) return true;
    return await new Promise((resolveClose) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveClose(value);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      socket.addEventListener('close', () => finish(true), { once: true });
      try { socket.close(); } catch { finish(false); }
    });
  }
}

async function waitForServerUrl(child, timeoutMs = 20000) {
  const urlPattern = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\]\["']*/g;
  let output = '';
  return await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for VexWorld server URL. Output: ${output.slice(-2000)}`));
    }, timeoutMs);
    const consume = (chunk) => {
      output += chunk.toString();
      const matches = output.match(urlPattern);
      if (matches?.length) {
        cleanup();
        resolveUrl({ url: matches[matches.length - 1].replace(/[),.;]+$/, ''), output });
      }
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`VexWorld server exited before URL discovery (${code}). Output: ${output.slice(-2000)}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout?.off('data', consume);
      child.stderr?.off('data', consume);
      child.off('exit', onExit);
    };
    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);
    child.on('exit', onExit);
  });
}

export async function waitForPageTarget(debugPort, timeoutMs = 15000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    const remaining = timeoutMs - (Date.now() - started);
    try {
      const targets = await waitForJson(
        `http://127.0.0.1:${debugPort}/json/list`,
        Math.max(250, Math.min(1200, remaining)),
      );
      const target = targets.find((entry) => entry.type === 'page' && entry.url.startsWith('http')) ||
        targets.find((entry) => entry.type === 'page');
      if (target?.webSocketDebuggerUrl) return target;
      lastError = new Error('Chrome debug endpoint is reachable but no page target exists yet');
    } catch (error) {
      lastError = error;
    }
    await delay(Math.min(250, Math.max(1, remaining)));
  }
  throw new Error(`Could not find browser page target within ${timeoutMs}ms: ${lastError?.message || 'debug endpoint unavailable'}`);
}

async function waitForCondition(client, expression, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await client.evaluate(expression)) return true; } catch {}
    await delay(150);
  }
  return false;
}

async function screenshot(client, path) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, fromSurface: true,
  });
  const buffer = Buffer.from(result.data, 'base64');
  await writeFile(path, buffer);
  return { path, bytes: buffer.length, sha256: sha256(buffer) };
}

async function press(client, key, code, holdMs = 70) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key.length === 1 ? key : undefined });
  await delay(holdMs);
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}

async function hold(client, key, code, holdMs) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code });
  await delay(holdMs);
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
}

const FORM_PARTY_AND_BEGIN = `(() => {
  const select = document.querySelector('#companion-count');
  if (select) {
    select.value = '3';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const begin = document.querySelector('#begin-button');
  begin?.click();
  return {
    requestedCompanionCount: select?.value || null,
    began: Boolean(begin),
    bodyText: document.body.innerText.slice(0, 5000),
  };
})()`;

async function persistReceipt(receipt, runDir) {
  await writeFile(join(runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(join(OUTPUT_ROOT, 'latest.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  await writeFile(join(OUTPUT_ROOT, 'LATEST_RUN'), `${basename(runDir)}\n`);
}

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const runDir = join(OUTPUT_ROOT, RUN_REF.replaceAll(':', '-'));
  await mkdir(runDir, { recursive: true });
  const profileDir = await mkdtemp(join(tmpdir(), 'vexworld-selfplay-'));
  const browserPath = findBrowser();
  const debugPort = await freePort();
  const serverScript = resolve(VERSION_ROOT, 'src', 'server', 'server.mjs');
  const server = spawn(process.execPath, [serverScript], {
    cwd: VERSION_ROOT,
    env: { ...process.env, VEXWORLD_NO_OPEN: '1', BROWSER: 'none', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser;
  let client;
  const receipt = {
    schemaVersion: 'vexworld.vex-relay-self-play-receipt/v1',
    runRef: RUN_REF,
    sourceVersionRef: 'version.vexworld.v1',
    startedAt: new Date().toISOString(),
    browserPath,
    observations: [],
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    effects: {
      modelCalled: false,
      networkBeyondLoopback: false,
      sourceMutatedByRun: false,
      physicalActuation: false,
      publication: false,
    },
  };

  try {
    const discovered = await waitForServerUrl(server);
    receipt.serverUrl = discovered.url;

    browser = spawn(browserPath, [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-dev-shm-usage',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,960',
      '--force-device-scale-factor=1',
      '--no-sandbox',
      ...(HEADED ? [] : ['--headless=new', '--hide-scrollbars']),
      discovered.url,
    ], { stdio: 'ignore' });

    const target = await waitForPageTarget(debugPort, 15000);
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Log.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 960, deviceScaleFactor: 1, mobile: false,
    });

    const ready = await waitForCondition(
      client,
      `document.readyState === 'complete' && document.body && document.body.innerText.length > 0`,
      20000,
    );
    if (!ready) throw new Error('Page did not become ready');

    receipt.observations.push({ stage: 'ARRIVAL', bodyText: await client.evaluate('document.body.innerText.slice(0, 6000)') });
    receipt.screenshots.push(await screenshot(client, join(runDir, '00-arrival.png')));

    const beginResult = await client.evaluate(FORM_PARTY_AND_BEGIN);
    receipt.observations.push({ stage: 'FORMATION', ...beginResult });
    await delay(1800);
    receipt.screenshots.push(await screenshot(client, join(runDir, '01-world-entry.png')));

    await client.evaluate(`(() => {
      const target = document.querySelector('canvas') || document.querySelector('[tabindex]') || document.body;
      target?.focus?.(); target?.click?.(); return document.activeElement?.tagName || null;
    })()`);

    await hold(client, 'd', 'KeyD', 900);
    receipt.observations.push({ stage: 'MOVE_RIGHT', at: new Date().toISOString() });
    receipt.screenshots.push(await screenshot(client, join(runDir, '02-move-right.png')));

    await press(client, ' ', 'Space', 90);
    await delay(350);
    await press(client, 'j', 'KeyJ', 90);
    await delay(350);
    receipt.observations.push({ stage: 'JUMP_ATTACK', at: new Date().toISOString() });
    receipt.screenshots.push(await screenshot(client, join(runDir, '03-jump-attack.png')));

    await press(client, 'k', 'KeyK', 90);
    await delay(500);
    await press(client, 'e', 'KeyE', 90);
    await delay(900);
    receipt.observations.push({ stage: 'DASH_AND_COMBO_RESPONSE', at: new Date().toISOString() });
    receipt.screenshots.push(await screenshot(client, join(runDir, '04-combat-response.png')));

    await press(client, 't', 'KeyT', 90);
    await delay(700);
    receipt.observations.push({ stage: 'WEATHER_CHANGE', at: new Date().toISOString() });
    receipt.screenshots.push(await screenshot(client, join(runDir, '05-weather.png')));

    await press(client, 'Tab', 'Tab', 90);
    await delay(500);
    receipt.observations.push({
      stage: 'STATUS',
      bodyText: await client.evaluate('document.body.innerText.slice(0, 12000)'),
      elementSummary: await client.evaluate(`(() => ({
        buttons: document.querySelectorAll('button').length,
        canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({ width: canvas.width, height: canvas.height })),
        participantLike: document.querySelectorAll('[data-participant-ref], [class*=participant], [class*=companion], [class*=party]').length,
        visibleDialogs: [...document.querySelectorAll('[role=dialog], dialog')].filter((el) => {
          const rect = el.getBoundingClientRect(); const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        }).length,
      }))()`),
    });
    receipt.screenshots.push(await screenshot(client, join(runDir, '06-status.png')));

    for (const event of client.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        receipt.pageErrors.push(event.params?.exceptionDetails?.text || 'Runtime exception');
      }
      if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
        receipt.consoleErrors.push(event.params.entry.text);
      }
    }

    const distinctHashes = new Set(receipt.screenshots.map((entry) => entry.sha256));
    const statusText = receipt.observations.find((entry) => entry.stage === 'STATUS')?.bodyText || '';
    receipt.assertions = {
      arrivalRendered: receipt.screenshots[0]?.bytes > 1000,
      worldStateChangedVisually: distinctHashes.size >= 4,
      statusRendered: /status|reality|vessel|restoration|party/i.test(statusText),
      noPageErrors: receipt.pageErrors.length === 0,
      noConsoleErrors: receipt.consoleErrors.length === 0,
    };
    receipt.finishedAt = new Date().toISOString();
    receipt.disposition = Object.values(receipt.assertions).every(Boolean)
      ? 'PASS_WITH_HUMAN_FEEL_STILL_UNWITNESSED'
      : 'ATTENTION_REQUIRED';
    receipt.humanGameFeel = 'UNPROVEN';
    await persistReceipt(receipt, runDir);

    const markdown = `# Vex Relay self-play receipt\n\n\`[VXG RealForever]\`\n\n- Run: \`${receipt.runRef}\`\n- Disposition: **${receipt.disposition}**\n- Browser: \`${browserPath}\`\n- Started: ${receipt.startedAt}\n- Finished: ${receipt.finishedAt}\n- Screenshots: ${receipt.screenshots.length}\n- Distinct screenshot hashes: ${distinctHashes.size}\n- Page errors: ${receipt.pageErrors.length}\n- Console errors: ${receipt.consoleErrors.length}\n\nThis scripted evidence proves browser reachability and observable state changes. It does not prove fun, final aesthetic quality, real-model behavior, production networking, or human game feel.\n`;
    await writeFile(join(runDir, 'README.md'), markdown);

    if (receipt.disposition !== 'PASS_WITH_HUMAN_FEEL_STILL_UNWITNESSED') process.exitCode = 1;
  } finally {
    if (!KEEP) {
      const cdpClosed = client ? await client.close() : true;
      const browserResult = await terminateChild(browser);
      const serverResult = await terminateChild(server);
      let profileRemoved = false;
      try {
        await rm(profileDir, { recursive: true, force: true });
        profileRemoved = true;
      } catch {}

      if (receipt.finishedAt) {
        receipt.cleanup = {
          cdpClosed,
          browser: browserResult,
          server: serverResult,
          profileRemoved,
        };
        receipt.cleanupFinishedAt = new Date().toISOString();
        receipt.harnessDisposition =
          cdpClosed && browserResult.exited && serverResult.exited && profileRemoved
            ? 'CLEAN'
            : 'ATTENTION_REQUIRED';
        await persistReceipt(receipt, runDir);
        if (receipt.harnessDisposition !== 'CLEAN' && !process.exitCode) process.exitCode = 3;
      }
    } else if (receipt.finishedAt) {
      receipt.harnessDisposition = 'KEPT_BY_REQUEST';
      await persistReceipt(receipt, runDir);
    }
  }
}

main().catch(async (error) => {
  await mkdir(OUTPUT_ROOT, { recursive: true }).catch(() => {});
  const failure = {
    schemaVersion: 'vexworld.vex-relay-self-play-receipt/v1',
    runRef: RUN_REF,
    disposition: 'FAILED_TO_COMPLETE',
    error: error instanceof Error ? error.stack || error.message : String(error),
    failedAt: new Date().toISOString(),
  };
  await writeFile(join(OUTPUT_ROOT, 'latest.json'), `${JSON.stringify(failure, null, 2)}\n`).catch(() => {});
  console.error(failure.error);
  process.exitCode = 1;
});
