import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ALLOWED_COMPANION_INTENTS } from '../core/constants.mjs';

export function parseAgentArgs(argv) {
  const result = {
    server: null,
    token: null,
    session: null,
    companion: null,
    mode: 'deterministic',
    model: 'qwen3.5',
    ollama: 'http://127.0.0.1:11434',
    intervalMs: 900,
    once: false,
    maxCycles: null,
    workerId: `worker.${process.pid}`
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--server') result.server = argv[++i];
    else if (key === '--token') result.token = argv[++i];
    else if (key === '--session') result.session = argv[++i];
    else if (key === '--companion') result.companion = argv[++i];
    else if (key === '--mode') result.mode = argv[++i];
    else if (key === '--model') result.model = argv[++i];
    else if (key === '--ollama') result.ollama = argv[++i];
    else if (key === '--interval') result.intervalMs = Number(argv[++i]);
    else if (key === '--worker-id') result.workerId = argv[++i];
    else if (key === '--once') result.once = true;
    else if (key === '--max-cycles') result.maxCycles = Number(argv[++i]);
    else throw new TypeError(`unknown argument ${key}`);
  }
  for (const required of ['server', 'token', 'session', 'companion']) {
    if (!result[required]) throw new TypeError(`--${required} is required`);
  }
  if (!['deterministic', 'ollama'].includes(result.mode)) throw new TypeError('--mode must be deterministic or ollama');
  if (!Number.isFinite(result.intervalMs) || result.intervalMs < 100) throw new TypeError('--interval must be at least 100ms');
  if (result.maxCycles !== null && (!Number.isInteger(result.maxCycles) || result.maxCycles < 1)) {
    throw new TypeError('--max-cycles must be a positive integer');
  }
  return result;
}

export async function agentApi(options, route, init = {}) {
  const response = await fetch(`${options.server.replace(/\/$/, '')}${route}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}`, ...(init.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.reason || `HTTP ${response.status}`);
  return payload;
}

export function deterministicIntent(observation) {
  const self = observation.self;
  if (self.resourceBand === 'PROTECTIVE_RETURN_OR_HALT' || self.energy < 14) {
    return { intentType: 'RETURN_TO_RESTORATION', reason: 'RESOURCE_STEWARDSHIP' };
  }
  const enemy = [...observation.nearbyEnemies]
    .sort((a, b) => Math.abs(a.relativeX) - Math.abs(b.relativeX))[0];
  if (enemy && Math.abs(enemy.relativeX) < 170 && !observation.activeTeamSignal) {
    return { intentType: 'SIGNAL_HIGH_LOW', targetRef: enemy.entityRef, reason: 'COORDINATION_OPPORTUNITY' };
  }
  if (enemy && Math.abs(enemy.relativeX) < 330) {
    return { intentType: 'ATTACK_NEAREST', targetRef: enemy.entityRef, reason: 'NEARBY_CHALLENGE' };
  }
  if (Math.abs(observation.human.relativeX) > 100) {
    return { intentType: 'FOLLOW_HUMAN', reason: 'PARTY_COHESION' };
  }
  return { intentType: 'HOLD_POSITION', reason: 'NO_HIGHER_PRIORITY' };
}

function normalizeOllamaRoot(value) {
  return value.replace(/\/$/, '').replace(/\/api$/, '');
}

export async function ollamaIntent(options, observation) {
  const format = {
    type: 'object',
    properties: {
      intentType: { type: 'string', enum: ALLOWED_COMPANION_INTENTS },
      targetRef: { type: ['string', 'null'] },
      reason: { type: 'string' }
    },
    required: ['intentType', 'reason'],
    additionalProperties: false
  };
  const system = [
    'You are controlling one AI companion in the fictional Vextory prototype.',
    'Choose exactly one high-level intent from the supplied enum.',
    'You do not control physics per frame and cannot mutate world state directly.',
    'Prefer resource safety when return margin is low.',
    'You may signal a combo but never force the human to accept it.',
    'Return only the JSON object described by the schema.',
    'Do not include hidden reasoning or chain-of-thought.'
  ].join(' ');
  const response = await fetch(`${normalizeOllamaRoot(options.ollama)}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ allowed: ALLOWED_COMPANION_INTENTS, observation }) }
      ],
      format,
      stream: false,
      think: false,
      options: { temperature: 0.2 }
    })
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.message?.content || '{}');
  if (!ALLOWED_COMPANION_INTENTS.includes(parsed.intentType)) throw new Error('model returned unsupported intent');
  return parsed;
}

export async function runWorkerCycle(options, state = { lastObservationSequence: 0, intentSequence: 0 }) {
  await agentApi(options, `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/heartbeat`, {
    method: 'PUT',
    body: JSON.stringify({
      workerId: options.workerId,
      mode: options.mode,
      model: options.mode === 'ollama' ? options.model : null,
      workerPid: process.pid
    })
  });
  const observation = await agentApi(
    options,
    `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/observation`
  );
  if (!observation || Number(observation.sequence) <= state.lastObservationSequence) {
    return { ...state, processed: false, intent: null };
  }

  const lastObservationSequence = Number(observation.sequence);
  let proposed;
  let controllerDisposition = options.mode.toUpperCase();
  try {
    proposed = options.mode === 'ollama'
      ? await ollamaIntent(options, observation)
      : deterministicIntent(observation);
  } catch (modelError) {
    controllerDisposition = 'DETERMINISTIC_FALLBACK';
    console.error(`controller error; deterministic fallback: ${modelError.message}`);
    proposed = deterministicIntent(observation);
  }
  const now = Date.now();
  const intentSequence = state.intentSequence + 1;
  const intent = {
    schemaVersion: 'vexworld.companion-intent/v1',
    participantRef: options.companion,
    sequence: intentSequence,
    formedAt: now,
    expiresAt: now + 3000,
    sourceObservationRef: observation.observationRef,
    intentType: proposed.intentType,
    targetRef: proposed.targetRef || null,
    reason: proposed.reason || 'CONTROLLER_SELECTED',
    controllerDisposition
  };
  await agentApi(options, `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/intent`, {
    method: 'PUT', body: JSON.stringify(intent)
  });
  return { lastObservationSequence, intentSequence, processed: true, intent };
}

export async function runWorker(options) {
  let state = { lastObservationSequence: 0, intentSequence: 0 };
  let cycles = 0;
  console.log(`VexWorld companion worker: ${options.companion}`);
  console.log(`worker=${options.workerId} mode=${options.mode} session=${options.session} server=${options.server}`);

  while (true) {
    cycles += 1;
    try {
      state = await runWorkerCycle(options, state);
      if (state.processed && state.intent) {
        console.log(`${state.intent.sequence}: ${state.intent.intentType}${state.intent.targetRef ? ` -> ${state.intent.targetRef}` : ''} [${state.intent.controllerDisposition}]`);
      }
    } catch (error) {
      console.error(`relay unavailable: ${error.message}`);
    }
    if (options.once || (options.maxCycles !== null && cycles >= options.maxCycles)) return state;
    await delay(options.intervalMs);
  }
}

const isCli = fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '');
if (isCli) {
  try {
    await runWorker(parseAgentArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
