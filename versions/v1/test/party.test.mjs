import test from 'node:test';
import assert from 'node:assert/strict';
import { createParty, rebindController, validateParty } from '../src/core/party.mjs';
import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';

const worldPackage = await compileFirstGrove();

test('party supports one human plus up to three distinct companions', () => {
  const party = createParty({
    worldPackage,
    setup: {
      human: { displayName: 'Victor' },
      companions: ['Vex','Mira','Rowan'].map((displayName) => ({ displayName }))
    }
  });
  assert.equal(party.members.length, 4);
  assert.equal(new Set(party.members.map((member) => member.participantRef)).size, 4);
  assert.equal(validateParty(party), true);
});

test('controller rebinding does not change companion identity or lineage', () => {
  const party = createParty({ worldPackage, setup: { companions: [{ displayName: 'Vex' }] } });
  const companion = party.members[1];
  const identity = companion.participantRef;
  const lineage = companion.lineageRef;
  rebindController(companion, { controllerClass: 'REMOTE_OLLAMA', endpoint: 'worker.mac' });
  assert.equal(companion.participantRef, identity);
  assert.equal(companion.lineageRef, lineage);
  assert.equal(companion.controllerBinding.controllerClass, 'REMOTE_OLLAMA');
});
