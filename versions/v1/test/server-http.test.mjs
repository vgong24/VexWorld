import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createVexWorldServer } from '../src/server/server.mjs';

test('LAN development API supports lease, checkpoint, observation, and intent relay', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'vexworld-http-'));
  const token='test-token';
  const {server}=createVexWorldServer({host:'127.0.0.1',port:0,token,dataDirectory:directory});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  const base=`http://127.0.0.1:${address.port}`;
  const headers={'content-type':'application/json',authorization:`Bearer ${token}`};
  try {
    const health=await fetch(`${base}/api/v1/health`,{headers});
    assert.equal(health.status,200);
    const lease=await fetch(`${base}/api/v1/sessions/demo/lease`,{method:'POST',headers,body:JSON.stringify({action:'claim',hostId:'host.a'})});
    assert.equal(lease.status,200);
    const checkpoint=await fetch(`${base}/api/v1/sessions/demo/checkpoint`,{method:'PUT',headers:{...headers,'x-vexworld-host-id':'host.a'},body:JSON.stringify({expectedVersion:0,checkpoint:{state:'hello'}})});
    assert.equal(checkpoint.status,200);
    const observation=await fetch(`${base}/api/v1/sessions/demo/companions/participant.vex/observation`,{method:'PUT',headers,body:JSON.stringify({sequence:1,hello:'vex'})});
    assert.equal(observation.status,200);
    const intent=await fetch(`${base}/api/v1/sessions/demo/companions/participant.vex/intent`,{method:'PUT',headers,body:JSON.stringify({sequence:1,intentType:'FOLLOW_HUMAN'})});
    assert.equal(intent.status,200);
    const record=await fetch(`${base}/api/v1/sessions/demo`,{headers}).then(r=>r.json());
    assert.equal(record.stateVersion,1);
    assert.equal(record.observations['participant.vex'].hello,'vex');
  } finally {
    await new Promise((resolve)=>server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
