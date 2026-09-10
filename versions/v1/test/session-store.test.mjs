import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/server/session-store.mjs';

test('session store enforces one host lease and optimistic state version', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'vexworld-session-'));
  try {
    const store=new SessionStore(directory);
    const a=await store.claimLease('session.test','host.a',{now:1000,ttlMs:1000});
    assert.equal(a.accepted,true);
    const b=await store.claimLease('session.test','host.b',{now:1500,ttlMs:1000});
    assert.equal(b.accepted,false);
    const write=await store.writeCheckpoint('session.test','host.a',0,{hello:'world'},{now:1600});
    assert.equal(write.accepted,true);
    assert.equal(write.stateVersion,1);
    const stale=await store.writeCheckpoint('session.test','host.a',0,{hello:'stale'},{now:1700});
    assert.equal(stale.reason,'VERSION_CONFLICT');
    const takeover=await store.claimLease('session.test','host.b',{now:2200,ttlMs:1000});
    assert.equal(takeover.accepted,true);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('observations and intents preserve monotonic sequence', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'vexworld-relay-'));
  try {
    const store=new SessionStore(directory);
    assert.equal((await store.putObservation('s','participant.vex',{sequence:2})).accepted,true);
    assert.equal((await store.putObservation('s','participant.vex',{sequence:1})).accepted,false);
    assert.equal((await store.putIntent('s','participant.vex',{sequence:1})).accepted,true);
    assert.equal((await store.putIntent('s','participant.vex',{sequence:1})).accepted,false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
