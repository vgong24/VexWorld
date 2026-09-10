#!/usr/bin/env node
/**
 * Vex Relay Self-Play
 *
 * Drives the public browser build through Chrome DevTools Protocol using only
 * Node.js built-ins. It starts the local Vextory server, enters the Garden of
 * Arrival, attempts to form the largest local party, performs a short movement
 * and combat rehearsal, opens Status, and records screenshots plus a receipt.
 *
 * This is an observer/test adapter. It does not become game authority, mutate
 * saves intentionally, call a model, or publish generated evidence.
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
      ? join(
          process.env.PROGRAMFILES || 'C:\\Program Files',
          'Google',
          'Chrome',
          'Application',
          'chrome.exe',
        )
      : null,
    process.platform === 'win32'
      ? join(
          process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
          'Microsoft',
          'Edge',
          'Application',
          'msedge.exe',
        )
      : null,
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : null,
    process.platform === 'darwin'
      ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
      : null,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
}

function findBrowser() {
  const found = browserCandidates().find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      'No supported Chrome/Chromium/Edge executable was found. Set CHROME_BIN or EDGE_BIN.',
    );
  }
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
  throw new Error(
    `Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`,
  );
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
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    }
    return result.result?.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}

async function waitForServerUrl(child, timeoutMs = 20000) {
  const urlPattern = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\]\["']*/g;
  let output = '';
  return await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Timed out waiting for VexWorld server URL. Output: ${output.slice(-2000)}`,
        ),
      );
    }, timeoutMs);

    const consume = (chunk) => {
      output += chunk.toString();
      const matches = output.match(urlPattern);
      if (matches?.length) {
        cleanup();
        resolveUrl({
          url: matches[matches.length - 1].replace(/[),.;]+$/, ''),
          output,
        });
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(
        new Error(
          `VexWorld server exited before URL discovery (${code}). Output: ${output.slice(-2000)}`,
        ),
      );
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

async function waitForCondition(client, expression, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await client.evaluate(expression)) return true;
    } catch {}
    await delay(150);
  }
  return false;
}

async function screenshot(client, path) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const buffer = Buffer.from(result.data, 'base64');
  await writeFile(path, buffer);
  return { path, bytes: buffer.length, sha256: sha256(buffer) };
}

async function press(client, key, code, holdMs = 70) {
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    text: key.length === 1 ? key : undefined,
  });
  await delay(holdMs);
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
  });
}

async function hold(client, key, code, holdMs) {
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
  });
  await delay(holdMs);
  await client.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
  });
}

const FORM_PARTY_AND_BEGIN = `(() => {
  const norm = (value) => String(value || '').trim().toLowerCase();
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const labelText = (el) => {
    const label = el.id
      ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]')
      : null;
    return norm(
      (label?.innerText || '') + ' ' +
      (el.closest('label')?.innerText || '') + ' ' +
      (el.name || '') + ' ' +
      (el.value || '') + ' ' +
      (el.getAttribute('aria-label') || '')
    );
  };

  for (const select of document.querySelectorAll('select')) {
    const text = labelText(select);
    if (text.includes('companion') || text.includes('party')) {
      const scored = [...select.options]
        .map((option) => ({
          option,
          score: Number.parseInt(option.value || option.textContent, 10),
        }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((a, b) => b.score - a.score);
      if (scored.length) {
        select.value = scored[0].option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  const choices = [...document.querySelectorAll(
    'button,input[type=radio],input[type=checkbox],[role=button]'
  )].filter(visible);
  const partyChoices = choices.filter((el) => {
    const text = norm((el.innerText || '') + ' ' + labelText(el));
    return (
      (text.includes('3') || text.includes('three') || text.includes('full')) &&
      (text.includes('companion') || text.includes('party'))
    );
  });
  partyChoices.at(-1)?.click();

  const begin = [...document.querySelectorAll(
    'button,[role=button],input[type=submit]'
  )]
    .filter(visible)
    .find((el) =>
      /begin|start|enter|journey|continue/.test(
        norm(el.innerText || el.value || el.getAttribute('aria-label'))
      )
    );
  begin?.click();

  return {
    partyChoiceCount: partyChoices.length,
    began: Boolean(begin),
    bodyText: document.body.innerText.slice(0, 5000),
  };
})()`;

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const runDir = join(OUTPUT_ROOT, RUN_REF.replaceAll(':', '-'));
  await mkdir(runDir, { recursive: true });
  const profileDir = await mkdtemp(join(tmpdir(), 'vexworld-selfplay-'));
  const browserPath = findBrowser();
  const debugPort = await freePort();
  const server = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'play'],
    {
      cwd: VERSION_ROOT,
      env: {
        ...process.env,
        VEXWORLD_NO_OPEN: '1',
        BROWSER: 'none',
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

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

    const args = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,960',
      '--force-device-scale-factor=1',
      '--no-sandbox',
      ...(HEADED ? [] : ['--headless=new', '--hide-scrollbars']),
      discovered.url,
    ];
    browser = spawn(browserPath, args, { stdio: 'ignore' });

    let target = null;
    const targetStarted = Date.now();
    while (!target && Date.now() - targetStarted < 15000) {
      const targets = await waitForJson(
        `http://127.0.0.1:${debugPort}/json/list`,
        3000,
      );
      target =
        targets.find(
          (entry) => entry.type === 'page' && entry.url.startsWith('http'),
        ) || targets.find((entry) => entry.type === 'page');
      if (!target) await delay(200);
    }
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('Could not find browser page target');
    }

    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Log.enable'),
      client.send('Network.enable'),
    ]);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 960,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const ready = await waitForCondition(
      client,
      `document.readyState === 'complete' && document.body && document.body.innerText.length > 0`,
      20000,
    );
    if (!ready) throw new Error('Page did not become ready');

    receipt.observations.push({
      stage: 'ARRIVAL',
      bodyText: await client.evaluate('document.body.innerText.slice(0, 6000)'),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '00-arrival.png')),
    );

    const beginResult = await client.evaluate(FORM_PARTY_AND_BEGIN);
    receipt.observations.push({ stage: 'FORMATION', ...beginResult });
    await delay(1800);
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '01-world-entry.png')),
    );

    await client.evaluate(`(() => {
      const target = document.querySelector('canvas') ||
        document.querySelector('[tabindex]') || document.body;
      target?.focus?.();
      target?.click?.();
      return document.activeElement?.tagName || null;
    })()`);

    await hold(client, 'd', 'KeyD', 900);
    receipt.observations.push({
      stage: 'MOVE_RIGHT',
      at: new Date().toISOString(),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '02-move-right.png')),
    );

    await press(client, ' ', 'Space', 90);
    await delay(350);
    await press(client, 'j', 'KeyJ', 90);
    await delay(350);
    receipt.observations.push({
      stage: 'JUMP_ATTACK',
      at: new Date().toISOString(),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '03-jump-attack.png')),
    );

    await press(client, 'k', 'KeyK', 90);
    await delay(500);
    await press(client, 'e', 'KeyE', 90);
    await delay(900);
    receipt.observations.push({
      stage: 'DASH_AND_COMBO_RESPONSE',
      at: new Date().toISOString(),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '04-combat-response.png')),
    );

    await press(client, 't', 'KeyT', 90);
    await delay(700);
    receipt.observations.push({
      stage: 'WEATHER_CHANGE',
      at: new Date().toISOString(),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '05-weather.png')),
    );

    await press(client, 'Tab', 'Tab', 90);
    await delay(500);
    receipt.observations.push({
      stage: 'STATUS',
      bodyText: await client.evaluate('document.body.innerText.slice(0, 12000)'),
      elementSummary: await client.evaluate(`(() => ({
        buttons: document.querySelectorAll('button').length,
        canvases: [...document.querySelectorAll('canvas')].map((canvas) => ({
          width: canvas.width,
          height: canvas.height,
        })),
        participantLike: document.querySelectorAll(
          '[data-participant-ref], [class*=participant], [class*=companion], [class*=party]'
        ).length,
        visibleDialogs: [...document.querySelectorAll('[role=dialog], dialog')]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 &&
              style.display !== 'none' && style.visibility !== 'hidden';
          }).length,
      }))()`),
    });
    receipt.screenshots.push(
      await screenshot(client, join(runDir, '06-status.png')),
    );

    for (const event of client.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        receipt.pageErrors.push(
          event.params?.exceptionDetails?.text || 'Runtime exception',
        );
      }
      if (
        event.method === 'Log.entryAdded' &&
        event.params?.entry?.level === 'error'
      ) {
        receipt.consoleErrors.push(event.params.entry.text);
      }
    }

    const distinctHashes = new Set(
      receipt.screenshots.map((entry) => entry.sha256),
    );
    const statusText =
      receipt.observations.find((entry) => entry.stage === 'STATUS')?.bodyText || '';
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

    await writeFile(
      join(runDir, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await writeFile(
      join(OUTPUT_ROOT, 'latest.json'),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await writeFile(join(OUTPUT_ROOT, 'LATEST_RUN'), `${basename(runDir)}\n`);

    const markdown = `# Vex Relay self-play receipt\n\n\`[VXG RealForever]\`\n\n- Run: \`${receipt.runRef}\`\n- Disposition: **${receipt.disposition}**\n- Browser: \`${browserPath}\`\n- Started: ${receipt.startedAt}\n- Finished: ${receipt.finishedAt}\n- Screenshots: ${receipt.screenshots.length}\n- Distinct screenshot hashes: ${distinctHashes.size}\n- Page errors: ${receipt.pageErrors.length}\n- Console errors: ${receipt.consoleErrors.length}\n\n## Assertions\n\n\`\`\`json\n${JSON.stringify(receipt.assertions, null, 2)}\n\`\`\`\n\nThis scripted evidence proves browser reachability and observable state changes. It does not prove fun, aesthetic quality, accessibility, real-model behavior, multi-human networking, or long-session reliability.\n`;
    await writeFile(join(runDir, 'README.md'), markdown);

    if (receipt.disposition !== 'PASS_WITH_HUMAN_FEEL_STILL_UNWITNESSED') {
      process.exitCode = 1;
    }
  } finally {
    client?.close();
    if (!KEEP) {
      browser?.kill('SIGTERM');
      server.kill('SIGTERM');
      await delay(250);
      browser?.kill('SIGKILL');
      server.kill('SIGKILL');
      await rm(profileDir, { recursive: true, force: true });
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
  await writeFile(
    join(OUTPUT_ROOT, 'latest.json'),
    `${JSON.stringify(failure, null, 2)}\n`,
  ).catch(() => {});
  console.error(failure.error);
  process.exitCode = 1;
});
