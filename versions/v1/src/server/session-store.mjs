import { promises as fs } from 'node:fs';
import path from 'node:path';

const SESSION_ID = /^[a-zA-Z0-9._-]{1,96}$/;
const PARTICIPANT_ID = /^[a-zA-Z0-9._-]{1,160}$/;
const WINDOWS_REPLACE_RETRY_CODES = new Set(['EPERM', 'EBUSY']);
const DEFAULT_WINDOWS_REPLACE_RETRY_DELAYS_MS = Object.freeze([8, 24, 60, 120]);

function assertId(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(`invalid ${label}`);
}

function emptyRecord(sessionRef) {
  return {
    schemaVersion: 'vexworld.session/v1',
    sessionRef,
    stateVersion: 0,
    checkpoint: null,
    hostLease: null,
    observations: {},
    intents: {},
    utterances: {},
    workers: {},
    updatedAt: Date.now()
  };
}

function normalizeRecord(record) {
  if (!record.observations || typeof record.observations !== 'object') record.observations = {};
  if (!record.intents || typeof record.intents !== 'object') record.intents = {};
  if (!record.utterances || typeof record.utterances !== 'object') record.utterances = {};
  if (!record.workers || typeof record.workers !== 'object') record.workers = {};
  return record;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SessionStore {
  constructor(rootDirectory, {
    platform = process.platform,
    rename = fs.rename,
    remove = fs.rm,
    sleep = defaultSleep,
    windowsReplaceRetryDelaysMs = DEFAULT_WINDOWS_REPLACE_RETRY_DELAYS_MS
  } = {}) {
    this.rootDirectory = rootDirectory;
    this.locks = new Map();
    this.platform = platform;
    this.rename = rename;
    this.remove = remove;
    this.sleep = sleep;
    this.windowsReplaceRetryDelaysMs = [...windowsReplaceRetryDelaysMs];
  }

  sessionPath(sessionRef) {
    assertId(sessionRef, SESSION_ID, 'sessionRef');
    return path.join(this.rootDirectory, `${sessionRef}.json`);
  }

  async withLock(sessionRef, fn) {
    const prior = this.locks.get(sessionRef) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = prior.then(() => current);
    this.locks.set(sessionRef, tail);
    await prior;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(sessionRef) === tail) this.locks.delete(sessionRef);
    }
  }

  async read(sessionRef) {
    const file = this.sessionPath(sessionRef);
    try {
      return normalizeRecord(JSON.parse(await fs.readFile(file, 'utf8')));
    } catch (error) {
      if (error.code === 'ENOENT') return emptyRecord(sessionRef);
      throw error;
    }
  }

  isRetryableWindowsReplaceError(error) {
    return this.platform === 'win32' && WINDOWS_REPLACE_RETRY_CODES.has(error?.code);
  }

  async replaceTemporaryFile(temporary, destination) {
    let retryIndex = 0;
    while (true) {
      try {
        await this.rename(temporary, destination);
        return;
      } catch (error) {
        const canRetry =
          this.isRetryableWindowsReplaceError(error) &&
          retryIndex < this.windowsReplaceRetryDelaysMs.length;
        if (!canRetry) throw error;
        const delayMs = this.windowsReplaceRetryDelaysMs[retryIndex];
        retryIndex += 1;
        await this.sleep(delayMs);
      }
    }
  }

  async cleanupTemporaryFile(temporary) {
    try {
      await this.remove(temporary, { force: true });
    } catch {
      // Best-effort cleanup only. Never let cleanup mask the original write error.
    }
  }

  async write(record) {
    await fs.mkdir(this.rootDirectory, { recursive: true });
    const file = this.sessionPath(record.sessionRef);
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(record, null, 2) + '\n');
    let replaced = false;
    try {
      await this.replaceTemporaryFile(temporary, file);
      replaced = true;
      return record;
    } finally {
      if (!replaced) await this.cleanupTemporaryFile(temporary);
    }
  }

  async claimLease(sessionRef, hostId, { now = Date.now(), ttlMs = 15000 } = {}) {
    assertId(hostId, PARTICIPANT_ID, 'hostId');
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      const current = record.hostLease;
      const available = !current || current.expiresAt <= now || current.hostId === hostId;
      if (!available) return { accepted: false, reason: 'LEASE_HELD', lease: current, stateVersion: record.stateVersion };
      const generation = current?.hostId === hostId ? current.generation : (current?.generation || 0) + 1;
      record.hostLease = { hostId, generation, claimedAt: current?.hostId === hostId ? current.claimedAt : now, renewedAt: now, expiresAt: now + ttlMs };
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, lease: record.hostLease, stateVersion: record.stateVersion };
    });
  }

  async releaseLease(sessionRef, hostId, { now = Date.now() } = {}) {
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      if (!record.hostLease || record.hostLease.hostId !== hostId) return { accepted: false, reason: 'NOT_LEASE_HOLDER' };
      record.hostLease = null;
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true };
    });
  }

  async writeCheckpoint(sessionRef, hostId, expectedVersion, checkpoint, { now = Date.now() } = {}) {
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      if (!record.hostLease || record.hostLease.hostId !== hostId || record.hostLease.expiresAt <= now) {
        return { accepted: false, reason: 'VALID_HOST_LEASE_REQUIRED', stateVersion: record.stateVersion };
      }
      if (!Number.isInteger(expectedVersion) || expectedVersion !== record.stateVersion) {
        return { accepted: false, reason: 'VERSION_CONFLICT', stateVersion: record.stateVersion };
      }
      record.stateVersion += 1;
      record.checkpoint = checkpoint;
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, stateVersion: record.stateVersion, updatedAt: record.updatedAt };
    });
  }

  async putObservation(sessionRef, participantRef, observation, { now = Date.now() } = {}) {
    assertId(participantRef, PARTICIPANT_ID, 'participantRef');
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      const prior = record.observations[participantRef];
      if (prior && Number(observation.sequence) < Number(prior.sequence)) return { accepted: false, reason: 'STALE_SEQUENCE' };
      record.observations[participantRef] = { ...observation, relayedAt: now };
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, sequence: observation.sequence };
    });
  }

  async putIntent(sessionRef, participantRef, intent, { now = Date.now() } = {}) {
    assertId(participantRef, PARTICIPANT_ID, 'participantRef');
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      const prior = record.intents[participantRef];
      if (prior && Number(intent.sequence) <= Number(prior.sequence)) return { accepted: false, reason: 'STALE_SEQUENCE' };
      record.intents[participantRef] = { ...intent, relayedAt: now };
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, sequence: intent.sequence };
    });
  }

  async putUtterance(sessionRef, participantRef, utterance, { now = Date.now() } = {}) {
    assertId(participantRef, PARTICIPANT_ID, 'participantRef');
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      const prior = record.utterances[participantRef];
      if (prior && Number(utterance.sequence) <= Number(prior.sequence)) return { accepted: false, reason: 'STALE_SEQUENCE' };
      record.utterances[participantRef] = { ...utterance, relayedAt: now };
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, sequence: utterance.sequence };
    });
  }

  async heartbeat(sessionRef, participantRef, worker, { now = Date.now() } = {}) {
    assertId(participantRef, PARTICIPANT_ID, 'participantRef');
    return this.withLock(sessionRef, async () => {
      const record = await this.read(sessionRef);
      record.workers[participantRef] = { ...worker, lastSeenAt: now };
      record.updatedAt = now;
      await this.write(record);
      return { accepted: true, lastSeenAt: now };
    });
  }
}
