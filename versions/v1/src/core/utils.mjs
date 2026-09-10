export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function distance(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

export function deepClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortDeep(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}

export function createRng(seed = 0x6d2b79f5) {
  let state = (Number(seed) >>> 0) || 1;
  return {
    next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state / 0x100000000;
    },
    int(min, maxInclusive) {
      return min + Math.floor(this.next() * (maxInclusive - min + 1));
    },
    pick(values) {
      return values[Math.floor(this.next() * values.length)];
    },
    get state() {
      return state;
    },
    set state(value) {
      state = Number(value) >>> 0;
    }
  };
}

export function makeId(prefix, sequence) {
  return `${prefix}.${String(sequence).padStart(4, '0')}`;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}
