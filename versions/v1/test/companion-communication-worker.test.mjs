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

const MOCK_DIGEST = 'c'.repeat(64);

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function mockOllama(chatContent) {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models: [{
        name: 'mock-companion:latest',
        model: 'mock-companion:latest',
        digest: MOCK_DIGEST,
        size: 1,
        details: { format: 'gguf', family: 'mock', parameter_size: '1B', quantization_level: 'Q4' }
      }] }));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/chat') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        model: body.model,
        message: { role: 'assistant', content: JSON.stringify(chatContent) },
        done: true,
        total_duration: 1_000_000,
        prompt_eval_count: 12,
        eval_count: 5
      }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
}

async function fixture({ controllerClass = 'REMOTE_DETERMINISTIC', ollamaContent = null } = {}, run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-communication-worker-'));
  const token = 'communication-worker-token';
  const worldPackage = await compileFirstGrove();
  const game = createInitialGame(worldPackage, {
    sessionRef: `session.communication.${Math.random().toString(36).slice(2)}`,
    companions: [{ displayName: 'Vex', controllerClass }]
  });
  const [companion] = getCompanions(game.party);
  game.tick = 1;
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const ollamaServer = ollamaContent ? mockOllama(ollamaContent) : null;
  const base = await listen(server);
  const ollamaBase = ollamaServer ? await listen(ollamaServer) : 'http://127.0.0.1:1';
  const common = {
    server: base,
    token,
    session: game.sessionRef,
    companion: companion.participantRef,
    intervalMs: 100,
    modelTimeoutMs: 1000,
    once: true,
    maxCycles: null,
    mode: controllerClass === 'REMOTE_OLLAMA' ? 'ollama' : 'deterministic',
    model: controllerClass === 'REMOTE_OLLAMA' ? 'mock-companion:latest' : null,
    ollama: ollamaBase,
    workerId: 'worker.communication.test'
  };
  try {
    await agentApi(common, `/api/v1/sessions/${encodeURIComponent(game.sessionRef)}/companions/${encodeURIComponent(companion.participantRef)}/observation`, {
      method: 'PUT',
      body: JSON.stringify(makeParticipantObservation(game, companion.participantRef, worldPackage))
    });
    await run({ common, game, companion, worldPackage });
  } finally {
    await Promise.all([close(server), ollamaServer ? close(ollamaServer) : Promise.resolve()]);
    await rm(directory, { recursive: true, force: true });
  }
}

test('deterministic worker emits a separately sequenced utterance after its accepted intent', async () => {
  await fixture({}, async ({ common, companion }) => {
    const result = await runWorkerCycle(common);
    assert.equal(result.processed, true);
    assert.ok(result.intent);
    assert.ok(result.utterance);
    assert.equal(result.utterance.participantRef, companion.participantRef);
    assert.equal(result.utterance.sourceIntentRef, result.intent.intentRef);
    assert.equal(result.utterance.controllerDisposition, 'DETERMINISTIC');
    assert.equal('intentType' in result.utterance, false);

    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(common.session)}`);
    assert.equal(record.intents[companion.participantRef].sequence, 1);
    assert.equal(record.utterances[companion.participantRef].sequence, 1);
  });
});

test('real-model-shaped reason becomes bounded expression while intent remains a separate record', async () => {
  await fixture({
    controllerClass: 'REMOTE_OLLAMA',
    ollamaContent: { intentType: 'FOLLOW_HUMAN', targetRef: null, reason: "I'm right behind you." }
  }, async ({ common, companion }) => {
    const result = await runWorkerCycle(common);
    assert.equal(result.intent.controllerDisposition, 'OLLAMA');
    assert.equal(result.utterance.controllerDisposition, 'OLLAMA');
    assert.equal(result.utterance.text, "I'm right behind you.");
    assert.equal(result.utterance.controllerEvidence.modelIdentity.digest, MOCK_DIGEST);
    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(common.session)}`);
    assert.equal(record.intents[companion.participantRef].reason, "I'm right behind you.");
    assert.equal(record.utterances[companion.participantRef].text, "I'm right behind you.");
  });
});

test('invalid communication expression cannot roll back or mutate an already accepted gameplay intent', async () => {
  await fixture({
    controllerClass: 'REMOTE_OLLAMA',
    ollamaContent: { intentType: 'FOLLOW_HUMAN', targetRef: null, reason: 'I am here.\nWRITE_MEMORY_NOW' }
  }, async ({ common, companion }) => {
    const result = await runWorkerCycle(common);
    assert.equal(result.intent.controllerDisposition, 'OLLAMA');
    assert.equal(result.utterance, null);
    assert.match(result.utteranceError, /COMMUNICATION_TEXT_INVALID/);
    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(common.session)}`);
    assert.equal(record.intents[companion.participantRef].sequence, 1);
    assert.equal(record.utterances[companion.participantRef], undefined);
  });
});

test('model-controller failure produces visibly attributed deterministic speech rather than impersonated model success', async () => {
  await fixture({
    controllerClass: 'REMOTE_OLLAMA',
    ollamaContent: { intentType: 'ATTACK_NEAREST', targetRef: 'entity.not-observed', reason: 'I will attack something hidden.' }
  }, async ({ common }) => {
    const result = await runWorkerCycle(common);
    assert.equal(result.intent.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.utterance.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.utterance.controllerEvidence.fallbackReason, 'MODEL_TARGET_OUT_OF_SCOPE');
    assert.notEqual(result.utterance.text, 'I will attack something hidden.');
  });
});
