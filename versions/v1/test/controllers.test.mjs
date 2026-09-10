import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompanionIntent } from '../src/core/controllers.mjs';

test('remote companion intent is high-level, sequenced, and expiring', () => {
  const now=Date.now();
  assert.equal(validateCompanionIntent({ intentType:'FOLLOW_HUMAN', sequence:1, formedAt:now, expiresAt:now+1000 }).valid,true);
  assert.equal(validateCompanionIntent({ intentType:'WRITE_FILE', sequence:1, formedAt:now, expiresAt:now+1000 }).valid,false);
});
