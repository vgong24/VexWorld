import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createVexWorldServer } from '../src/server/server.mjs';

async function withServer(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-http-'));
  const token = 'test-token';
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run({ base, token });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

test('browser root redirects into the source-owned web directory and preserves the development token', async () => {
  await withServer(async ({ base, token }) => {
    const entry = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
    assert.equal(entry.status, 302);
    assert.equal(entry.headers.get('location'), `/src/web/index.html?token=${token}`);

    const html = await fetch(`${base}${entry.headers.get('location')}`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type') || '', /^text\/html/);
    assert.match(await html.text(), /Vextory: First Grove/);

    for (const assetPath of [
      '/src/web/styles.css',
      '/src/web/origin-ritual.mjs',
      '/src/web/app.mjs'
    ]) {
      const asset = await fetch(`${base}${assetPath}`);
      assert.equal(asset.status, 200, `${assetPath} should resolve from the redirected browser entry`);
    }

    const favicon = await fetch(`${base}/favicon.ico`);
    assert.equal(favicon.status, 204);
  });
});

test('LAN development API supports lease, checkpoint, observation, and intent relay', async () => {
  await withServer(async ({ base, token }) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    const health = await fetch(`${base}/api/v1/health`, { headers });
    assert.equal(health.status, 200);
    const lease = await fetch(`${base}/api/v1/sessions/demo/lease`, { method: 'POST', headers, body: JSON.stringify({ action: 'claim', hostId: 'host.a' }) });
    assert.equal(lease.status, 200);
    const checkpoint = await fetch(`${base}/api/v1/sessions/demo/checkpoint`, { method: 'PUT', headers: { ...headers, 'x-vexworld-host-id': 'host.a' }, body: JSON.stringify({ expectedVersion: 0, checkpoint: { state: 'hello' } }) });
    assert.equal(checkpoint.status, 200);
    const observation = await fetch(`${base}/api/v1/sessions/demo/companions/participant.vex/observation`, { method: 'PUT', headers, body: JSON.stringify({ sequence: 1, hello: 'vex' }) });
    assert.equal(observation.status, 200);
    const intent = await fetch(`${base}/api/v1/sessions/demo/companions/participant.vex/intent`, { method: 'PUT', headers, body: JSON.stringify({ sequence: 1, intentType: 'FOLLOW_HUMAN' }) });
    assert.equal(intent.status, 200);
    const record = await fetch(`${base}/api/v1/sessions/demo`, { headers }).then((response) => response.json());
    assert.equal(record.stateVersion, 1);
    assert.equal(record.observations['participant.vex'].hello, 'vex');
  });
});
