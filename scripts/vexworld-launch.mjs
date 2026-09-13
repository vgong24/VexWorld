import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`\nVexWorld could not continue: ${message}\n`);
  process.exitCode = 1;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

/**
 * Resolve npm through its JavaScript CLI instead of spawning npm.cmd directly.
 *
 * Node's Windows child_process spawn can reject a .cmd executable with EINVAL
 * when shell=false. VexWorld does not need a broad shell escape hatch here:
 * npm itself is a Node program, so invoke the exact npm CLI with the already
 * trusted Node executable. On normal `npm run ...` entry, npm_execpath is the
 * authoritative CLI location. The adjacent-node fallback matches the standard
 * Windows Node/npm layout for direct `node scripts/vexworld-launch.mjs ...`
 * use.
 */
export function npmInvocation({
  platform = process.platform,
  env = process.env,
  execPath = process.execPath
} = {}) {
  const observedCli = typeof env?.npm_execpath === 'string' ? env.npm_execpath.trim() : '';
  if (observedCli && !/\.cmd$/i.test(observedCli)) {
    return Object.freeze({
      executable: execPath,
      prefixArgs: [observedCli],
      shell: false,
      strategy: 'NODE_NPM_CLI_FROM_ENV'
    });
  }

  if (platform === 'win32') {
    const adjacentCli = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return Object.freeze({
      executable: execPath,
      prefixArgs: [adjacentCli],
      shell: false,
      strategy: 'NODE_ADJACENT_NPM_CLI'
    });
  }

  return Object.freeze({
    executable: 'npm',
    prefixArgs: [],
    shell: false,
    strategy: 'PATH_NPM'
  });
}

export function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd || repositoryRoot,
      env: options.env || process.env,
      stdio: options.stdio || 'inherit',
      shell: options.shell ?? false
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${executable} stopped by ${signal}`));
      else if (code !== 0) reject(new Error(`${executable} exited with code ${code}`));
      else resolve();
    });
  });
}

function nodeMajor() {
  return Number(process.versions.node.split('.')[0]);
}

async function resolveLayout() {
  const versionConfigPath = path.join(repositoryRoot, 'config', 'current-version.json');
  const versionConfig = await readJson(versionConfigPath);
  const versionRoot = path.resolve(repositoryRoot, versionConfig.sourcePath);
  const packagePath = path.join(versionRoot, 'package.json');
  await fs.access(packagePath);
  const homeRoot = path.resolve(process.env.VEXWORLD_HOME || path.join(homedir(), versionConfig.homeDirectoryName || '.vexworld'));
  return { versionConfig, versionRoot, homeRoot };
}

async function prepareHome(layout) {
  const sessions = path.join(layout.homeRoot, 'sessions');
  const logs = path.join(layout.homeRoot, 'logs');
  await fs.mkdir(sessions, { recursive: true });
  await fs.mkdir(logs, { recursive: true });
  const homeFile = path.join(layout.homeRoot, 'home.json');
  let prior = {};
  try { prior = await readJson(homeFile); } catch {}
  const now = new Date().toISOString();
  const record = {
    schemaVersion: layout.versionConfig.homeSchemaVersion,
    homeRef: prior.homeRef || 'home.vexworld.local',
    createdAt: prior.createdAt || now,
    lastStartedAt: now,
    currentVersionRef: layout.versionConfig.currentVersionRef,
    sourceRepositoryPath: repositoryRoot,
    sessionDirectory: sessions
  };
  await fs.writeFile(homeFile, `${JSON.stringify(record, null, 2)}\n`);
  return { sessions, logs, homeFile };
}

async function runVersionScript(layout, script, args = []) {
  const npm = npmInvocation();
  await run(
    npm.executable,
    [...npm.prefixArgs, 'run', script, ...(args.length ? ['--', ...args] : [])],
    { cwd: layout.versionRoot, shell: npm.shell }
  );
}

async function launchServer(layout, { lan = false, setup = false } = {}) {
  const home = await prepareHome(layout);
  if (setup) {
    console.log('\nVexWorld setup');
    console.log('--------------');
    console.log(`Version: ${layout.versionConfig.displayName}`);
    console.log(`Home:    ${layout.homeRoot}`);
    console.log('\nChecking the playable foundation...\n');
    await run(process.execPath, [path.join(repositoryRoot, 'scripts', 'check-root.mjs')], { cwd: repositoryRoot });
    await runVersionScript(layout, 'check');
  } else {
    await runVersionScript(layout, 'compile');
  }

  console.log(`\nStarting ${layout.versionConfig.displayName}`);
  console.log(`VexWorld Home: ${layout.homeRoot}\n`);
  const server = path.join(layout.versionRoot, 'src', 'server', 'server.mjs');
  const args = [server, '--data', home.sessions, '--open'];
  if (lan) args.push('--lan');
  await run(process.execPath, args, { cwd: layout.versionRoot, env: { ...process.env, VEXWORLD_HOME: layout.homeRoot } });
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'start';
  const forwardedArgs = argv.slice(1);
  if (nodeMajor() < 20) throw new Error(`Node.js 20 or newer is required; found ${process.versions.node}`);
  const layout = await resolveLayout();
  switch (command) {
    case 'setup':
      await launchServer(layout, { setup: true });
      break;
    case 'start':
      await launchServer(layout);
      break;
    case 'lan':
      console.log('\nTrusted home-network mode. Do not expose this development server to the public Internet.');
      await launchServer(layout, { lan: true });
      break;
    case 'check':
    case 'check-version':
      await runVersionScript(layout, 'check');
      break;
    case 'orient':
      console.log(JSON.stringify({
        schemaVersion: 'vexworld.root-orientation/v1',
        projectRef: layout.versionConfig.projectRef,
        currentVersionRef: layout.versionConfig.currentVersionRef,
        currentVersionPath: path.relative(repositoryRoot, layout.versionRoot).replaceAll('\\', '/'),
        homePath: layout.homeRoot,
        nextRead: [
          'CLAUDE.md',
          'vexworld.manifest.json',
          'config/current-version.json',
          `${layout.versionConfig.sourcePath}/CLAUDE.md`,
          `${layout.versionConfig.sourcePath}/vexworld.manifest.json`,
          `${layout.versionConfig.sourcePath}/config/source-map.json`
        ]
      }, null, 2));
      break;
    case 'home': {
      const home = await prepareHome(layout);
      console.log(JSON.stringify({ homeRoot: layout.homeRoot, ...home }, null, 2));
      break;
    }
    case 'agent': {
      await prepareHome(layout);
      const worker = path.join(layout.versionRoot, 'src', 'agents', 'remote-worker.mjs');
      await run(process.execPath, [worker, ...forwardedArgs], { cwd: repositoryRoot, env: { ...process.env, VEXWORLD_HOME: layout.homeRoot } });
      break;
    }
    default:
      throw new Error(`unknown launcher command ${command}`);
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch((error) => fail(error?.message || String(error)));
}
