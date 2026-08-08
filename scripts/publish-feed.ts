// Publish job: project the "published" content into immutable, paginated static
// JSON snapshots on R2 (the CDN the frontend reads). This is the write side of
// the CQRS boundary; the frontend never touches Neon.
//
// Data source is pluggable: today it reads the in-repo library, later it reads
// Neon `feed_items` where status = 'published'. Swap `loadPublishedItems` only.
//
// Ordering guarantee: pages are written BEFORE the latest.json pointer is
// advanced, so the frontend never sees a pointer to a page that isn't there.
// Full pages are immutable (1y cache); the open (last, partial) page and
// latest.json are short-cached so newly appended content appears within seconds.
//
// Usage:
//   npm run feed:publish -- [--page-size 20] [--catalog-version 1]
//   npm run feed:publish -- --out .feed-out [--page-size 20]   # write locally, no R2
//   npm run feed:publish -- --dry-run
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  feedLatestKey,
  feedPageKey,
  type FeedLatest,
  type FeedPage,
  type PublishedItem,
} from "../lib/feed-types";
import { getPool, query, closePool } from "./cms/db.js";
// r2-client is plain ESM JS shared with the other ops scripts.
// @ts-expect-error - no types for the .mjs helper; shapes are documented inline.
import { createR2Client, loadR2Config } from "./r2-client.mjs";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const SHORT_CACHE = "public, max-age=30, stale-while-revalidate=300";

type Args = { pageSize: number; catalogVersion: number; out?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { pageSize: 20, catalogVersion: 1, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--dry-run") args.dryRun = true;
    else if (t === "--page-size") args.pageSize = Number.parseInt(argv[++i], 10);
    else if (t === "--catalog-version") args.catalogVersion = Number.parseInt(argv[++i], 10);
    else if (t === "--out") args.out = argv[++i];
  }
  if (!Number.isFinite(args.pageSize) || args.pageSize < 1) {
    throw new Error("--page-size must be a positive integer");
  }
  return args;
}

type Row = {
  id: string;
  seq: string;
  version: number;
  question: string;
  content_hash: string;
  duration_ms: number;
  answer_id: string | null;
  options: PublishedItem["options"] | null;
  transcript: PublishedItem["transcript"] | null;
  level: string | null;
  language: string | null;
  locale: string | null;
  accent: string | null;
  topic: string | null;
  scenario: string | null;
  format: string | null;
  speech_rate: number | null;
  quality_score: string | null;
  freshness_score: string | null;
};

/**
 * Load published items from Neon in stable global publish order (published_seq).
 * Audio keys are derived from the content hash (the R2 content-addressed layout).
 */
async function loadPublishedItems(): Promise<PublishedItem[]> {
  getPool();
  const res = await query<Row>(
    `SELECT fi.external_id AS id, fi.published_seq AS seq, fi.content_version AS version,
            fi.question, aa.content_hash, aa.duration_ms,
            fi.level, fi.language, fi.locale, fi.accent, fi.topic, fi.scenario, fi.format,
            fi.speech_rate, fi.quality_score, fi.freshness_score,
            (SELECT json_agg(json_build_object('id', o.option_key, 'label', o.label) ORDER BY o.position)
               FROM feed_options o WHERE o.feed_item_id = fi.id) AS options,
            (SELECT o.option_key FROM feed_options o WHERE o.feed_item_id = fi.id AND o.is_correct LIMIT 1) AS answer_id,
            (SELECT json_agg(json_build_object('speaker', t.speaker_label, 'line', t.line) ORDER BY t.position)
               FROM transcript_lines t WHERE t.feed_item_id = fi.id) AS transcript
       FROM feed_items fi
       JOIN audio_assets aa ON aa.id = fi.audio_asset_id
      WHERE fi.status = 'published' AND fi.published_seq IS NOT NULL
      ORDER BY fi.published_seq ASC`,
  );

  return res.rows.map((r) => ({
    id: r.id,
    seq: Number(r.seq),
    version: r.version,
    question: r.question,
    options: r.options ?? [],
    answerId: r.answer_id ?? "",
    transcript: r.transcript ?? [],
    durationMs: r.duration_ms,
    audio: {
      webm: `/audio/${r.content_hash}/speech.webm`,
      mp3: `/audio/${r.content_hash}/speech.mp3`,
    },
    features: {
      level: r.level ?? undefined,
      language: r.language ?? undefined,
      locale: r.locale ?? undefined,
      accent: r.accent ?? undefined,
      topic: r.topic ?? undefined,
      scenario: r.scenario ?? undefined,
      format: (r.format as "dialogue" | "monologue" | null) ?? undefined,
      speechRate: r.speech_rate ?? undefined,
      qualityScore: r.quality_score != null ? Number(r.quality_score) : undefined,
      freshnessScore: r.freshness_score != null ? Number(r.freshness_score) : undefined,
    },
  }));
}

function buildPages(items: PublishedItem[], pageSize: number): FeedPage[] {
  const pages: FeedPage[] = [];
  for (let p = 0; p * pageSize < items.length; p += 1) {
    pages.push({ page: p, pageSize, items: items.slice(p * pageSize, (p + 1) * pageSize) });
  }
  return pages;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const items = await loadPublishedItems();
  const pages = buildPages(items, args.pageSize);
  const count = items.length;
  const latestPage = Math.max(0, pages.length - 1);
  const fullPages = Math.floor(count / args.pageSize); // pages [0, fullPages) are sealed

  const latest: FeedLatest = {
    catalogVersion: args.catalogVersion,
    pageSize: args.pageSize,
    latestPage,
    count,
    maxSeq: count === 0 ? 0 : items[count - 1].seq,
    generatedAt: new Date().toISOString(),
  };

  // Upload plan: all pages first, latest.json last. Sealed pages are immutable.
  const uploads = pages.map((page) => ({
    key: feedPageKey(page.page),
    body: JSON.stringify(page),
    cache: page.page < fullPages ? IMMUTABLE_CACHE : SHORT_CACHE,
    sealed: page.page < fullPages,
  }));
  uploads.push({ key: feedLatestKey(), body: JSON.stringify(latest), cache: SHORT_CACHE, sealed: false });

  console.log(`items=${count} pageSize=${args.pageSize} pages=${pages.length} sealed=${fullPages}`);

  if (args.dryRun) {
    for (const u of uploads) console.log(`[dry-run] ${u.sealed ? "immutable" : "short    "} ${u.key} (${u.body.length}B)`);
    return;
  }

  if (args.out) {
    for (const u of uploads) {
      const path = join(args.out, u.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, u.body);
      console.log(`wrote ${path} (${u.body.length}B)`);
    }
    console.log(`\nLocal snapshot written under ${args.out}/feed/`);
    return;
  }

  const config = loadR2Config();
  const client = createR2Client(config);
  for (const u of uploads) {
    await client.send(
      new PutObjectCommand({
        Bucket: config.mediaBucket,
        Key: u.key,
        Body: u.body,
        ContentType: "application/json",
        CacheControl: u.cache,
      }),
    );
    console.log(`PUT ${u.sealed ? "immutable" : "short    "} ${u.key} (${u.body.length}B)`);
  }

  await query(
    `INSERT INTO publish_snapshots (catalog_version, page_count, item_count, max_seq, storage_prefix)
     VALUES ($1,$2,$3,$4,'feed')`,
    [args.catalogVersion, pages.length, count, latest.maxSeq],
  );
  console.log(`\nPublished ${count} item(s) to R2 feed/ (latest pointer written last).`);
}

main()
  .then(closePool)
  .catch(async (err) => {
    console.error(`publish-feed failed: ${err instanceof Error ? err.message : err}`);
    await closePool();
    process.exit(1);
  });
