import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredRoot = [
  'README.md',
  'CLAUDE.md',
  'vexworld.manifest.json',
  'config/current-version.json',
  'setup-vexworld.cmd',
  'setup-vexworld.command',
  'start-vexworld.cmd',
  'start-vexworld.command'
];
for (const relative of requiredRoot) await fs.access(path.join(root, relative));
const repositoryManifest = JSON.parse(await fs.readFile(path.join(root, 'vexworld.manifest.json'), 'utf8'));
if (repositoryManifest.schemaVersion !== 'vexworld.repository-manifest/v1') throw new Error('unexpected repository manifest schema');
const config = JSON.parse(await fs.readFile(path.join(root, 'config/current-version.json'), 'utf8'));
if (repositoryManifest.currentVersionRef !== config.currentVersionRef) throw new Error('repository manifest/current version mismatch');
if (config.schemaVersion !== 'vexworld.current-version/v1') throw new Error('unexpected current-version schema');
if (!config.sourcePath || path.isAbsolute(config.sourcePath) || config.sourcePath.includes('..')) throw new Error('invalid sourcePath');
for (const relative of ['README.md', 'CLAUDE.md', 'package.json', 'vexworld.manifest.json', 'config/source-map.json']) {
  await fs.access(path.join(root, config.sourcePath, relative));
}
console.log(`VexWorld root route OK → ${config.sourcePath}`);
