import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
import { createInitialGame, makeParticipantObservation } from '../src/core/engine.mjs';
import { getCompanions } from '../src/core/party.mjs';
import {
  agentApi,
  formWorkerIntelligenceDecision,
  resolveOllamaModelIdentity,
  runWorkerCycle,
  validateModelProposal
} from '../src/agents/remote-worker.mjs';
import { createVexWorldServer } from '../src/server/server.mjs';

const MOCK_DIGEST = 'a'.repeat(64);

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

function installedModel({ name = 'mock-qwen:latest', digest = MOCK_DIGEST } = {}) {
  return {
    name,
    model: name,
    modified_at: '2026-09-11T00:00:00Z',
    size: 4_200_000_000,
    digest,
    details: {
      format: 'gguf',
      family: 'qwen3',
      families: ['qwen3'],
      parameter_size: '4B',
      quantization_level: 'Q4_K_M'
    }
  };
}

function createMockOllama({ models = [installedModel()], chatContent, chatDelayMs = 0, capture } = {}) {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/api/tags') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ models }));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/chat') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capture?.(body);
      if (chatDelayMs) await delay(chatDelayMs);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        model: body.model,
        message: {
          role: 'assistant',
          content: JSON.stringify(chatContent || {
            intentType: 'FOLLOW_HUMAN',
            targetRef: null,
            reason: 'MODEL_SELECTED_PARTY_COHESION'
          })
        },
        done: true,
        total_duration: 9_000_000,
        load_duration: 1_000_000,
        prompt_eval_count: 88,
        eval_count: 12
      }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
}

async function publishObservation(common, sessionRef, member, observation) {
  await agentApi(common, `/api/v1/sessions/${encodeURIComponent(sessionRef)}/companions/${encodeURIComponent(member.participantRef)}/observation`, {
    method: 'PUT',
    body: JSON.stringify(observation)
  });
}

test('one realm relays two independently controlled companion workers with exact observed model identity', async () => {
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

  const ollamaServer = createMockOllama({ capture: (body) => { ollamaRequest = body; } });
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const [base, ollamaBase] = await Promise.all([listen(server), listen(ollamaServer)]);
  const common = { server: base, token, session: state.sessionRef, intervalMs: 100, modelTimeoutMs: 1000, once: true, maxCycles: null };

  try {
    await Promise.all([vex, mira].map(async (member) => {
      const observation = makeParticipantObservation(state, member.participantRef, worldPackage);
      await publishObservation(common, state.sessionRef, member, observation);
    }));

    const [vexResult, miraResult] = await Promise.all([
      runWorkerCycle({ ...common, companion: vex.participantRef, mode: 'deterministic', model: null, ollama: ollamaBase, workerId: 'worker.pc.vex' }),
      runWorkerCycle({ ...common, companion: mira.participantRef, mode: 'ollama', model: 'mock-qwen:latest', ollama: `${ollamaBase}/api`, workerId: 'worker.mac.mira' })
    ]);

    assert.equal(vexResult.processed, true);
    assert.equal(miraResult.processed, true);
    assert.equal(vexResult.intent.participantRef, vex.participantRef);
    assert.equal(miraResult.intent.participantRef, mira.participantRef);
    assert.equal(miraResult.intent.controllerDisposition, 'OLLAMA');
    assert.equal(miraResult.modelIdentity.resolvedModel, 'mock-qwen:latest');
    assert.equal(miraResult.modelIdentity.digest, MOCK_DIGEST);
    assert.equal(miraResult.intent.controllerEvidence.modelIdentity.digest, MOCK_DIGEST);
    assert.ok(miraResult.intent.controllerEvidence.modelMetrics.roundTripMs >= 0);

    assert.equal(vexResult.decision.controllerDisposition, 'DETERMINISTIC');
    assert.equal(vexResult.decision.modelIdentityOrNull, null);
    assert.equal(vexResult.decision.acceptedIntentOrNull.intentRef, vexResult.intent.intentRef);

    assert.equal(miraResult.decision.controllerDisposition, 'OLLAMA');
    assert.equal(miraResult.decision.fallbackReasonOrNull, null);
    assert.equal(miraResult.decision.sourceObservationRef, miraResult.intent.sourceObservationRef);
    assert.equal(miraResult.decision.acceptedIntentOrNull.intentRef, miraResult.intent.intentRef);
    assert.equal(miraResult.decision.modelIdentityOrNull.modelDigest, MOCK_DIGEST);
    assert.equal(miraResult.decision.modelIdentityOrNull.modelRef, `model.ollama.sha256.${MOCK_DIGEST}`);
    assert.match(miraResult.decision.sourceObservationSha256, /^[a-f0-9]{64}$/);
    assert.match(miraResult.decision.decisionSha256, /^[a-f0-9]{64}$/);

    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}`);
    assert.deepEqual(Object.keys(record.intents).sort(), [mira.participantRef, vex.participantRef].sort());
    assert.equal(record.workers[vex.participantRef].workerId, 'worker.pc.vex');
    assert.equal(record.workers[mira.participantRef].workerId, 'worker.mac.mira');
    assert.equal(record.workers[mira.participantRef].resolvedModel, 'mock-qwen:latest');
    assert.equal(record.workers[mira.participantRef].modelDigest, MOCK_DIGEST);
    assert.equal(record.workers[mira.participantRef].modelAvailability, 'OBSERVED_INSTALLED');
    assert.equal(ollamaRequest.model, 'mock-qwen:latest');
    assert.equal(ollamaRequest.stream, false);
    assert.equal(ollamaRequest.think, false);
    assert.equal(ollamaRequest.format.type, 'object');
  } finally {
    await Promise.all([close(server), close(ollamaServer)]);
    await rm(directory, { recursive: true, force: true });
  }
});

test('model selection is observed from Ollama and never guessed when several models are installed', async () => {
  const ollamaServer = createMockOllama({
    models: [installedModel({ name: 'model-a:latest' }), installedModel({ name: 'model-b:latest', digest: 'b'.repeat(64) })]
  });
  const base = await listen(ollamaServer);
  try {
    await assert.rejects(
      () => resolveOllamaModelIdentity({ ollama: base, model: null, modelTimeoutMs: 1000 }),
      (error) => error.code === 'MODEL_SELECTION_REQUIRED'
    );
    const identity = await resolveOllamaModelIdentity({ ollama: base, model: 'model-b:latest', modelTimeoutMs: 1000 });
    assert.equal(identity.resolvedModel, 'model-b:latest');
    assert.equal(identity.digest, 'b'.repeat(64));
  } finally {
    await close(ollamaServer);
  }
});

test('model proposals fail closed when target or extra fields exceed the observer-relative intent contract', async () => {
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_OLLAMA' }]
  });
  const [companion] = getCompanions(state.party);
  const observation = makeParticipantObservation(state, companion.participantRef, worldPackage);

  assert.throws(
    () => validateModelProposal({
      intentType: 'ATTACK_NEAREST',
      targetRef: 'entity.not-observed',
      reason: 'ATTACK_THE_HIDDEN_TARGET'
    }, observation),
    (error) => error.code === 'MODEL_TARGET_OUT_OF_SCOPE'
  );
  assert.throws(
    () => validateModelProposal({
      intentType: 'HOLD_POSITION',
      targetRef: null,
      reason: 'WAIT',
      memoryWrite: 'secret'
    }, observation),
    (error) => error.code === 'MODEL_PROPOSAL_EXTRA_FIELDS'
  );
  assert.throws(
    () => validateModelProposal({ intentType: 'HOLD_POSITION', targetRef: null, reason: 'WAIT' }, { ...observation, physicalEffectPossible: true }),
    (error) => error.code === 'PHYSICAL_AUTHORITY_NOT_ALLOWED'
  );
});

test('out-of-scope Ollama output falls back deterministically instead of becoming a gameplay intent', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-model-fallback-'));
  const token = 'fallback-test-token';
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    sessionRef: 'session.model-fallback',
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_OLLAMA' }]
  });
  const [companion] = getCompanions(state.party);
  state.tick = 1;
  const ollamaServer = createMockOllama({
    chatContent: { intentType: 'ATTACK_NEAREST', targetRef: 'entity.not-observed', reason: 'MODEL_SELECTED_HIDDEN_TARGET' }
  });
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const [base, ollamaBase] = await Promise.all([listen(server), listen(ollamaServer)]);
  const common = { server: base, token, session: state.sessionRef, intervalMs: 100, modelTimeoutMs: 1000, once: true, maxCycles: null };
  try {
    await publishObservation(common, state.sessionRef, companion, makeParticipantObservation(state, companion.participantRef, worldPackage));
    const result = await runWorkerCycle({
      ...common,
      companion: companion.participantRef,
      mode: 'ollama',
      model: 'mock-qwen:latest',
      ollama: ollamaBase,
      workerId: 'worker.model-fallback'
    });
    assert.equal(result.intent.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.intent.controllerEvidence.fallbackReason, 'MODEL_TARGET_OUT_OF_SCOPE');
    assert.notEqual(result.intent.targetRef, 'entity.not-observed');
    assert.equal(result.decision.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.decision.fallbackReasonOrNull, 'MODEL_TARGET_OUT_OF_SCOPE');
    assert.equal(result.decision.acceptedIntentOrNull.intentRef, result.intent.intentRef);
    assert.notEqual(result.decision.proposedIntent.targetRef, 'entity.not-observed');
    assert.equal(result.decision.modelIdentityOrNull.modelDigest, MOCK_DIGEST);
  } finally {
    await Promise.all([close(server), close(ollamaServer)]);
    await rm(directory, { recursive: true, force: true });
  }
});

test('Ollama timeout becomes visible deterministic fallback with no stale model intent', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-model-timeout-'));
  const token = 'timeout-test-token';
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    sessionRef: 'session.model-timeout',
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_OLLAMA' }]
  });
  const [companion] = getCompanions(state.party);
  state.tick = 1;
  const ollamaServer = createMockOllama({ chatDelayMs: 140 });
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const [base, ollamaBase] = await Promise.all([listen(server), listen(ollamaServer)]);
  const common = { server: base, token, session: state.sessionRef, intervalMs: 100, modelTimeoutMs: 50, once: true, maxCycles: null };
  try {
    await publishObservation(common, state.sessionRef, companion, makeParticipantObservation(state, companion.participantRef, worldPackage));
    const result = await runWorkerCycle({
      ...common,
      companion: companion.participantRef,
      mode: 'ollama',
      model: 'mock-qwen:latest',
      ollama: ollamaBase,
      workerId: 'worker.model-timeout'
    });
    assert.equal(result.intent.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.intent.controllerEvidence.fallbackReason, 'MODEL_TIMEOUT');
    assert.equal(result.decision.controllerDisposition, 'DETERMINISTIC_FALLBACK');
    assert.equal(result.decision.fallbackReasonOrNull, 'MODEL_TIMEOUT');
    assert.equal(result.decision.acceptedIntentOrNull.intentRef, result.intent.intentRef);
  } finally {
    await Promise.all([close(server), close(ollamaServer)]);
    await rm(directory, { recursive: true, force: true });
  }
});

test('worker decision identity binds the exact received observation content and canonical model digest', async () => {
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_OLLAMA' }]
  });
  const [companion] = getCompanions(state.party);
  state.tick = 7;
  const observation = makeParticipantObservation(state, companion.participantRef, worldPackage);
  const changedObservation = {
    ...observation,
    weather: observation.weather === 'CLEAR' ? 'RAIN' : 'CLEAR'
  };
  const options = {
    session: 'session.provenance.fixture.a',
    companion: companion.participantRef,
    workerId: 'worker.provenance.fixture',
    mode: 'ollama'
  };
  const proposedIntent = {
    intentType: 'HOLD_POSITION',
    targetRef: null,
    reason: 'WAIT'
  };
  const acceptedIntent = {
    intentRef: `intent.${companion.participantRef}.7`,
    participantRef: companion.participantRef,
    sequence: 7,
    intentType: 'HOLD_POSITION',
    targetRef: null
  };
  const modelIdentity = {
    resolvedModel: 'mock-qwen:latest',
    digest: `sha256:${MOCK_DIGEST}`
  };

  const first = formWorkerIntelligenceDecision({
    options,
    observation,
    proposedIntent,
    acceptedIntent,
    modelIdentity,
    controllerDisposition: 'OLLAMA',
    fallbackReason: null
  });
  const changed = formWorkerIntelligenceDecision({
    options,
    observation: changedObservation,
    proposedIntent,
    acceptedIntent,
    modelIdentity,
    controllerDisposition: 'OLLAMA',
    fallbackReason: null
  });

  assert.equal(first.sourceObservationRef, observation.observationRef);
  assert.equal(changed.sourceObservationRef, observation.observationRef);
  assert.notEqual(first.sourceObservationSha256, changed.sourceObservationSha256);
  assert.notEqual(first.decisionSha256, changed.decisionSha256);
  assert.equal(first.modelIdentityOrNull.modelDigest, MOCK_DIGEST);
  assert.equal(first.modelIdentityOrNull.modelRef, `model.ollama.sha256.${MOCK_DIGEST}`);
  assert.ok(first.visibleContextRefs.includes(observation.worldRef));
  assert.ok(first.visibleContextRefs.includes(observation.human.participantRef));

  const otherSession = formWorkerIntelligenceDecision({
    options: { ...options, session: 'session.provenance.fixture.b' },
    observation,
    proposedIntent,
    acceptedIntent,
    modelIdentity,
    controllerDisposition: 'OLLAMA',
    fallbackReason: null
  });
  assert.notEqual(first.decisionRef, otherSession.decisionRef);
});

test('same companion identity survives worker-process rebind while intent sequence remains monotonic', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-worker-rebind-'));
  const token = 'rebind-test-token';
  const worldPackage = await compileFirstGrove();
  const state = createInitialGame(worldPackage, {
    sessionRef: 'session.worker-rebind',
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_DETERMINISTIC' }]
  });
  const [companion] = getCompanions(state.party);
  const { server } = createVexWorldServer({ host: '127.0.0.1', port: 0, token, dataDirectory: directory });
  const base = await listen(server);
  const common = { server: base, token, session: state.sessionRef, intervalMs: 100, modelTimeoutMs: 1000, once: true, maxCycles: null, mode: 'deterministic', model: null, ollama: 'http://127.0.0.1:11434' };
  try {
    state.tick = 1;
    await publishObservation(common, state.sessionRef, companion, makeParticipantObservation(state, companion.participantRef, worldPackage));
    const first = await runWorkerCycle({ ...common, companion: companion.participantRef, workerId: 'worker.pc.first' });
    state.tick = 2;
    await publishObservation(common, state.sessionRef, companion, makeParticipantObservation(state, companion.participantRef, worldPackage));
    const second = await runWorkerCycle({ ...common, companion: companion.participantRef, workerId: 'worker.mac.rebound' }, first);

    assert.equal(first.intent.participantRef, companion.participantRef);
    assert.equal(second.intent.participantRef, companion.participantRef);
    assert.equal(second.intent.sequence, first.intent.sequence + 1);
    const record = await agentApi(common, `/api/v1/sessions/${encodeURIComponent(state.sessionRef)}`);
    assert.equal(record.workers[companion.participantRef].workerId, 'worker.mac.rebound');
    assert.equal(record.intents[companion.participantRef].participantRef, companion.participantRef);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
