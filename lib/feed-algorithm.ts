import { library, type ListeningItem } from "@/data/library";

export type FeedEntry = {
  key: string;
  position: number;
  item: ListeningItem;
};

export const PAGE_SIZE = 6;

/**
 * Rotating the start of every cycle keeps a small library from replaying in the
 * exact same order, which is the only ranking signal available before there is
 * per-user history to score against.
 */
function pickItem(position: number): ListeningItem {
  const size = library.length;
  const cycle = Math.floor(position / size);
  return library[(position + cycle) % size];
}

export function getFeedPage(page: number): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (let offset = 0; offset < PAGE_SIZE; offset += 1) {
    const position = page * PAGE_SIZE + offset;
    const item = pickItem(position);
    entries.push({ key: `${item.id}:${position}`, position, item });
  }
  return entries;
}
