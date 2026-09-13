#!/usr/bin/env node
/**
 * Bounded renderer-independent First Grove realm host.
 *
 * This process may hold a SessionStore host lease and execute canonical engine
 * transitions, but it is not a human, companion lineage, model, world law, or
 * production server.
 *
 * WORLD_CLOCK != WALL_CLOCK_TRUTH
 * HUMAN_ABSENCE != FABRICATED_HUMAN_INPUT
 * [VXG RealForever]
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { FIXED_STEP_MS } from '../core/constants.mjs';
import { serializeGameState, stepGame, validateGameState } from '../core/engine.mjs';
import { makeParticipantObservation } from '../core/observation.mjs';
import { getCompanions } from '../core/party.mjs';
import { canonicalJson } from '../core/utils.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION_ROOT = path.resolve(HERE, '../..');
const DEFAULT_WORLD_PACKAGE = path.join(VERSION_ROOT, 'generated', 'first-grove.world-package.json');
const EMPTY_HUMAN_INPUT = Object.freeze({});
const WORLD_PACKAGE_SCHEMA = 'vexworld.world-package/v1';
const WORLD_PACKAGE_REF = 'package.vexworld.first-grove.prototype.v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function hostError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function positiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function computeWorldPackageIntegrityFingerprint(worldPackage) {
  const { integrityFingerprint: _claimedFingerprint, ...packageBody } = worldPackage;
  return createHash('sha256').update(canonicalJson(packageBody)).digest('hex');
}

export function validateHeadlessWorldPackage(worldPackage) {
  if (!worldPackage || typeof worldPackage !== 'object' || Array.isArray(worldPackage)) {
    throw hostError('WORLD_PACKAGE_INVALID', 'headless realm host requires an object World Package');
  }
  if (worldPackage.schemaVersion !== WORLD_PACKAGE_SCHEMA) {
    throw hostError('WORLD_PACKAGE_SCHEMA_MISMATCH', `headless realm host requires ${WORLD_PACKAGE_SCHEMA}`);
  }
  if (worldPackage.packageRef !== WORLD_PACKAGE_REF) {
    throw hostError('WORLD_PACKAGE_REF_MISMATCH', `headless realm host requires ${WORLD_PACKAGE_REF}`);
  }
  const worldRef = worldPackage.manifest?.worldRef;
  if (typeof worldRef !== 'string' || !worldRef) {
    throw hostError('WORLD_PACKAGE_INVALID', 'headless realm World Package requires manifest.worldRef');
  }
  const claimedFingerprint = worldPackage.integrityFingerprint;
  if (typeof claimedFingerprint !== 'string' || !SHA256_PATTERN.test(claimedFingerprint)) {
    throw hostError('WORLD_PACKAGE_INVALID', 'headless realm World Package requires a sha256 integrityFingerprint');
  }
  const actualFingerprint = computeWorldPackageIntegrityFingerprint(worldPackage);
  if (actualFingerprint !== claimedFingerprint) {
    throw hostError(
      'WORLD_PACKAGE_INTEGRITY_MISMATCH',
      'headless realm World Package integrity fingerprint does not match its canonical body',
      { claimedFingerprint, actualFingerprint }
    );
  }
  return Object.freeze({ worldRef, integrityFingerprint: claimedFingerprint });
}

export function assertCheckpointWorldPackageCompatibility(checkpoint, packageIdentity) {
  const checkpointWorldRef = checkpoint?.worldRef;
  const realityWorldRef = checkpoint?.realityContext?.worldRef;
  if (checkpointWorldRef !== packageIdentity.worldRef || realityWorldRef !== packageIdentity.worldRef) {
    throw hostError(
      'CHECKPOINT_WORLD_REF_MISMATCH',
      'accepted checkpoint worldRef does not match the supplied canonical World Package',
      {
        checkpointWorldRef,
        realityWorldRef,
        packageWorldRef: packageIdentity.worldRef
      }
    );
  }
  const checkpointFingerprint = checkpoint?.prototype?.packageFingerprint;
  if (checkpointFingerprint !== packageIdentity.integrityFingerprint) {
    throw hostError(
      'CHECKPOINT_WORLD_PACKAGE_FINGERPRINT_MISMATCH',
      'accepted checkpoint package fingerprint does not match the supplied canonical World Package',
      {
        checkpointFingerprint,
        packageFingerprint: packageIdentity.integrityFingerprint
      }
    );
  }
}

export function parseHeadlessRealmArgs(argv) {
  const options = {
    server: null,
    token: null,
    session: null,
    hostId: `host.headless.${process.pid}`,
    worldPackage: DEFAULT_WORLD_PACKAGE,
    ticks: 600,
    tickDelayMs: Math.round(FIXED_STEP_MS),
    saveEveryTicks: 60,
    leaseTtlMs: 15000,
    leaseRenewEveryTicks: 240,
    resumePaused: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--server') options.server = argv[++index];
    else if (key === '--token') options.token = argv[++index];
    else if (key === '--session') options.session = argv[++index];
    else if (key === '--host-id') options.hostId = argv[++index];
    else if (key === '--world-package') options.worldPackage = path.resolve(argv[++index]);
    else if (key === '--ticks') options.ticks = positiveInteger(argv[++index], '--ticks', { max: 3600 });
    else if (key === '--tick-delay') options.tickDelayMs = positiveInteger(argv[++index], '--tick-delay', { min: 0, max: 1000 });
    else if (key === '--save-every') options.saveEveryTicks = positiveInteger(argv[++index], '--save-every', { max: 600 });
    else if (key === '--lease-ttl') options.leaseTtlMs = positiveInteger(argv[++index], '--lease-ttl', { min: 1000, max: 60000 });
    else if (key === '--renew-every') options.leaseRenewEveryTicks = positiveInteger(argv[++index], '--renew-every', { max: 600 });
    else if (key === '--resume-paused') options.resumePaused = true;
    else throw new TypeError(`unknown argument ${key}`);
  }
  for (const required of ['server', 'token', 'session']) {
    if (!options[required]) throw new TypeError(`--${required} is required`);
  }
  if (!/^host\.headless\.[A-Za-z0-9._-]+$/.test(options.hostId)) {
    throw new TypeError('--host-id must use host.headless.* identity');
  }
  return options;
}

export class HeadlessSessionClient {
  constructor({ baseUrl, token, sessionRef, hostId }) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
    this.token = token;
    this.sessionRef = sessionRef;
    this.hostId = hostId;
    this.stateVersion = null;
    this.lease = null;
  }

  async request(route, init = {}) {
    const response = await fetch(`${this.baseUrl}${route}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.token}`,
        ...(init.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw hostError(
        payload.reason || payload.error || `HTTP_${response.status}`,
        payload.error || payload.reason || `HTTP ${response.status}`,
        { status: response.status, payload }
      );
    }
    return payload;
  }

  async load({ trackVersion = true } = {}) {
    const record = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}`);
    if (trackVersion) this.stateVersion = record.stateVersion;
    this.lease = record.hostLease;
    return record;
  }

  async claimLease({ ttlMs = 15000 } = {}) {
    const result = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/lease`, {
      method: 'POST',
      body: JSON.stringify({ action: 'claim', hostId: this.hostId, ttlMs })
    });
    this.lease = result.lease;
    if (this.stateVersion === null) this.stateVersion = result.stateVersion;
    return result;
  }

  async releaseLease() {
    try {
      return await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/lease`, {
        method: 'POST',
        body: JSON.stringify({ action: 'release', hostId: this.hostId })
      });
    } finally {
      this.lease = null;
    }
  }

  async save(checkpoint) {
    if (!Number.isInteger(this.stateVersion)) {
      throw hostError('STATE_VERSION_UNKNOWN', 'headless client has no authoritative checkpoint version');
    }
    const result = await this.request(`/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/checkpoint`, {
      method: 'PUT',
      headers: { 'x-vexworld-host-id': this.hostId },
      body: JSON.stringify({ expectedVersion: this.stateVersion, checkpoint })
    });
    this.stateVersion = result.stateVersion;
    return result;
  }

  async publishObservation(participantRef, observation) {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(this.sessionRef)}/companions/${encodeURIComponent(participantRef)}/observation`,
      {
        method: 'PUT',
        body: JSON.stringify(observation)
      }
    );
  }
}

export class HeadlessRealmHost {
  constructor({
    client,
    worldPackage,
    hostId,
    maxTicks = 600,
    dtMs = FIXED_STEP_MS,
    tickDelayMs = Math.round(FIXED_STEP_MS),
    saveEveryTicks = 60,
    leaseTtlMs = 15000,
    leaseRenewEveryTicks = 240,
    resumePaused = false,
    sleep = delay
  }) {
    if (!client) throw new TypeError('client is required');
    if (!worldPackage || typeof worldPackage !== 'object') throw new TypeError('worldPackage is required');
    if (!/^host\.headless\.[A-Za-z0-9._-]+$/.test(hostId || '')) throw new TypeError('headless hostId must use host.headless.* identity');
    this.client = client;
    this.worldPackage = worldPackage;
    this.hostId = hostId;
    this.maxTicks = positiveInteger(maxTicks, 'maxTicks', { max: 3600 });
    this.dtMs = Number(dtMs);
    if (!Number.isFinite(this.dtMs) || this.dtMs <= 0 || this.dtMs > 100) throw new TypeError('dtMs must be >0 and <=100');
    this.tickDelayMs = Number(tickDelayMs);
    if (!Number.isFinite(this.tickDelayMs) || this.tickDelayMs < 0 || this.tickDelayMs > 1000) throw new TypeError('tickDelayMs must be between 0 and 1000');
    this.saveEveryTicks = positiveInteger(saveEveryTicks, 'saveEveryTicks', { max: 600 });
    this.leaseTtlMs = positiveInteger(leaseTtlMs, 'leaseTtlMs', { min: 1000, max: 60000 });
    this.leaseRenewEveryTicks = positiveInteger(leaseRenewEveryTicks, 'leaseRenewEveryTicks', { max: 600 });
    this.resumePaused = Boolean(resumePaused);
    this.sleep = sleep;
    this.state = null;
    this.started = false;
    this.leaseHeld = false;
    this.dirty = false;
    this.ticksCompleted = 0;
    this.companionObservationsPublished = 0;
    this.companionObservationPublishFailures = 0;
    this.lastCompanionObservationFailure = null;
    this.initialTick = null;
    this.initialNowMs = null;
    this.initialStateVersion = null;
  }

  async start() {
    if (this.started) throw hostError('HOST_ALREADY_STARTED', 'headless realm host already started');
    const record = await this.client.load({ trackVersion: true });
    if (!record?.checkpoint) throw hostError('CHECKPOINT_REQUIRED', 'headless realm host requires an existing accepted checkpoint');
    const checkpoint = structuredClone(record.checkpoint);
    validateGameState(checkpoint);
    const packageIdentity = validateHeadlessWorldPackage(this.worldPackage);
    assertCheckpointWorldPackageCompatibility(checkpoint, packageIdentity);
    if (checkpoint.flags?.paused && !this.resumePaused) {
      throw hostError('PAUSED_CHECKPOINT_REQUIRES_EXPLICIT_RESUME', 'paused checkpoint requires explicit --resume-paused authorization');
    }
    const lease = await this.client.claimLease({ ttlMs: this.leaseTtlMs });
    if (!lease?.accepted) throw hostError('HOST_LEASE_REQUIRED', 'headless realm host could not acquire the session lease');
    this.leaseHeld = true;
    if (checkpoint.flags?.paused && this.resumePaused) checkpoint.flags.paused = false;
    checkpoint.flags.statusOpen = false;
    this.state = checkpoint;
    this.started = true;
    this.initialTick = checkpoint.tick;
    this.initialNowMs = checkpoint.nowMs;
    this.initialStateVersion = this.client.stateVersion;
    return this;
  }

  async readRelayState() {
    const record = await this.client.load({ trackVersion: false });
    const lease = record.hostLease;
    if (!lease || lease.hostId !== this.hostId || Number(lease.expiresAt) <= Date.now()) {
      this.leaseHeld = false;
      throw hostError('HOST_LEASE_LOST', 'headless realm host lease is absent, expired, or owned by another host');
    }
    if (record.stateVersion !== this.client.stateVersion) {
      throw hostError(
        'VERSION_DRIFT_OBSERVED',
        `session checkpoint version moved from ${this.client.stateVersion} to ${record.stateVersion} while headless host held its lease`,
        { observedStateVersion: record.stateVersion }
      );
    }
    return record;
  }

  async renewLease() {
    const result = await this.client.claimLease({ ttlMs: this.leaseTtlMs });
    if (!result?.accepted || result.lease?.hostId !== this.hostId) {
      throw hostError('HOST_LEASE_LOST', 'headless realm host could not renew its own lease');
    }
    this.leaseHeld = true;
    return result;
  }

  async persist() {
    if (!this.started || !this.leaseHeld) throw hostError('HOST_LEASE_REQUIRED', 'cannot persist without active headless host lease');
    const checkpoint = serializeGameState(this.state);
    const result = await this.client.save(checkpoint);
    this.dirty = false;
    return result;
  }

  async publishCompanionObservations() {
    if (!this.started || !this.leaseHeld) {
      throw hostError('HOST_LEASE_REQUIRED', 'cannot publish companion observations without active headless host lease');
    }
    const observations = [];
    for (const companion of getCompanions(this.state.party)) {
      const observation = makeParticipantObservation(
        this.state,
        companion.participantRef,
        this.worldPackage
      );
      try {
        const result = await this.client.publishObservation(companion.participantRef, observation);
        if (!result?.accepted) {
          throw hostError(
            'OBSERVATION_RELAY_REJECTED',
            `headless companion observation relay rejected ${companion.participantRef}`,
            { participantRef: companion.participantRef, result }
          );
        }
        this.companionObservationsPublished += 1;
        observations.push(observation);
      } catch (error) {
        this.companionObservationPublishFailures += 1;
        this.lastCompanionObservationFailure = error?.code || error?.message || 'OBSERVATION_RELAY_UNAVAILABLE';
      }
    }
    return observations;
  }

  async stepOnce() {
    if (!this.started || !this.leaseHeld) throw hostError('HOST_NOT_STARTED', 'headless realm host must start before stepping');
    if (this.ticksCompleted >= this.maxTicks) throw hostError('TICK_BOUND_REACHED', 'headless realm host reached its explicit tick bound');
    const record = await this.readRelayState();
    const externalIntents = record.intents || {};
    stepGame(this.state, EMPTY_HUMAN_INPUT, this.worldPackage, {
      dtMs: this.dtMs,
      externalIntents,
      humanInputAbsent: true
    });
    this.ticksCompleted += 1;
    this.dirty = true;
    await this.publishCompanionObservations();
    if (this.ticksCompleted % this.leaseRenewEveryTicks === 0) await this.renewLease();
    if (this.ticksCompleted % this.saveEveryTicks === 0) await this.persist();
    return this.state;
  }

  async stop({ persist = true } = {}) {
    let firstError = null;
    if (this.started && this.leaseHeld && persist && this.dirty) {
      try {
        await this.persist();
      } catch (error) {
        firstError = error;
      }
    }
    if (this.leaseHeld) {
      try {
        await this.client.releaseLease();
      } catch (error) {
        firstError ||= error;
      } finally {
        this.leaseHeld = false;
      }
    }
    this.started = false;
    if (firstError) throw firstError;
  }

  receipt() {
    if (!this.state) throw hostError('HOST_NOT_STARTED', 'no headless realm receipt exists before start');
    return Object.freeze({
      schemaVersion: 'vexworld.headless-realm-host-receipt/v1',
      hostClass: 'HEADLESS_REALM_HOST',
      hostId: this.hostId,
      participantIdentityClaimed: false,
      ticksCompleted: this.ticksCompleted,
      companionObservationsPublished: this.companionObservationsPublished,
      companionObservationPublishFailures: this.companionObservationPublishFailures,
      lastCompanionObservationFailure: this.lastCompanionObservationFailure,
      offscreenCompanionObservationSource: 'HEADLESS_CANONICAL_STATE',
      initialTick: this.initialTick,
      finalTick: this.state.tick,
      simulationMsAdvanced: Number((this.state.nowMs - this.initialNowMs).toFixed(6)),
      initialStateVersion: this.initialStateVersion,
      finalStateVersion: this.client.stateVersion,
      wallClockCatchUp: false,
      humanInputFabricated: false,
      physicalEffectPossible: this.state.realityContext?.physicalEffectPossible,
      humanGameFeel: 'UNPROVEN',
      disposition: 'PASS_BOUNDED_HEADLESS_REALM_CONTINUITY'
    });
  }

  async run() {
    await this.start();
    let failure = null;
    try {
      for (let index = 0; index < this.maxTicks; index += 1) {
        await this.stepOnce();
        if (this.tickDelayMs > 0 && index + 1 < this.maxTicks) await this.sleep(this.tickDelayMs);
      }
    } catch (error) {
      failure = error;
    }
    try {
      await this.stop({ persist: failure === null });
    } catch (error) {
      failure ||= error;
    }
    if (failure) throw failure;
    return this.receipt();
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseHeadlessRealmArgs(argv);
  const worldPackage = JSON.parse(await readFile(options.worldPackage, 'utf8'));
  const client = new HeadlessSessionClient({
    baseUrl: options.server,
    token: options.token,
    sessionRef: options.session,
    hostId: options.hostId
  });
  const host = new HeadlessRealmHost({
    client,
    worldPackage,
    hostId: options.hostId,
    maxTicks: options.ticks,
    tickDelayMs: options.tickDelayMs,
    saveEveryTicks: options.saveEveryTicks,
    leaseTtlMs: options.leaseTtlMs,
    leaseRenewEveryTicks: options.leaseRenewEveryTicks,
    resumePaused: options.resumePaused
  });
  const receipt = await host.run();
  console.log(JSON.stringify(receipt, null, 2));
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => {
    console.error(`${error.code || 'HEADLESS_REALM_ERROR'}: ${error.message}`);
    process.exitCode = 1;
  });
}
