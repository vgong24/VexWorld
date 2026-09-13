import test from 'node:test';
import assert from 'node:assert/strict';
import { selectEffectiveIntent, validateCompanionIntent } from '../src/core/controllers.mjs';

function remoteCompanion({
  lastIntentSequence = 0,
  lastIntentAt = 0,
  currentBand = 'RESTORATION_RECOMMENDED'
} = {}) {
  return {
    controllerBinding: {
      controllerClass: 'REMOTE_OLLAMA',
      lastIntentSequence,
      lastIntentAt
    },
    flags: {},
    resources: { currentBand }
  };
}

test('remote companion intent is high-level, sequenced, and expiring', () => {
  const now = Date.now();
  assert.equal(validateCompanionIntent({ intentType: 'FOLLOW_HUMAN', sequence: 1, formedAt: now, expiresAt: now + 1000 }).valid, true);
  assert.equal(validateCompanionIntent({ intentType: 'WRITE_FILE', sequence: 1, formedAt: now, expiresAt: now + 1000 }).valid, false);
});

test('expired remote intent cannot remain motor authority and falls back visibly to party cohesion', () => {
  const companion = remoteCompanion({ lastIntentSequence: 4, lastIntentAt: 1000 });
  const expired = {
    intentType: 'EXPLORE_RIGHT',
    sequence: 5,
    formedAt: 1100,
    expiresAt: 1200
  };

  const effective = selectEffectiveIntent({
    companion,
    remoteIntent: expired,
    localContext: {},
    nowMs: 7000
  });

  assert.equal(effective.intentType, 'FOLLOW_HUMAN');
  assert.equal(effective.reason, 'REMOTE_STALE_SAFE_FALLBACK');
  assert.equal(companion.controllerBinding.lastIntentSequence, 4);
  assert.equal(companion.flags.remoteIntentStale, true);
});

test('non-increasing remote sequence is rejected even when not expired', () => {
  const companion = remoteCompanion({ lastIntentSequence: 7, lastIntentAt: 9000 });
  const replay = {
    intentType: 'EXPLORE_LEFT',
    sequence: 7,
    formedAt: 9500,
    expiresAt: 11000
  };

  const effective = selectEffectiveIntent({
    companion,
    remoteIntent: replay,
    localContext: {},
    nowMs: 10000
  });

  assert.equal(effective.intentType, 'FOLLOW_HUMAN');
  assert.equal(effective.reason, 'REMOTE_STALE_SAFE_FALLBACK');
  assert.equal(companion.controllerBinding.lastIntentSequence, 7);
});

test('remote stale fallback prioritizes restoration under protective resource band', () => {
  const companion = remoteCompanion({
    lastIntentSequence: 3,
    lastIntentAt: 0,
    currentBand: 'PROTECTIVE_RETURN_OR_HALT'
  });

  const effective = selectEffectiveIntent({
    companion,
    remoteIntent: null,
    localContext: {},
    nowMs: 20000
  });

  assert.equal(effective.intentType, 'RETURN_TO_RESTORATION');
  assert.equal(effective.reason, 'REMOTE_STALE_PROTECTIVE_FALLBACK');
  assert.equal(companion.flags.remoteIntentStale, true);
});

// [VXG RealForever]
