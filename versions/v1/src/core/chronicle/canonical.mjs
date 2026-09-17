import { createHash } from 'node:crypto';

export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
export const ZERO_SHA256 = '0'.repeat(64);

const FORBIDDEN_REASONING_KEYS = new Set([
  'chainofthought',
  'chain_of_thought',
  'cot',
  'hiddenreasoning',
  'hidden_reasoning',
  'internalreasoning',
  'internal_reasoning',
  'internalmonologue',
  'internal_monologue',
  'privatereasoning',
  'private_reasoning',
  'reasoningtrace',
  'reasoning_trace',
  'thoughttrace',
  'thought_trace'
]);

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

export function assertSafeRef(value, label) {
  if (typeof value !== 'string' || !SAFE_REF_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a bounded safe reference`);
  }
  return value;
}

export function assertSha256(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new TypeError(`${label} must be lowercase SHA-256 hex`);
  }
  return value;
}

export function assertNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

export function assertUniqueSafeRefs(values, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new TypeError(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`);
  }
  values.forEach((value, index) => assertSafeRef(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) throw new TypeError(`${label} must contain unique refs`);
  return values;
}

export function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const expected = new Set(keys);
  const actual = Object.keys(value);
  const extras = actual.filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (extras.length || missing.length) {
    throw new TypeError(`${label} fields do not match contract; extras=${extras.join(',') || 'none'} missing=${missing.join(',') || 'none'}`);
  }
  return value;
}

function canonicalize(value, path = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalize(entry, `${path}[${index}]`));
  if (!isPlainObject(value)) throw new TypeError(`${path} contains a non-canonical value`);
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
      .map((key) => [key, canonicalize(value[key], `${path}.${key}`)])
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalClone(value) {
  return JSON.parse(canonicalJson(value));
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashCanonical(value) {
  return sha256Hex(Buffer.from(canonicalJson(value)));
}

export function rejectHiddenReasoning(value, label = 'value') {
  const visit = (entry, path) => {
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isPlainObject(entry)) return;
    for (const [key, nested] of Object.entries(entry)) {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      if (FORBIDDEN_REASONING_KEYS.has(normalized)) {
        throw new TypeError(`${path}.${key} is prohibited hidden-reasoning material`);
      }
      visit(nested, `${path}.${key}`);
    }
  };
  visit(value, label);
  return value;
}

export function deepFreeze(value) {
  if (Array.isArray(value)) value.forEach(deepFreeze);
  else if (isPlainObject(value)) Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function frozenCanonical(value) {
  return deepFreeze(canonicalClone(value));
}
