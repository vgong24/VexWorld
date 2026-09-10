import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
import { createInitialGame, makeParticipantObservation } from '../src/core/engine.mjs';
import { getCompanions } from '../src/core/party.mjs';
import { agentApi, runWorkerCycle } from '../src/agents/remote-worker.mjs';
import { createVexWorldServer } from '../src/server/server.mjs';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('one realm relays two independently controlled companion workers', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-workers-'));
  const token = 'two-worker-test-token';
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    sessionRef: 'session.two-workers',
    companions: [
      { displayName: 'Vex', controllerClass: 'REMOTE_DETERMINISTIC' },
      { displayName: 'Mira', controllerClass: 'REMOTE_OLLAMA' }
    ]
  });
  const [vex, mira] = getCompanions(state.party);
  state.tick = 1;
  let ollamaRequest = null;

  const ollamaServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    ollamaRequest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      message: {
        role: 'assistant',
        content: JSON.stringify({ intentType: 'FOLLOW_HUMAN', targetRef: null, reason: 'MODEL_SELECTED_PARTY_COHESION' })
      },
      done: true
    }));
  });

  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const [base, ollamaBase] = await Promise.all([listen(server), listen(ollamaServer)]);
  const common = { server: base, token, session: state.sessionRef, intervalMs: 100, once: true, maxCycles: null };

  try {
    await Promise.all([vex, mira].map(async (member) => {
      const observation = makeParticipantObservation(state, member.participantRef, worldPackage);
      await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}/companions/${encodeURIComponent(member.participantRef)}/observation`, {
        method: 'PUT', body: JSON.stringify(observation)
      });
    }));

    const [vexResult, miraResult] = await Promise.all([
      runWorkerCycle({ ...common, companion: vex.participantRef, mode: 'deterministic', model: 'none', ollama: ollamaBase, workerId: 'worker.pc.vex' }),
      runWorkerCycle({ ...common, companion: mira.participantRef, mode: 'ollama', model: 'mock-qwen', ollama: `${ollamaBase}/api`, workerId: 'worker.mac.mira' })
    ]);

    assert.equal(vexResult.processed, true);
    assert.equal(miraResult.processed, true);
    assert.equal(vexResult.intent.participantRef, vex.participantRef);
    assert.equal(miraResult.intent.participantRef, mira.participantRef);
    assert.equal(miraResult.intent.controllerDisposition, 'OLLAMA');

    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}`);
    assert.deepEqual(Object.keys(record.intents).sort(), [mira.participantRef, vex.participantRef].sort());
    assert.equal(record.workers[vex.participantRef].workerId, 'worker.pc.vex');
    assert.equal(record.workers[mira.participantRef].workerId, 'worker.mac.mira');
    assert.equal(ollamaRequest.model, 'mock-qwen');
    assert.equal(ollamaRequest.stream, false);
    assert.equal(ollamaRequest.think, false);
    assert.equal(ollamaRequest.format.type, 'object');
  } finally {
    await Promise.all([close(server), close(ollamaServer)]);
    await rm(directory, { recursive: true, force: true });
  }
});
