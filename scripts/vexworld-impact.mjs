#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function normalizeRepositoryPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .trim();
}

function escapeRegexChar(character) {
  return /[\\^$+?.()|{}\[\]]/.test(character) ? `\\${character}` : character;
}

export function globToRegExp(glob) {
  const pattern = normalizeRepositoryPath(glob);
  let expression = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === '*') {
      const next = pattern[index + 1];
      if (next === '*') {
        const after = pattern[index + 2];
        if (after === '/') {
          expression += '(?:.*/)?';
          index += 2;
        } else {
          expression += '.*';
          index += 1;
        }
      } else {
        expression += '[^/]*';
      }
      continue;
    }

    if (character === '?') {
      expression += '[^/]';
      continue;
    }

    expression += escapeRegexChar(character);
  }

  expression += '$';
  return new RegExp(expression);
}

export function matchesPattern(filePath, pattern) {
  return globToRegExp(pattern).test(normalizeRepositoryPath(filePath));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonempty);
}

export async function loadImpactMap(root = repositoryRoot) {
  const raw = await fs.readFile(path.join(root, 'config/change-impact-map.json'), 'utf8');
  return JSON.parse(raw);
}

export function validateImpactMap(map) {
  const errors = [];
  if (!isObject(map)) return ['change-impact map must be an object'];
  if (map.schemaVersion !== 'vexworld.change-impact-map/v1') {
    errors.push('change-impact map schemaVersion must be vexworld.change-impact-map/v1');
  }
  if (!nonempty(map.mapRef)) errors.push('change-impact map requires mapRef');
  if (!stringArray(map.ignoredPathPatterns)) errors.push('ignoredPathPatterns must be a string array');
  if (!Array.isArray(map.rules) || map.rules.length === 0) {
    errors.push('change-impact map requires at least one rule');
    return errors;
  }

  const refs = new Set();
  for (const [index, rule] of map.rules.entries()) {
    if (!isObject(rule)) {
      errors.push(`rule[${index}] must be an object`);
      continue;
    }
    if (!nonempty(rule.ruleRef)) errors.push(`rule[${index}] requires ruleRef`);
    if (refs.has(rule.ruleRef)) errors.push(`duplicate impact ruleRef ${rule.ruleRef}`);
    refs.add(rule.ruleRef);
    if (!stringArray(rule.pathPatterns) || rule.pathPatterns.length === 0) {
      errors.push(`${rule.ruleRef ?? `rule[${index}]`} requires pathPatterns`);
    }
    if (!stringArray(rule.capabilityRefs) || rule.capabilityRefs.length === 0) {
      errors.push(`${rule.ruleRef ?? `rule[${index}]`} requires capabilityRefs`);
    }
    if (!nonempty(rule.ownerRef)) errors.push(`${rule.ruleRef ?? `rule[${index}]`} requires ownerRef`);
    if (!stringArray(rule.requiredTestRefs)) {
      errors.push(`${rule.ruleRef ?? `rule[${index}]`} requiredTestRefs must be a string array`);
    }
    if (!stringArray(rule.anomalyRefs)) {
      errors.push(`${rule.ruleRef ?? `rule[${index}]`} anomalyRefs must be a string array`);
    }
  }
  return errors;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function classifyFiles(files, map, { allowUnmapped = false } = {}) {
  const validationErrors = validateImpactMap(map);
  if (validationErrors.length > 0) {
    throw new TypeError(validationErrors.join('\n'));
  }

  const normalizedFiles = uniqueSorted(files.map(normalizeRepositoryPath).filter(Boolean));
  const ignoredFiles = [];
  const unmappedFiles = [];
  const matches = [];

  for (const filePath of normalizedFiles) {
    if (map.ignoredPathPatterns.some((pattern) => matchesPattern(filePath, pattern))) {
      ignoredFiles.push(filePath);
      continue;
    }

    const matchingRules = map.rules.filter((rule) =>
      rule.pathPatterns.some((pattern) => matchesPattern(filePath, pattern))
    );

    if (matchingRules.length === 0) {
      unmappedFiles.push(filePath);
      continue;
    }

    matches.push({
      filePath,
      ruleRefs: matchingRules.map((rule) => rule.ruleRef).sort(),
      capabilityRefs: uniqueSorted(matchingRules.flatMap((rule) => rule.capabilityRefs)),
      ownerRefs: uniqueSorted(matchingRules.map((rule) => rule.ownerRef)),
      requiredTestRefs: uniqueSorted(matchingRules.flatMap((rule) => rule.requiredTestRefs)),
      anomalyRefs: uniqueSorted(matchingRules.flatMap((rule) => rule.anomalyRefs))
    });
  }

  const receipt = {
    schemaVersion: 'vexworld.change-impact-receipt/v1',
    mapRef: map.mapRef,
    changedFiles: normalizedFiles,
    matchedFiles: matches,
    ignoredFiles: uniqueSorted(ignoredFiles),
    unmappedFiles: uniqueSorted(unmappedFiles),
    matchedRuleRefs: uniqueSorted(matches.flatMap((entry) => entry.ruleRefs)),
    capabilityRefs: uniqueSorted(matches.flatMap((entry) => entry.capabilityRefs)),
    ownerRefs: uniqueSorted(matches.flatMap((entry) => entry.ownerRefs)),
    requiredTestRefs: uniqueSorted(matches.flatMap((entry) => entry.requiredTestRefs)),
    anomalyRefs: uniqueSorted(matches.flatMap((entry) => entry.anomalyRefs)),
    disposition:
      unmappedFiles.length > 0 && !allowUnmapped
        ? 'ATTENTION_UNMAPPED_PATHS'
        : normalizedFiles.length === 0
          ? 'NO_CHANGED_PATHS'
          : 'IMPACT_CLASSIFIED'
  };

  return receipt;
}

function readArgument(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  if (index + 1 >= args.length) throw new TypeError(`${flag} requires a value`);
  return args[index + 1];
}

export function parseImpactArgs(args) {
  const filesValue = readArgument(args, '--files');
  const format = readArgument(args, '--format') ?? 'markdown';
  if (!['markdown', 'json'].includes(format)) {
    throw new TypeError('--format must be markdown or json');
  }
  return {
    files: filesValue ? filesValue.split(',').map((value) => value.trim()).filter(Boolean) : null,
    base: readArgument(args, '--base'),
    head: readArgument(args, '--head') ?? 'HEAD',
    format,
    allowUnmapped: args.includes('--allow-unmapped')
  };
}

function gitLines(root, commandArgs, { allowFailure = false } = {}) {
  const result = spawnSync('git', commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    if (allowFailure) return [];
    throw new Error(`git ${commandArgs.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function discoverChangedFiles({ root = repositoryRoot, base = null, head = 'HEAD' } = {}) {
  if (base) return gitLines(root, ['diff', '--name-only', base, head]);

  return uniqueSorted([
    ...gitLines(root, ['diff', '--name-only', 'HEAD'], { allowFailure: true }),
    ...gitLines(root, ['diff', '--name-only', '--cached'], { allowFailure: true }),
    ...gitLines(root, ['ls-files', '--others', '--exclude-standard'], { allowFailure: true })
  ]);
}

export function renderImpactMarkdown(receipt) {
  const lines = [
    '# VexWorld change-impact receipt',
    '',
    `- Disposition: **${receipt.disposition}**`,
    `- Changed paths: ${receipt.changedFiles.length}`,
    `- Mapped paths: ${receipt.matchedFiles.length}`,
    `- Unmapped paths: ${receipt.unmappedFiles.length}`,
    '',
    '## Capabilities',
    ...(receipt.capabilityRefs.length ? receipt.capabilityRefs.map((ref) => `- \`${ref}\``) : ['- None']),
    '',
    '## Owners',
    ...(receipt.ownerRefs.length ? receipt.ownerRefs.map((ref) => `- \`${ref}\``) : ['- None']),
    '',
    '## Required test candidates',
    ...(receipt.requiredTestRefs.length ? receipt.requiredTestRefs.map((ref) => `- \`${ref}\``) : ['- None']),
    '',
    '## Anomaly checks',
    ...(receipt.anomalyRefs.length ? receipt.anomalyRefs.map((ref) => `- \`${ref}\``) : ['- None'])
  ];

  if (receipt.unmappedFiles.length) {
    lines.push('', '## Unmapped paths — attention required', ...receipt.unmappedFiles.map((file) => `- \`${file}\``));
  }

  lines.push('', '<!-- [VXG RealForever] -->');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseImpactArgs(process.argv.slice(2));
  const map = await loadImpactMap(repositoryRoot);
  const files = options.files ?? discoverChangedFiles({
    root: repositoryRoot,
    base: options.base,
    head: options.head
  });
  const receipt = classifyFiles(files, map, { allowUnmapped: options.allowUnmapped });
  process.stdout.write(options.format === 'json' ? `${JSON.stringify(receipt, null, 2)}\n` : renderImpactMarkdown(receipt));
  if (receipt.disposition === 'ATTENTION_UNMAPPED_PATHS') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

// [VXG RealForever]
