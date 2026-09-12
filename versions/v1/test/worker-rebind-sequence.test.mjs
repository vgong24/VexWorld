import test from 'node:test';
import assert from 'node:assert/strict';
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

async function publishObservation(options, state, companion, worldPackage) {
  await agentApi(
    options,
    `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}/companions/${encodeURIComponent(companion.participantRef)}/observation`,
    {
      method: 'PUT',
      body: JSON.stringify(makeParticipantObservation(state, companion.participantRef, worldPackage))
    }
  );
}

test('fresh replacement workers continue from the authoritative retained intent sequence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-fresh-worker-rebind-'));
  const token = 'fresh-rebind-test-token';
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    sessionRef: 'session.fresh-worker-rebind',
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_DETERMINISTIC' }]
  });
  const [companion] = getCompanions(state.party);
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const base = await listen(server);
  const common = {
    server: base,
    token,
    session: state.sessionRef,
    intervalMs: 100,
    modelTimeoutMs: 1000,
    once: true,
    maxCycles: null,
    mode: 'deterministic',
    model: null,
    ollama: 'http://127.0.0.1:11434'
  };

  try {
    state.tick = 6;
    await publishObservation(common, state, companion, worldPackage);
    const retainedAt = Date.now();
    await agentApi(
      common,
      `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}/companions/${encodeURIComponent(companion.participantRef)}/intent`,
      {
        method: 'PUT',
        body: JSON.stringify({
          schemaVersion: 'vexworld.companion-intent/v1',
          participantRef: companion.participantRef,
          sequence: 6,
          formedAt: retainedAt,
          expiresAt: retainedAt + 3000,
          sourceObservationRef: `observation.${companion.participantRef}.6`,
          intentType: 'HOLD_POSITION',
          targetRef: null,
          reason: 'PRIOR_WORKER_ACCEPTED_INTENT'
        })
      }
    );

    state.tick = 7;
    await publishObservation(common, state, companion, worldPackage);
    const replacement = await runWorkerCycle({
      ...common,
      companion: companion.participantRef,
      workerId: 'worker.windows.rebind.a009'
    });

    assert.equal(replacement.intent.participantRef, companion.participantRef);
    assert.equal(replacement.intent.sequence, 7);
    assert.equal(replacement.intent.controllerEvidence.sequenceFloor, 6);

    let record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}`);
    assert.equal(record.intents[companion.participantRef].sequence, 7);
    assert.equal(record.workers[companion.participantRef].workerId, 'worker.windows.rebind.a009');

    state.tick = 8;
    await publishObservation(common, state, companion, worldPackage);
    const secondFreshReplacement = await runWorkerCycle({
      ...common,
      companion: companion.participantRef,
      workerId: 'worker.windows.rebind.a010'
    });

    assert.equal(secondFreshReplacement.intent.participantRef, companion.participantRef);
    assert.equal(secondFreshReplacement.intent.sequence, 8);
    assert.equal(secondFreshReplacement.intent.controllerEvidence.sequenceFloor, 7);

    record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}`);
    assert.equal(record.intents[companion.participantRef].sequence, 8);
    assert.equal(record.workers[companion.participantRef].workerId, 'worker.windows.rebind.a010');
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
