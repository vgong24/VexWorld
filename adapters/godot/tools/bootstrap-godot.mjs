#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const receipt = JSON.parse(await fs.readFile(path.join(adapterRoot, 'ENGINE-RECEIPT.json'), 'utf8'));
const runtimeRoot = path.join(adapterRoot, '.runtime', receipt.releaseTag);
const runtimeManifestPath = path.join(runtimeRoot, 'runtime.json');

function platformKey() {
  if (process.platform === 'win32' && process.arch === 'x64') return 'windows-x64';
  if (process.platform === 'darwin') return 'macos-universal';
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64';
  throw new Error(`Unsupported Godot bootstrap platform ${process.platform}/${process.arch}`);
}

function expectedBinary(root) {
  if (process.platform === 'win32') return path.join(root, 'extract', 'Godot_v4.7.2-stable_win64.exe');
  if (process.platform === 'darwin') return path.join(root, 'extract', 'Godot.app', 'Contents', 'MacOS', 'Godot');
  return path.join(root, 'extract', 'Godot_v4.7.2-stable_linux.x86_64');
}

async function sha256(file) {
  const hash = createHash('sha256');
  const data = await fs.readFile(file);
  hash.update(data);
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.trim();
}

function githubHeaders({ includeAuth = true } = {}) {
  const headers = {
    'User-Agent': 'VexWorld-Godot-Adapter',
    'Accept': 'application/vnd.github+json'
  };
  const token = process.env.GITHUB_TOKEN;
  if (includeAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function download(url, target) {
  const response = await fetch(url, { headers: githubHeaders({ includeAuth: false }), redirect: 'follow' });
  if (!response.ok) throw new Error(`download ${url} -> ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(target, data);
}

function extract(zipPath, destination) {
  if (process.platform === 'win32') {
    const escapedZip = zipPath.replaceAll("'", "''");
    const escapedDest = destination.replaceAll("'", "''");
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`]);
  } else if (process.platform === 'darwin') {
    run('ditto', ['-x', '-k', zipPath, destination]);
  } else {
    run('unzip', ['-q', '-o', zipPath, '-d', destination]);
  }
}

function verifyVersion(binary) {
  if (process.platform !== 'win32') run('chmod', ['+x', binary]);
  const version = run(binary, ['--version']);
  if (!version.startsWith('4.7.2.stable')) {
    throw new Error(`Expected Godot 4.7.2.stable, got ${version}`);
  }
  return version;
}

export async function ensureGodot({ noDownload = false } = {}) {
  const envBinary = process.env.GODOT_BIN;
  if (envBinary) {
    const version = verifyVersion(envBinary);
    return { binary: path.resolve(envBinary), version, source: 'GODOT_BIN', artifact: null, digest: null };
  }

  const key = platformKey();
  const assetName = receipt.assets[key];
  await fs.mkdir(runtimeRoot, { recursive: true });
  const zipPath = path.join(runtimeRoot, assetName);
  const extractRoot = path.join(runtimeRoot, 'extract');
  const binary = expectedBinary(runtimeRoot);

  const release = await fetchJson(receipt.releaseApiUrl);
  if (release.tag_name !== receipt.releaseTag || release.draft || release.prerelease) {
    throw new Error('Godot release metadata does not match pinned stable release');
  }
  const asset = release.assets.find((entry) => entry.name === assetName);
  if (!asset) throw new Error(`Pinned Godot release does not contain ${assetName}`);
  if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest || '')) {
    throw new Error(`Pinned release asset ${assetName} does not expose an exact SHA-256 digest`);
  }
  const expectedDigest = asset.digest.slice('sha256:'.length).toLowerCase();

  let needsDownload = true;
  try {
    needsDownload = (await sha256(zipPath)) !== expectedDigest;
  } catch {
    needsDownload = true;
  }
  if (needsDownload) {
    if (noDownload) throw new Error(`Godot asset missing or stale and --no-download was requested: ${zipPath}`);
    await download(asset.browser_download_url, zipPath);
  }
  const actualDigest = await sha256(zipPath);
  if (actualDigest !== expectedDigest) {
    throw new Error(`Godot asset digest mismatch: expected ${expectedDigest}, got ${actualDigest}`);
  }

  let binaryPresent = true;
  try { await fs.access(binary); } catch { binaryPresent = false; }
  if (!binaryPresent) {
    await fs.rm(extractRoot, { recursive: true, force: true });
    await fs.mkdir(extractRoot, { recursive: true });
    extract(zipPath, extractRoot);
  }
  const version = verifyVersion(binary);
  const runtime = {
    schemaVersion: 'vexworld.godot-runtime-receipt/v1',
    engineRef: receipt.engineRef,
    releaseTag: receipt.releaseTag,
    sourceCommit: receipt.sourceCommit,
    platformKey: key,
    assetName,
    assetId: asset.id,
    assetDigest: `sha256:${actualDigest}`,
    releaseApiUrl: receipt.releaseApiUrl,
    binary,
    version,
    source: 'OFFICIAL_GITHUB_RELEASE_ASSET'
  };
  await fs.writeFile(runtimeManifestPath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
  return runtime;
}

export async function readRuntime() {
  return JSON.parse(await fs.readFile(runtimeManifestPath, 'utf8'));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  ensureGodot({ noDownload: process.argv.includes('--no-download') })
    .then((runtime) => {
      if (process.argv.includes('--print-bin')) console.log(runtime.binary);
      else console.log(JSON.stringify(runtime, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
