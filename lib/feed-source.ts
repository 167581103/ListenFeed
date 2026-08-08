import { feedLatestKey, feedPageKey, type FeedLatest, type FeedPage } from "./feed-types";

/**
 * Where the published feed snapshots live. Defaults to the public media base
 * (same R2 CDN as the audio), but can be split onto its own bucket/domain later
 * by setting NEXT_PUBLIC_FEED_BASE_URL — without any code change.
 */
const FEED_BASE = (
  process.env.NEXT_PUBLIC_FEED_BASE_URL ??
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
  ""
).replace(/\/$/, "");

function feedUrl(key: string): string {
  return `${FEED_BASE}/${key}`;
}

export async function fetchLatest(): Promise<FeedLatest> {
  // Let HTTP caching govern freshness (latest.json is short-TTL + SWR on R2).
  const res = await fetch(feedUrl(feedLatestKey()), { cache: "default" });
  if (!res.ok) throw new Error(`Failed to load feed index (${res.status})`);
  return (await res.json()) as FeedLatest;
}

export async function fetchPage(page: number): Promise<FeedPage> {
  const res = await fetch(feedUrl(feedPageKey(page)), { cache: "default" });
  if (!res.ok) throw new Error(`Failed to load feed page ${page} (${res.status})`);
  return (await res.json()) as FeedPage;
}
