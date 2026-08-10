/**
 * Deterministic Fisher–Yates shuffle. Same seed + same input order always
 * yields the same permutation — important so republishing sealed feed pages
 * doesn't churn CDN-cached JSON, and so a card doesn't reshuffle on remount.
 */
export function hashSeed(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a new array; does not mutate `items`. */
export function shuffleWithSeed<T>(items: readonly T[], seed: string): T[] {
  const out = items.slice();
  if (out.length < 2) return out;
  const rand = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
