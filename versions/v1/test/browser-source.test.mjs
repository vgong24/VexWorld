import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildReturnReconciliation } from '../src/web/network-client.mjs';

test('browser entry exposes setup, game canvas, status, party, communication, and explicit return surfaces', async () => {
  const html=await readFile('src/web/index.html','utf8');
  assert.match(html,/id="game"/);
  assert.match(html,/Garden of Arrival/);
  assert.match(html,/companion-count/);
  assert.match(html,/status-panel/);
  assert.match(html,/id="companion-bubbles"/);
  assert.match(html,/id="dialogue-log"/);
  assert.match(html,/role="log"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/Expression only — not memory, world law, relationship worth, or motor authority/);

  const app=await readFile('src/web/app.mjs','utf8');
  assert.match(app,/createInitialGame/);
  assert.match(app,/buildReturnReconciliation/);
  assert.match(app,/ServerSessionClient/);
  assert.match(app,/pollUtterance/);
  assert.match(app,/maybeEmitLocalCommunication/);
  assert.match(app,/formCompanionUtterance/);
  assert.match(app,/REMOTE_CHECKPOINT_PRESENT/);
  assert.match(app,/WAIT_FOR_RELEASE_OR_EXPIRY/);
  assert.match(app,/RETURN_REFRESH_REQUIRED/);
  assert.match(app,/const current = await activeClient\.load\(\)/);
  assert.match(app,/visiblePreviewVersion !== prior\.stateVersion/);
  assert.match(app,/prior\.stateVersion !== current\.stateVersion/);
  assert.match(app,/display-only return context — not memory, world law, relationship worth, or private conversation history/);

  const styles=await readFile('src/web/styles.css','utf8');
  assert.match(styles,/#companion-bubbles/);
  assert.match(styles,/#dialogue-log/);
});

test('return reconciliation is factual, checkpoint-bound, and refuses a live foreign lease', () => {
  const localCheckpoint = {
    sessionRef: 'realm.return-test',
    tick: 10,
    nowMs: 1000,
    firstGrove: { currentRegionRef: 'region.first-grove.hearth' },
    receipts: [
      { receiptRef: 'receipt.old.0001', type: 'OLD_EVENT', at: 900 }
    ]
  };
  const record = {
    sessionRef: 'realm.return-test',
    stateVersion: 7,
    hostLease: {
      hostId: 'host.headless.return-test',
      generation: 3,
      expiresAt: 5000
    },
    checkpoint: {
      sessionRef: 'realm.return-test',
      tick: 16,
      nowMs: 1600,
      firstGrove: { currentRegionRef: 'region.first-grove.rain-path' },
      receipts: [
        { receiptRef: 'receipt.old.0001', type: 'OLD_EVENT', at: 900, privateNote: 'must not project' },
        { receiptRef: 'receipt.weather.0002', type: 'WEATHER_CHANGED', at: 1200, privateNote: 'must not project' }
      ],
      messages: [{ speaker: 'Companion', text: 'not return memory' }]
    },
    utterances: {
      'participant.vex': { text: 'ephemeral private expression' }
    }
  };

  const projection = buildReturnReconciliation(record, localCheckpoint, {
    hostId: 'host.browser.return-test',
    now: 2000
  });

  assert.equal(projection.schemaVersion, 'vexworld.return-reconciliation/v1');
  assert.equal(projection.stateVersion, 7);
  assert.equal(projection.canonicalCheckpointPresent, true);
  assert.equal(projection.canonicalTick, 16);
  assert.equal(projection.canonicalNowMs, 1600);
  assert.equal(projection.localBaselineUsed, true);
  assert.equal(projection.ticksAdvanced, 6);
  assert.equal(projection.simulationMsAdvanced, 600);
  assert.equal(projection.fromRegionRef, 'region.first-grove.hearth');
  assert.equal(projection.currentRegionRef, 'region.first-grove.rain-path');
  assert.equal(projection.takeoverState, 'WAIT_FOR_RELEASE_OR_EXPIRY');
  assert.deepEqual(projection.recentCanonicalReceipts, [
    { receiptRef: 'receipt.weather.0002', type: 'WEATHER_CHANGED', at: 1200 }
  ]);
  assert.equal(projection.projectionOnly, true);
  assert.equal(projection.privateConversationImported, false);
  assert.equal(projection.relationshipWorthInferred, false);
  assert.equal(projection.narrativeInvented, false);
  assert.equal(Object.hasOwn(projection, 'messages'), false);
  assert.equal(Object.hasOwn(projection, 'utterances'), false);
  assert.doesNotMatch(JSON.stringify(projection), /privateNote|not return memory|ephemeral private expression/);
});

test('return reconciliation permits claim after expiry and ignores a foreign local-session baseline', () => {
  const record = {
    sessionRef: 'realm.canonical',
    stateVersion: 11,
    hostLease: {
      hostId: 'host.headless.expired',
      generation: 4,
      expiresAt: 999
    },
    checkpoint: {
      sessionRef: 'realm.canonical',
      tick: 42,
      nowMs: 4200,
      firstGrove: { currentRegionRef: 'region.first-grove.echo-gate' },
      receipts: [{ receiptRef: 'receipt.canonical.0007', type: 'CANONICAL_EVENT', at: 4100 }]
    }
  };
  const unrelatedLocal = {
    sessionRef: 'realm.other',
    tick: 999,
    nowMs: 99999,
    firstGrove: { currentRegionRef: 'region.other' },
    receipts: [{ receiptRef: 'receipt.other.0001', type: 'OTHER', at: 1 }]
  };

  const projection = buildReturnReconciliation(record, unrelatedLocal, {
    hostId: 'host.browser.return-test',
    now: 1000
  });

  assert.equal(projection.takeoverState, 'READY_TO_CLAIM');
  assert.equal(projection.liveLease, null);
  assert.equal(projection.localBaselineUsed, false);
  assert.equal(projection.ticksAdvanced, null);
  assert.equal(projection.simulationMsAdvanced, null);
  assert.equal(projection.fromRegionRef, null);
  assert.equal(projection.currentRegionRef, 'region.first-grove.echo-gate');
  assert.deepEqual(projection.recentCanonicalReceipts, [
    { receiptRef: 'receipt.canonical.0007', type: 'CANONICAL_EVENT', at: 4100 }
  ]);
});
