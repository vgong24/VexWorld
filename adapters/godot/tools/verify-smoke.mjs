#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = path.join(adapterRoot, 'artifacts', 'visual-smoke-receipt.json');
const screenshotPath = path.join(adapterRoot, 'artifacts', 'first-grove-smoke.png');

const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
const screenshot = await fs.stat(screenshotPath);
const errors = [];

if (receipt.schemaVersion !== 'vexworld.godot-visual-smoke/v1') errors.push('unexpected smoke receipt schema');
if (receipt.packageRef !== 'package.vexworld.first-grove.prototype.v1') errors.push('unexpected World Package ref');
if (receipt.integrityFingerprint !== 'fe5754cccac19f60ea7aceb4db4b76adffa0771a7adf9c8e0d613820260bf7d2') errors.push('unexpected World Package fingerprint');
if (receipt.humanSemanticRef !== 'vessel.first-grove.human.reference') errors.push(`human vessel did not materialize: ${receipt.humanSemanticRef}`);
if (receipt.companionSemanticRef !== 'vessel.first-grove.companion.reference') errors.push(`companion vessel did not materialize: ${receipt.companionSemanticRef}`);
if (receipt.semanticOwner !== 'VEXWORLD_WORLD_PACKAGE') errors.push('semantic owner leaked away from World Package');
if (receipt.engineRole !== 'REPLACEABLE_REALIZATION_ADAPTER') errors.push('Godot adapter role changed');
if (receipt.screenshotWriteError !== 0) errors.push(`screenshot write failed with ${receipt.screenshotWriteError}`);
if (screenshot.size < 1024) errors.push(`smoke screenshot is implausibly small: ${screenshot.size} bytes`);

if (errors.length) {
  console.error(JSON.stringify({ disposition: 'ATTENTION_REQUIRED', errors, receipt, screenshotBytes: screenshot.size }, null, 2));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({ disposition: 'VISUAL_SMOKE_VALID', receipt, screenshotBytes: screenshot.size }, null, 2));
}
