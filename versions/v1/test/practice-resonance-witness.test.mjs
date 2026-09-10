import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPractice } from '../src/core/practice.mjs';
import { createBondResonanceProfile, recordResonanceEvent } from '../src/core/resonance.mjs';
import { createWorldWitnessState, maybeFormTwinHorizonSeed, witnessEligibleEvent } from '../src/core/world-witness.mjs';

const laws = { worldWitness: { minimumEligibleSyncEvents:3, minimumDistinctTargets:2 } };

test('varied practice grows faster than trivial repetition', () => {
  const varied = { practice:{} };
  const repeated = { practice:{} };
  for (let index=0; index<8; index+=1) {
    recordPractice(repeated,'practice.test',{ success:true, targetRef:'same', contextRef:'same' });
    recordPractice(varied,'practice.test',{ success:true, difficulty:1, targetRef:`target.${index}`, contextRef:`context.${index}`, novel:true, transfer:index>4 });
  }
  assert.ok(varied.practice['practice.test'].evidence > repeated.practice['practice.test'].evidence * 2);
});

test('World Witness forms a pair-scoped candidate without granting mastery', () => {
  const profile = createBondResonanceProfile(['participant.victor','participant.companion.vex']);
  recordResonanceEvent(profile,{ eventRef:'res.1', facetDeltas:{ coordination:4, sharedPractice:3 } });
  const state = createWorldWitnessState();
  for (const [index,target] of ['enemy.a','enemy.b','enemy.c'].entries()) {
    const accepted = witnessEligibleEvent(state,{
      eventRef:`event.${index}`, eligible:true, patternClass:'HIGH_LOW_COORDINATION', result:'EXCELLENT_SYNC', targetRef:target,
      participantRefs:['participant.victor','participant.companion.vex']
    });
    assert.equal(accepted.accepted,true);
  }
  const seed = maybeFormTwinHorizonSeed({ state, resonanceProfile:profile, laws });
  assert.equal(seed.state,'TRIAL_READY');
  assert.equal(seed.effects.learnedAbilityGranted,false);
  assert.match(seed.techniqueSeedRef,/(victor-vex|vex-victor)/);
});

test('World Witness rejects hidden scoring and private relationship injection', () => {
  const state=createWorldWitnessState();
  const result=witnessEligibleEvent(state,{ eventRef:'bad', eligible:true, affectionScore:99 });
  assert.equal(result.accepted,false);
  assert.equal(state.eligibleEvents.length,0);
});
