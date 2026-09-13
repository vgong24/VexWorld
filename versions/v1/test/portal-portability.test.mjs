import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
import { resolvePortableCapability, resolvePortableSemantic } from '../src/core/portal.mjs';

test('First Grove compiles a distinct portable item identity and preserves Twin Horizon ability identity', async () => {
  const worldPackage = await compileFirstGrove();
  const item = worldPackage.catalogs.items.items.find((entry) => entry.itemRef === 'item.vexworld.sunshower-bell');
  const ability = worldPackage.catalogs.abilities.abilities.find((entry) => entry.abilityRef === 'ability.vexworld.twin-horizon');
  const scenario = worldPackage.scenarios.find((entry) => entry.scenarioRef === 'scenario.vexworld.dim0.item-ability-portability');

  assert.ok(item);
  assert.equal(item.archetypeRef, 'archetype.world.item');
  assert.equal(item.originWorldRef, worldPackage.manifest.worldRef);
  assert.equal(item.sourceDiscoveryRef, 'discovery.first-grove.sunshower-bell');
  assert.notEqual(item.itemRef, item.sourceDiscoveryRef, 'DISCOVERY != ITEM');
  assert.equal(item.portable, true);
  assert.ok(ability);
  assert.equal(ability.abilityRef, 'ability.vexworld.twin-horizon');
  assert.ok(scenario);
  assert.equal(scenario.startingState.finalDestinationWorldSelected, false);
  assert.ok(worldPackage.compiledFrom.some((entry) => entry.relativePath === 'world/items.json'));
  assert.ok(worldPackage.compiledFrom.some((entry) => entry.relativePath === 'worlds/first-grove/scenarios/dimensional-portability.json'));
});

test('item catalog does not make First Grove discovery, First Grove origin, or portability universal item law', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'vexworld-portable-item-catalog-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await cp('world', path.join(root, 'world'), { recursive: true });
  await cp('worlds', path.join(root, 'worlds'), { recursive: true });

  const itemsPath = path.join(root, 'world/items.json');
  const catalog = JSON.parse(await readFile(itemsPath, 'utf8'));
  catalog.items.push({
    itemRef: 'item.synthetic.foreign-keepsake',
    title: 'Foreign Keepsake Fixture',
    archetypeRef: 'archetype.world.item',
    originWorldRef: 'world.synthetic.foreign-origin',
    portable: false
  });
  await writeFile(itemsPath, JSON.stringify(catalog, null, 2) + '\n');

  const packageWithForeignItem = await compileFirstGrove({ root });
  const foreign = packageWithForeignItem.catalogs.items.items.find((entry) => entry.itemRef === 'item.synthetic.foreign-keepsake');
  assert.ok(foreign);
  assert.equal(foreign.originWorldRef, 'world.synthetic.foreign-origin');
  assert.equal(foreign.portable, false);
  assert.equal(Object.hasOwn(foreign, 'sourceDiscoveryRef'), false);

  catalog.items[0].sourceDiscoveryRef = 'discovery.first-grove.missing';
  await writeFile(itemsPath, JSON.stringify(catalog, null, 2) + '\n');
  await assert.rejects(
    compileFirstGrove({ root }),
    /unknown item discovery discovery\.first-grove\.missing/
  );
});

test('synthetic destination changes expression and restrictions without replacing source item or ability identity', async () => {
  const worldPackage = await compileFirstGrove();
  const item = worldPackage.catalogs.items.items.find((entry) => entry.itemRef === 'item.vexworld.sunshower-bell');
  const ability = worldPackage.catalogs.abilities.abilities.find((entry) => entry.abilityRef === 'ability.vexworld.twin-horizon');
  const destinationAdapter = {
    destinationRef: 'destination.synthetic.dim0.contract-proof',
    syntheticProof: true,
    finalDestinationWorldSelected: false,
    portabilityMappings: {
      [item.itemRef]: {
        disposition: 'TRANSFORMED_EQUIVALENT',
        destinationExpressionRef: 'expression.synthetic.dim0.sunshower-chime',
        changedProperties: ['rendering', 'interactionBinding'],
        reason: 'SYNTHETIC_EXPRESSION_TRANSLATION'
      },
      [ability.abilityRef]: {
        disposition: 'TRANSFORMED_RESTRICTED',
        destinationExpressionRef: 'expression.synthetic.dim0.twin-horizon-radial',
        changedProperties: ['rendering', 'timingEnvelope'],
        reason: 'SYNTHETIC_DESTINATION_TIMING_RESTRICTION'
      }
    }
  };

  const itemProjection = resolvePortableSemantic({
    sourceRef: item.itemRef,
    semanticType: 'ITEM',
    destinationAdapter
  });
  const abilityProjection = resolvePortableSemantic({
    sourceRef: ability.abilityRef,
    semanticType: 'ABILITY',
    destinationAdapter
  });

  assert.equal(itemProjection.sourceRef, item.itemRef);
  assert.equal(itemProjection.semanticType, 'ITEM');
  assert.equal(itemProjection.destinationRef, destinationAdapter.destinationRef);
  assert.equal(itemProjection.disposition, 'TRANSFORMED_EQUIVALENT');
  assert.equal(itemProjection.destinationExpressionRef, 'expression.synthetic.dim0.sunshower-chime');
  assert.deepEqual(itemProjection.changedProperties, ['rendering', 'interactionBinding']);

  assert.equal(abilityProjection.sourceRef, ability.abilityRef);
  assert.equal(abilityProjection.semanticType, 'ABILITY');
  assert.equal(abilityProjection.destinationRef, destinationAdapter.destinationRef);
  assert.equal(abilityProjection.disposition, 'TRANSFORMED_RESTRICTED');
  assert.equal(abilityProjection.destinationExpressionRef, 'expression.synthetic.dim0.twin-horizon-radial');
  assert.deepEqual(abilityProjection.changedProperties, ['rendering', 'timingEnvelope']);

  assert.notEqual(itemProjection.destinationExpressionRef, itemProjection.sourceRef);
  assert.notEqual(abilityProjection.destinationExpressionRef, abilityProjection.sourceRef);
  assert.equal(destinationAdapter.syntheticProof, true);
  assert.equal(destinationAdapter.finalDestinationWorldSelected, false);
});

test('undeclared portability mappings fail closed and malformed declared mappings are rejected', () => {
  const destinationAdapter = {
    destinationRef: 'destination.synthetic.dim0.contract-proof',
    portabilityMappings: {}
  };
  const unknown = resolvePortableSemantic({
    sourceRef: 'item.vexworld.unmapped',
    semanticType: 'ITEM',
    destinationAdapter
  });
  assert.deepEqual(unknown, {
    sourceRef: 'item.vexworld.unmapped',
    semanticType: 'ITEM',
    destinationRef: destinationAdapter.destinationRef,
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    changedProperties: [],
    reason: 'NO_DECLARED_MAPPING'
  });

  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'item.vexworld.unmapped',
      semanticType: 'ITEM',
      destinationAdapter: { portabilityMappings: {} }
    }),
    /destinationAdapter\.destinationRef must be a non-empty string/
  );
  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'ability.vexworld.twin-horizon',
      semanticType: 'ABILITY',
      destinationAdapter: {
        destinationRef: destinationAdapter.destinationRef,
        portabilityMappings: {
          'ability.vexworld.twin-horizon': { disposition: 'ASSUME_COMPATIBLE' }
        }
      }
    }),
    /invalid compatibility disposition/
  );
  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'ability.vexworld.twin-horizon',
      semanticType: 'ABILITY',
      destinationAdapter: {
        destinationRef: destinationAdapter.destinationRef,
        portabilityMappings: {
          'ability.vexworld.twin-horizon': {
            disposition: 'TRANSFORMED_RESTRICTED',
            reason: 'MISSING_CHANGED_PROPERTIES'
          }
        }
      }
    }),
    /portable mapping changedProperties must be an array/
  );
  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'ability.vexworld.twin-horizon',
      semanticType: 'ABILITY',
      destinationAdapter: {
        destinationRef: destinationAdapter.destinationRef,
        portabilityMappings: {
          'ability.vexworld.twin-horizon': {
            disposition: 'TRANSFORMED_RESTRICTED',
            changedProperties: [] ,
            reason: 'EMPTY_TRANSFORM_EVIDENCE'
          }
        }
      }
    }),
    /transformed portable mapping must declare changedProperties/
  );
  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'ability.vexworld.twin-horizon',
      semanticType: 'ABILITY',
      destinationAdapter: {
        destinationRef: destinationAdapter.destinationRef,
        portabilityMappings: {
          'ability.vexworld.twin-horizon': {
            disposition: 'TRANSFORMED_RESTRICTED',
            changedProperties: ['timingEnvelope']
          }
        }
      }
    }),
    /portable mapping reason must be a non-empty string/
  );
  assert.throws(
    () => resolvePortableSemantic({
      sourceRef: 'capability.not-an-item-or-ability',
      semanticType: 'CAPABILITY',
      destinationAdapter
    }),
    /semanticType must be ITEM or ABILITY/
  );
});

test('legacy capability resolver remains compatible with capabilityMappings even when portabilityMappings collide', () => {
  const mapped = resolvePortableCapability({
    capability: { capabilityRef: 'capability.example' },
    destinationAdapter: {
      portabilityMappings: {
        'capability.example': {
          disposition: 'NATIVE',
          destinationExpressionRef: 'expression.synthetic.must-not-win',
          changedProperties: [],
          reason: 'NEW_NAMESPACE_MUST_NOT_OVERRIDE_LEGACY'
        }
      },
      capabilityMappings: {
        'capability.example': {
          disposition: 'PRESENT_BUT_INACTIVE',
          destinationExpressionRef: null,
          changedProperties: ['availability'],
          reason: 'DESTINATION_DOES_NOT_ENABLE_CAPABILITY'
        }
      }
    }
  });
  assert.deepEqual(mapped, {
    capabilityRef: 'capability.example',
    disposition: 'PRESENT_BUT_INACTIVE',
    destinationExpressionRef: null,
    changedProperties: ['availability'],
    reason: 'DESTINATION_DOES_NOT_ENABLE_CAPABILITY'
  });

  const unknown = resolvePortableCapability({
    capability: { capabilityRef: 'capability.unmapped' },
    destinationAdapter: { capabilityMappings: {} }
  });
  assert.deepEqual(unknown, {
    capabilityRef: 'capability.unmapped',
    disposition: 'UNKNOWN_BLOCKED',
    destinationExpressionRef: null,
    reason: 'NO_DECLARED_MAPPING'
  });
});
