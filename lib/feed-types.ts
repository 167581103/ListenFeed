/**
 * The published-feed contract shared by the publish job (writer) and the client
 * (reader). This is the ONLY coupling point between the content pipeline (Neon +
 * content factory) and the static frontend: the backend keeps writing Neon and
 * uploading snapshots to R2, the frontend only ever reads these files from the
 * CDN. See README "Feed 发布契约".
 */

export type ListeningOption = {
  id: string;
  label: string;
};

export type TranscriptLine = {
  speaker: string;
  line: string;
};

/**
 * Optional ranking/recommendation features. Reserved now, populated by the
 * content factory later; the client may use them for local re-ranking without
 * any change to this contract.
 */
export type FeedItemFeatures = {
  language?: string;
  locale?: string;
  accent?: string;
  /** CEFR level, e.g. "A2", "B1". */
  level?: string;
  topic?: string;
  scenario?: string;
  format?: "dialogue" | "monologue";
  /** Words per minute. */
  speechRate?: number;
  qualityScore?: number;
  freshnessScore?: number;
};

/** One published listening item as served to the client. */
export type PublishedItem = {
  /** Stable content id (idempotent across republish); maps to Neon feed_items.slug. */
  id: string;
  /**
   * Global, monotonically increasing publish sequence. Defines feed order and
   * guarantees pages are append-only (older seqs never move to a new page).
   */
  seq: number;
  /** Content version, so the client can detect edited items. */
  version: number;
  question: string;
  options: ListeningOption[];
  answerId: string;
  transcript: TranscriptLine[];
  durationMs: number;
  /** Relative R2 keys; lib/media.ts prepends the public media base at render. */
  audio: { webm: string; mp3: string };
  features?: FeedItemFeatures;
};

/** One immutable feed page (append-only, long-cached on the CDN). */
export type FeedPage = {
  page: number;
  pageSize: number;
  items: PublishedItem[];
};

/**
 * The small, frequently-updated pointer the client polls to discover new
 * content. Only this file is short-cached; pages stay immutable.
 */
export type FeedLatest = {
  catalogVersion: number;
  pageSize: number;
  /** Highest page index that exists (0-based). */
  latestPage: number;
  /** Total number of published items. */
  count: number;
  /** Highest seq published. */
  maxSeq: number;
  generatedAt: string;
};

export const FEED_DIR = "feed";
export const feedLatestKey = () => `${FEED_DIR}/latest.json`;
export const feedPageKey = (page: number) => `${FEED_DIR}/page-${String(page).padStart(5, "0")}.json`;
