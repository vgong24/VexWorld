import { promises as fs } from 'node:fs';
import path from 'node:path';
import { compileFirstGrove } from '../compiler/world-compiler.mjs';

const REQUIRED = [
  'README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'LICENSE-STATUS.md',
  'vexworld.manifest.json', 'config/source-map.json', 'config/build-graph.json',
  'config/capability-graph.json', 'config/roles.json', 'config/unknowns.json',
  'docs/CULTURE.md', 'docs/ARCHITECTURE.md', 'docs/DEVEX-BUILDER-GUIDE.md',
  'worlds/first-grove/manifest.json', 'src/core/engine.mjs', 'src/web/index.html',
  'src/server/server.mjs', 'src/agents/remote-worker.mjs'
];

async function walk(directory) {
  const results = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.vexworld-data'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(full));
    else results.push(full.replaceAll('\\', '/'));
  }
  return results;
}

try {
  for (const required of REQUIRED) await fs.access(required);
  const files = await walk('.');
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  for (const file of jsonFiles) JSON.parse(await fs.readFile(file, 'utf8'));
  const sourceMap = JSON.parse(await fs.readFile('config/source-map.json', 'utf8'));
  const mapped = new Set(sourceMap.entries.map((entry) => entry.path));
  const sourceFiles = files.filter((file) => !file.startsWith('generated/') && !file.startsWith('.git/'));
  const missing = sourceFiles.filter((file) => !mapped.has(file));
  if (missing.length) throw new Error(`source-map missing ${missing.join(', ')}`);
  const duplicatePaths = sourceMap.entries.map((entry) => entry.path).filter((value, index, values) => values.indexOf(value) !== index);
  if (duplicatePaths.length) throw new Error(`source-map duplicate paths: ${duplicatePaths.join(', ')}`);
  await compileFirstGrove();
  console.log(`VALID sourceFiles=${sourceFiles.length} jsonFiles=${jsonFiles.length}`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
