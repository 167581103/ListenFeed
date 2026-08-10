import type { ListeningOption } from "./feed-types";
import { shuffleWithSeed } from "./shuffle";

/**
 * Shuffle listening options so the correct answer is not systematically first
 * (content factories often emit answer-first). Seeded by item id so the order
 * is stable across publishes and remounts.
 */
export function shuffleOptions(
  options: readonly ListeningOption[],
  itemId: string,
  version?: number,
): ListeningOption[] {
  const seed = version == null ? itemId : `${itemId}:v${version}`;
  return shuffleWithSeed(options, seed);
}
