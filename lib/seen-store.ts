import type { SeenMap } from "./feed-select";

const KEY = "listenfeed.seen.v1";
// Cap the history so heavy users don't grow localStorage unbounded. When over
// the cap we drop the oldest entries; the cycle logic still works on whatever
// remains (dropped items simply look "unseen" again, which is acceptable).
const MAX_ENTRIES = 5000;
const PRUNE_TO = 4000;

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadSeen(): SeenMap {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function persist(seen: SeenMap): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Ignore quota / serialization errors; the feed still works in-memory.
  }
}

function prune(seen: SeenMap): SeenMap {
  const ids = Object.keys(seen);
  if (ids.length <= MAX_ENTRIES) return seen;
  const sorted = ids.sort((a, b) => (seen[a]?.t ?? 0) - (seen[b]?.t ?? 0));
  const drop = sorted.slice(0, ids.length - PRUNE_TO);
  for (const id of drop) delete seen[id];
  return seen;
}

/** Mark an item as seen "now", persisting the updated map. Returns the new map. */
export function markSeen(seen: SeenMap, id: string, now = Date.now()): SeenMap {
  const next = { ...seen, [id]: { t: now } };
  const pruned = prune(next);
  persist(pruned);
  return pruned;
}
