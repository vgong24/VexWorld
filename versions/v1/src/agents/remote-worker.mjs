import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ALLOWED_COMPANION_INTENTS } from '../core/constants.mjs';

const MODEL_REASON_MAX_LENGTH = 180;
const MODEL_TARGET_MAX_LENGTH = 180;
const DEFAULT_MODEL_TIMEOUT_MS = 5000;

function controllerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parseAgentArgs(argv) {
  const result = {
    server: null,
    token: null,
    session: null,
    companion: null,
    mode: 'deterministic',
    model: null,
    ollama: 'http://127.0.0.1:11434',
    intervalMs: 900,
    modelTimeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
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
    else if (key === '--model-timeout') result.modelTimeoutMs = Number(argv[++i]);
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
  if (!Number.isFinite(result.modelTimeoutMs) || result.modelTimeoutMs < 50 || result.modelTimeoutMs > 60000) {
    throw new TypeError('--model-timeout must be between 50ms and 60000ms');
  }
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

async function ollamaFetch(options, route, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.modelTimeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS);
  try {
    return await fetch(`${normalizeOllamaRoot(options.ollama)}${route}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) }
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw controllerError('MODEL_TIMEOUT', `Ollama request exceeded ${options.modelTimeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function exactModelMatches(candidate, requested) {
  return candidate?.name === requested || candidate?.model === requested;
}

export async function resolveOllamaModelIdentity(options) {
  const response = await ollamaFetch(options, '/api/tags', { method: 'GET' });
  if (!response.ok) throw controllerError('MODEL_CATALOG_UNAVAILABLE', `Ollama /api/tags HTTP ${response.status}`);
  const payload = await response.json();
  const models = Array.isArray(payload?.models) ? payload.models : [];
  if (!models.length) throw controllerError('NO_INSTALLED_MODELS', 'Ollama reports no installed models');

  let selected;
  if (options.model) {
    const matches = models.filter((candidate) => exactModelMatches(candidate, options.model));
    if (matches.length !== 1) {
      const available = models.map((candidate) => candidate.model || candidate.name).filter(Boolean).join(', ');
      throw controllerError('REQUESTED_MODEL_NOT_INSTALLED', `Requested model ${options.model} was not found exactly; installed: ${available || 'none'}`);
    }
    selected = matches[0];
  } else if (models.length === 1) {
    selected = models[0];
  } else {
    const available = models.map((candidate) => candidate.model || candidate.name).filter(Boolean).join(', ');
    throw controllerError('MODEL_SELECTION_REQUIRED', `Multiple installed models are available; pass --model with one exact name: ${available}`);
  }

  const resolvedModel = selected.model || selected.name;
  if (typeof resolvedModel !== 'string' || !resolvedModel.trim()) {
    throw controllerError('MODEL_IDENTITY_INCOMPLETE', 'Selected Ollama model has no stable model/name field');
  }
  if (typeof selected.digest !== 'string' || !selected.digest.trim()) {
    throw controllerError('MODEL_IDENTITY_INCOMPLETE', `Selected Ollama model ${resolvedModel} has no digest`);
  }
  return Object.freeze({
    requestedModel: options.model || null,
    resolvedModel,
    name: selected.name || resolvedModel,
    digest: selected.digest,
    size: Number.isFinite(selected.size) ? selected.size : null,
    modifiedAt: selected.modified_at || null,
    format: selected.details?.format || null,
    family: selected.details?.family || null,
    parameterSize: selected.details?.parameter_size || null,
    quantizationLevel: selected.details?.quantization_level || null
  });
}

function assertObservationAuthority(observation) {
  if (!observation || typeof observation !== 'object') {
    throw controllerError('OBSERVATION_REQUIRED', 'Model control requires an observer-relative observation');
  }
  if (observation.physicalEffectPossible !== false) {
    throw controllerError('PHYSICAL_AUTHORITY_NOT_ALLOWED', 'Stage E local-model control is allowed only when physicalEffectPossible=false');
  }
  if (!Array.isArray(observation.affordances)) {
    throw controllerError('OBSERVATION_AFFORDANCES_REQUIRED', 'Observation must declare allowed affordances');
  }
}

export function validateModelProposal(proposal, observation) {
  assertObservationAuthority(observation);
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw controllerError('MODEL_PROPOSAL_NOT_OBJECT', 'Model proposal must be one JSON object');
  }
  const keys = Object.keys(proposal);
  const allowedKeys = new Set(['intentType', 'targetRef', 'reason']);
  if (keys.some((key) => !allowedKeys.has(key))) {
    throw controllerError('MODEL_PROPOSAL_EXTRA_FIELDS', 'Model proposal contains fields outside the bounded intent contract');
  }
  if (!ALLOWED_COMPANION_INTENTS.includes(proposal.intentType) || !observation.affordances.includes(proposal.intentType)) {
    throw controllerError('MODEL_INTENT_OUT_OF_SCOPE', `Model intent ${proposal.intentType} is not currently afforded`);
  }
  if (typeof proposal.reason !== 'string' || !proposal.reason.trim() || proposal.reason.length > MODEL_REASON_MAX_LENGTH) {
    throw controllerError('MODEL_REASON_INVALID', 'Model reason must be a short non-empty string');
  }
  const targetRef = proposal.targetRef ?? null;
  if (targetRef !== null && (typeof targetRef !== 'string' || !targetRef || targetRef.length > MODEL_TARGET_MAX_LENGTH)) {
    throw controllerError('MODEL_TARGET_INVALID', 'Model targetRef must be null or one bounded ref string');
  }

  const enemyRefs = new Set((observation.nearbyEnemies || []).map((enemy) => enemy.entityRef));
  if (proposal.intentType === 'ATTACK_NEAREST' || proposal.intentType === 'SIGNAL_HIGH_LOW') {
    if (!targetRef || !enemyRefs.has(targetRef)) {
      throw controllerError('MODEL_TARGET_OUT_OF_SCOPE', 'Combat/team intent target must be an enemy present in the current observation');
    }
  } else if (proposal.intentType === 'RETURN_TO_RESTORATION') {
    if (targetRef && targetRef !== observation.restoration?.entityRef) {
      throw controllerError('MODEL_TARGET_OUT_OF_SCOPE', 'Return intent target may only name the observed restoration point');
    }
  } else if (targetRef !== null) {
    throw controllerError('MODEL_TARGET_OUT_OF_SCOPE', `${proposal.intentType} does not accept a targetRef`);
  }

  return {
    intentType: proposal.intentType,
    targetRef,
    reason: proposal.reason.trim()
  };
}

export async function ollamaIntent(options, observation, modelIdentity) {
  assertObservationAuthority(observation);
  if (!modelIdentity?.resolvedModel || !modelIdentity?.digest) {
    throw controllerError('MODEL_IDENTITY_REQUIRED', 'Ollama intent requires a previously observed installed-model identity');
  }
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
    'Choose exactly one high-level intent from the supplied enum and current affordances.',
    'You do not control physics per frame and cannot mutate world state directly.',
    'Prefer resource safety when return margin is low.',
    'You may signal a combo but never force the human to accept it.',
    'Your response does not become canonical memory, relationship worth, world law, or a learned ability.',
    'Return only the JSON object described by the schema.',
    'Do not include hidden reasoning or chain-of-thought.'
  ].join(' ');
  const startedAt = performance.now();
  const response = await ollamaFetch(options, '/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: modelIdentity.resolvedModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ allowed: observation.affordances, observation }) }
      ],
      format,
      stream: false,
      think: false,
      options: { temperature: 0.2 }
    })
  });
  const roundTripMs = Number((performance.now() - startedAt).toFixed(1));
  if (!response.ok) throw controllerError('MODEL_CHAT_HTTP_ERROR', `Ollama HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (payload.model && payload.model !== modelIdentity.resolvedModel && payload.model !== modelIdentity.name) {
    throw controllerError('MODEL_IDENTITY_CHANGED', `Ollama responded as ${payload.model}, expected ${modelIdentity.resolvedModel}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(payload.message?.content || '{}');
  } catch {
    throw controllerError('MODEL_JSON_INVALID', 'Ollama response content was not valid JSON');
  }
  const proposal = validateModelProposal(parsed, observation);
  return {
    proposal,
    evidence: {
      model: modelIdentity.resolvedModel,
      digest: modelIdentity.digest,
      roundTripMs,
      totalDurationNs: Number.isFinite(payload.total_duration) ? payload.total_duration : null,
      loadDurationNs: Number.isFinite(payload.load_duration) ? payload.load_duration : null,
      promptEvalCount: Number.isFinite(payload.prompt_eval_count) ? payload.prompt_eval_count : null,
      evalCount: Number.isFinite(payload.eval_count) ? payload.eval_count : null
    }
  };
}

export async function runWorkerCycle(options, state = { lastObservationSequence: 0, intentSequence: 0, modelIdentity: null }) {
  let modelIdentity = state.modelIdentity || null;
  let modelIdentityError = null;
  if (options.mode === 'ollama' && !modelIdentity) {
    try {
      modelIdentity = await resolveOllamaModelIdentity(options);
    } catch (error) {
      modelIdentityError = error;
    }
  }

  await agentApi(options, `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/heartbeat`, {
    method: 'PUT',
    body: JSON.stringify({
      workerId: options.workerId,
      mode: options.mode,
      requestedModel: options.mode === 'ollama' ? options.model : null,
      resolvedModel: modelIdentity?.resolvedModel || null,
      modelDigest: modelIdentity?.digest || null,
      modelAvailability: options.mode === 'ollama' ? (modelIdentity ? 'OBSERVED_INSTALLED' : 'UNAVAILABLE_OR_AMBIGUOUS') : 'NOT_APPLICABLE',
      modelIdentityErrorCode: modelIdentityError?.code || null,
      workerPid: process.pid
    })
  });

  const observation = await agentApi(
    options,
    `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/observation`
  );
  if (!observation || Number(observation.sequence) <= state.lastObservationSequence) {
    return { ...state, modelIdentity, processed: false, intent: null };
  }

  const lastObservationSequence = Number(observation.sequence);
  let proposed;
  let modelEvidence = null;
  let fallbackReason = null;
  let controllerDisposition = options.mode.toUpperCase();
  try {
    if (modelIdentityError) throw modelIdentityError;
    if (options.mode === 'ollama') {
      const result = await ollamaIntent(options, observation, modelIdentity);
      proposed = result.proposal;
      modelEvidence = result.evidence;
    } else {
      proposed = deterministicIntent(observation);
    }
  } catch (modelError) {
    controllerDisposition = 'DETERMINISTIC_FALLBACK';
    fallbackReason = modelError.code || 'MODEL_CONTROLLER_ERROR';
    console.error(`controller error; deterministic fallback [${fallbackReason}]: ${modelError.message}`);
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
    controllerDisposition,
    controllerEvidence: {
      requestedMode: options.mode,
      workerId: options.workerId,
      modelIdentity: modelIdentity
        ? { model: modelIdentity.resolvedModel, digest: modelIdentity.digest }
        : null,
      modelMetrics: modelEvidence,
      fallbackReason
    }
  };
  await agentApi(options, `/api/v1/sessions/${encodeURIComponent(options.session)}/companions/${encodeURIComponent(options.companion)}/intent`, {
    method: 'PUT', body: JSON.stringify(intent)
  });
  return { lastObservationSequence, intentSequence, modelIdentity, processed: true, intent };
}

export async function runWorker(options) {
  let state = { lastObservationSequence: 0, intentSequence: 0, modelIdentity: null };
  let cycles = 0;
  console.log(`VexWorld companion worker: ${options.companion}`);
  console.log(`worker=${options.workerId} mode=${options.mode} session=${options.session} server=${options.server}`);
  if (options.mode === 'ollama') {
    console.log(`requestedModel=${options.model || 'AUTO_ONLY_IF_EXACTLY_ONE_INSTALLED'} ollama=${normalizeOllamaRoot(options.ollama)}`);
  }

  while (true) {
    cycles += 1;
    try {
      const priorDigest = state.modelIdentity?.digest || null;
      state = await runWorkerCycle(options, state);
      if (!priorDigest && state.modelIdentity?.digest) {
        console.log(`observedModel=${state.modelIdentity.resolvedModel} digest=${state.modelIdentity.digest}`);
      }
      if (state.processed && state.intent) {
        const fallback = state.intent.controllerEvidence?.fallbackReason ? ` fallback=${state.intent.controllerEvidence.fallbackReason}` : '';
        console.log(`${state.intent.sequence}: ${state.intent.intentType}${state.intent.targetRef ? ` -> ${state.intent.targetRef}` : ''} [${state.intent.controllerDisposition}]${fallback}`);
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
