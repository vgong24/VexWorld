import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from './session-store.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const defaultHome = path.resolve(process.env.VEXWORLD_HOME || path.join(homedir(), '.vexworld'));
  const options = { host: '127.0.0.1', port: 4173, data: path.join(defaultHome, 'sessions'), open: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--lan') options.host = '0.0.0.0';
    else if (argv[i] === '--host') options.host = argv[++i];
    else if (argv[i] === '--port') options.port = Number(argv[++i]);
    else if (argv[i] === '--data') options.data = path.resolve(argv[++i]);
    else if (argv[i] === '--open') options.open = true;
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new TypeError('invalid port');
  return options;
}

function contentType(file) {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.md': 'text/markdown; charset=utf-8'
  })[path.extname(file)] || 'application/octet-stream';
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value, null, 2) + '\n';
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

async function readJson(request, maxBytes = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('request too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

function requireToken(request, token) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  return supplied === token;
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/\\/g, '/');
  const absolute = path.resolve(projectRoot, `.${decoded}`);
  if (!absolute.startsWith(projectRoot + path.sep)) return null;
  return absolute;
}

function openBrowser(url) {
  let executable;
  let args;
  if (process.platform === 'win32') {
    executable = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    executable = 'open';
    args = [url];
  } else {
    executable = 'xdg-open';
    args = [url];
  }
  const child = spawn(executable, args, { detached: true, stdio: 'ignore' });
  child.once('error', () => {});
  child.unref();
}

function lanAddresses(port, token, host) {
  const values = [];
  if (host === '127.0.0.1' || host === 'localhost') {
    values.push(`http://127.0.0.1:${port}/?token=${token}`);
    return values;
  }
  values.push(`http://127.0.0.1:${port}/?token=${token}`);
  for (const records of Object.values(networkInterfaces())) {
    for (const record of records || []) {
      if (record.family === 'IPv4' && !record.internal) values.push(`http://${record.address}:${port}/?token=${token}`);
    }
  }
  return values;
}

export function createVexWorldServer({ host = '127.0.0.1', port = 4173, token, dataDirectory }) {
  const store = new SessionStore(dataDirectory);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/v1/')) {
        if (!requireToken(request, token)) return sendJson(response, 401, { error: 'VALID_DEVELOPMENT_TOKEN_REQUIRED' });
        if (request.method === 'GET' && url.pathname === '/api/v1/health') {
          return sendJson(response, 200, { state: 'AVAILABLE', schemaVersion: 'vexworld.lan-development-server/v1', productionSecurity: false });
        }
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'api' || parts[1] !== 'v1' || parts[2] !== 'sessions' || !parts[3]) {
          return sendJson(response, 404, { error: 'API_ROUTE_NOT_FOUND' });
        }
        const sessionRef = parts[3];
        if (request.method === 'GET' && parts.length === 4) {
          const record = await store.read(sessionRef);
          return sendJson(response, 200, record);
        }
        if (parts[4] === 'lease' && request.method === 'POST') {
          const body = await readJson(request);
          const result = body.action === 'release'
            ? await store.releaseLease(sessionRef, body.hostId)
            : await store.claimLease(sessionRef, body.hostId, { ttlMs: Number(body.ttlMs || 15000) });
          return sendJson(response, result.accepted ? 200 : 409, result);
        }
        if (parts[4] === 'checkpoint' && request.method === 'PUT') {
          const body = await readJson(request);
          const result = await store.writeCheckpoint(sessionRef, request.headers['x-vexworld-host-id'], Number(body.expectedVersion), body.checkpoint);
          return sendJson(response, result.accepted ? 200 : 409, result);
        }
        if (parts[4] === 'companions' && parts[5]) {
          const participantRef = parts[5];
          const resource = parts[6];
          if (resource === 'observation') {
            if (request.method === 'GET') {
              const record = await store.read(sessionRef);
              return sendJson(response, 200, record.observations[participantRef] || null);
            }
            if (request.method === 'PUT') {
              const result = await store.putObservation(sessionRef, participantRef, await readJson(request));
              return sendJson(response, result.accepted ? 200 : 409, result);
            }
          }
          if (resource === 'intent') {
            if (request.method === 'GET') {
              const record = await store.read(sessionRef);
              return sendJson(response, 200, record.intents[participantRef] || null);
            }
            if (request.method === 'PUT') {
              const result = await store.putIntent(sessionRef, participantRef, await readJson(request));
              return sendJson(response, result.accepted ? 200 : 409, result);
            }
          }
          if (resource === 'heartbeat' && request.method === 'PUT') {
            const result = await store.heartbeat(sessionRef, participantRef, await readJson(request));
            return sendJson(response, 200, result);
          }
        }
        return sendJson(response, 404, { error: 'API_ROUTE_NOT_FOUND' });
      }

      // Root is an entry pointer, not a second static-root namespace. Redirecting
      // preserves the token while making the browser's relative CSS/module URLs
      // resolve beneath /src/web/ instead of incorrectly probing /styles.css,
      // /app.mjs, and /origin-ritual.mjs.
      if (url.pathname === '/') {
        response.writeHead(302, {
          location: `/src/web/index.html${url.search}`,
          'cache-control': 'no-store'
        });
        return response.end();
      }

      // Browsers may probe this implicitly. It is intentionally empty rather than
      // a missing-resource error so browser evidence is not polluted by chrome.
      if (url.pathname === '/favicon.ico') {
        response.writeHead(204, { 'cache-control': 'no-store' });
        return response.end();
      }

      const file = safeStaticPath(url.pathname);
      if (!file) {
        response.writeHead(400);
        return response.end('invalid path');
      }
      let target = file;
      const stat = await fs.stat(target).catch(() => null);
      if (stat?.isDirectory()) target = path.join(target, 'index.html');
      const content = await fs.readFile(target);
      response.writeHead(200, {
        'content-type': contentType(target),
        'cache-control': target.includes('/generated/') ? 'no-cache' : 'no-store',
        'x-content-type-options': 'nosniff'
      });
      response.end(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        response.writeHead(404);
        response.end('not found');
      } else {
        sendJson(response, error.status || 500, { error: error.message || 'internal error' });
      }
    }
  });
  return { server, store, host, port, token };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.VEXWORLD_TOKEN || randomBytes(18).toString('base64url');
  const { server } = createVexWorldServer({ ...options, token, dataDirectory: options.data });
  server.listen(options.port, options.host, () => {
    console.log('\nVextory: First Grove development server');
    console.log('----------------------------------------');
    const addresses = lanAddresses(options.port, token, options.host);
    for (const address of addresses) console.log(address);
    console.log(`\nSession storage: ${options.data}`);
    console.log('Trusted LAN prototype only. Do not expose this token or server to the public internet.');
    console.log('Close this terminal or press Ctrl+C to stop.\n');
    if (options.open) setTimeout(() => openBrowser(addresses[0]), 150);
  });
}
