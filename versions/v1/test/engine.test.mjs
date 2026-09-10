import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
import { createInitialGame, makeParticipantObservation, runHeadless, stepGame, validateGameState } from '../src/core/engine.mjs';

const worldPackage = await compileFirstGrove();

test('headless world advances without a renderer and supports a four-member party', () => {
  const state=runHeadless(worldPackage,{ steps:240, setup:{ companions:[{displayName:'Vex'},{displayName:'Mira'},{displayName:'Rowan'}] }, inputFactory:(step)=>({right:step<180,jumpPressed:step===20}) });
  assert.equal(state.party.members.length,4);
  assert.ok(state.nowMs>3000);
  assert.equal(state.realityContext.physicalEffectPossible,false);
  assert.equal(validateGameState(state),true);
});

test('observer-relative companion packet exposes affordances without source omniscience', () => {
  const state=createInitialGame(worldPackage,{companions:[{displayName:'Vex'}]});
  const companion=state.party.members[1];
  const observation=makeParticipantObservation(state,companion.participantRef,worldPackage);
  assert.equal(observation.observerParticipantRef,companion.participantRef);
  assert.ok(observation.affordances.includes('FOLLOW_HUMAN'));
  assert.equal(observation.physicalEffectPossible,false);
  assert.equal('worldSource' in observation,false);
});

test('prototype weather can change and state remains valid', () => {
  const state=createInitialGame(worldPackage,{companions:[{displayName:'Vex'}]});
  stepGame(state,{weatherPressed:true},worldPackage);
  assert.equal(state.weather.state,'RAIN');
  assert.equal(validateGameState(state),true);
});
