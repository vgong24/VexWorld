import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser entry exposes setup, game canvas, status, and party surfaces', async () => {
  const html=await readFile('src/web/index.html','utf8');
  assert.match(html,/id="game"/);
  assert.match(html,/Garden of Arrival/);
  assert.match(html,/companion-count/);
  assert.match(html,/status-panel/);
  const app=await readFile('src/web/app.mjs','utf8');
  assert.match(app,/createInitialGame/);
  assert.match(app,/ServerSessionClient/);
});
