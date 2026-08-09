import type { PublishedItem } from "./feed-types";

export type SeenEntry = { t: number };
export type SeenMap = Record<string, SeenEntry>;

export type PickResult =
  | { kind: "item"; item: PublishedItem; cycle: boolean }
  | { kind: "need-more" }
  | { kind: "none" };

export type PickOptions = {
  /** How many most-recently-shown ids to avoid replaying back-to-back. */
  avoidRecent?: number;
};

/**
 * Decide the next item to show, given everything currently loaded.
 *
 * Two phases, matching the product rule:
 *  1. Unseen-first: never repeat within a cycle. Freshest (highest seq) wins so
 *     newly published content surfaces immediately.
 *  2. Cycle (everything loaded has been seen): replay least-recently-seen first,
 *     skipping the most recent `avoidRecent` items so nothing repeats back-to-back.
 *
 * `morePages` lets the caller lazily load more before falling into a cycle:
 * when unseen candidates are exhausted but more pages exist, we ask for more.
 */
export function pickNext(
  pool: PublishedItem[],
  seen: SeenMap,
  queued: ReadonlySet<string>,
  recent: readonly string[],
  morePages: boolean,
  opts: PickOptions = {},
): PickResult {
  const avoidRecent = opts.avoidRecent ?? 3;

  const unseen = pool.filter((i) => !seen[i.id] && !queued.has(i.id));
  if (unseen.length > 0) {
    // Freshest first.
    unseen.sort((a, b) => b.seq - a.seq);
    return { kind: "item", item: unseen[0], cycle: false };
  }

  if (morePages) return { kind: "need-more" };

  // Cycle: least-recently-seen first, skipping the last few shown.
  const recentSet = new Set(recent.slice(-avoidRecent));
  const byLeastRecent = (a: PublishedItem, b: PublishedItem) =>
    (seen[a.id]?.t ?? 0) - (seen[b.id]?.t ?? 0);

  // Prefer items neither still queued in the buffer nor shown very recently.
  const preferred = pool
    .filter((i) => !queued.has(i.id) && !recentSet.has(i.id))
    .sort(byLeastRecent);
  if (preferred.length > 0) return { kind: "item", item: preferred[0], cycle: true };

  // Then allow items already queued in the buffer, but still avoid the ones shown
  // most recently (keeps larger libraries from repeating back-to-back).
  const notRecent = pool.filter((i) => !recentSet.has(i.id)).sort(byLeastRecent);
  if (notRecent.length > 0) return { kind: "item", item: notRecent[0], cycle: true };

  // Last resort (e.g. a single-item library): repeat the least-recently-seen so
  // the feed always stays scrollable, even if that means a back-to-back repeat.
  const anyItem = [...pool].sort(byLeastRecent);
  if (anyItem.length > 0) return { kind: "item", item: anyItem[0], cycle: true };

  return { kind: "none" };
}
