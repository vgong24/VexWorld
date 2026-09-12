import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser entry exposes setup, game canvas, status, party, and accessible communication surfaces', async () => {
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
  assert.match(app,/ServerSessionClient/);
  assert.match(app,/pollUtterance/);
  assert.match(app,/maybeEmitLocalCommunication/);
  assert.match(app,/formCompanionUtterance/);

  const styles=await readFile('src/web/styles.css','utf8');
  assert.match(styles,/#companion-bubbles/);
  assert.match(styles,/#dialogue-log/);
});
