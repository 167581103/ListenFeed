// Batch import: validate -> resolve audio -> idempotent upsert into Neon.
// Creates an import_job with one import_job_item per row and a full result
// summary (total / succeeded / failed / per-row error + retryable).
import type { PoolClient } from "pg";
import { getPool, withTransaction } from "./db.js";
import { validateImportItem, type ImportItem } from "./validate.js";
import {
  transcodeAndUpload,
  audioKeys,
  headSizes,
  hashFromKey,
  mediaPublicBase,
} from "./audio.js";

export type ImportItemResult = {
  position: number;
  externalId: string | null;
  status: "created" | "updated" | "failed";
  error?: string;
  retryable: boolean;
  feedItemId?: string;
};

export type ImportResult = {
  jobId: string;
  total: number;
  succeeded: number;
  failed: number;
  items: ImportItemResult[];
};

type ResolvedAudio = {
  contentHash: string;
  durationMs: number;
  mp3Key: string;
  webmKey: string;
  masterKey: string | null;
  mp3ByteSize: number;
  webmByteSize: number;
};

async function resolveAudio(item: ImportItem): Promise<ResolvedAudio> {
  if (item.masterPath) {
    const up = await transcodeAndUpload(item.masterPath);
    return {
      contentHash: up.contentHash,
      durationMs: up.durationMs,
      mp3Key: `/${up.mp3Key}`,
      webmKey: `/${up.webmKey}`,
      masterKey: `/${up.masterKey}`,
      mp3ByteSize: up.mp3ByteSize,
      webmByteSize: up.webmByteSize,
    };
  }

  // Reference already-uploaded audio (by hash or explicit keys).
  const hash = item.audioContentHash ?? (item.audio ? hashFromKey(item.audio.mp3) : null);
  if (!hash) throw new Error("could not determine audio content hash");
  const keys = audioKeys(hash);
  const mp3Key = item.audio?.mp3 ?? `/${keys.mp3Key}`;
  const webmKey = item.audio?.webm ?? `/${keys.webmKey}`;
  const sizes = await headSizes(mp3Key, webmKey);
  if (!(sizes.mp3ByteSize > 0)) throw new Error(`audio not found in R2 for hash ${hash}`);
  return {
    contentHash: hash,
    durationMs: item.durationMs as number,
    mp3Key,
    webmKey,
    masterKey: null,
    mp3ByteSize: sizes.mp3ByteSize,
    webmByteSize: sizes.webmByteSize,
  };
}

async function upsertAudioAsset(client: PoolClient, a: ResolvedAudio): Promise<string> {
  const publicUrl = `${mediaPublicBase()}${a.mp3Key}`;
  const res = await client.query<{ id: string }>(
    `INSERT INTO audio_assets (storage_key, public_url, mime_type, byte_size, duration_ms, content_hash, master_key, webm_byte_size)
     VALUES ($1,$2,'audio/mpeg',$3,$4,$5,$6,$7)
     ON CONFLICT (content_hash) DO UPDATE SET
       storage_key = EXCLUDED.storage_key, public_url = EXCLUDED.public_url,
       byte_size = EXCLUDED.byte_size, duration_ms = EXCLUDED.duration_ms,
       master_key = EXCLUDED.master_key, webm_byte_size = EXCLUDED.webm_byte_size
     RETURNING id`,
    [a.mp3Key, publicUrl, a.mp3ByteSize, a.durationMs, a.contentHash, a.masterKey, a.webmByteSize],
  );
  return res.rows[0].id;
}

async function importOneItem(item: ImportItem): Promise<{ status: "created" | "updated"; feedItemId: string }> {
  const audio = await resolveAudio(item);

  return withTransaction(async (client) => {
    const audioAssetId = await upsertAudioAsset(client, audio);

    const existing = await client.query<{ id: string; content_version: number }>(
      "SELECT id, content_version FROM feed_items WHERE external_id = $1",
      [item.externalId],
    );

    const title = item.title ?? item.question;
    const eyebrow = item.eyebrow ?? "Listening";
    const level = item.level ?? "A2";
    const explanation = item.explanation ?? "";

    let feedItemId: string;
    let version: number;
    let created: boolean;

    if (existing.rows.length > 0) {
      feedItemId = existing.rows[0].id;
      version = existing.rows[0].content_version + 1;
      created = false;
      await client.query(
        `UPDATE feed_items SET
           title=$2, eyebrow=$3, level=$4, question=$5, explanation=$6, audio_asset_id=$7,
           content_version=$8, language=$9, locale=$10, accent=$11, topic=$12, scenario=$13,
           format=$14, speech_rate=$15, updated_at=now()
         WHERE id=$1`,
        [feedItemId, title, eyebrow, level, item.question, explanation, audioAssetId, version,
          item.language ?? null, item.locale ?? null, item.accent ?? null, item.topic ?? null,
          item.scenario ?? null, item.format ?? null, item.speechRate ?? null],
      );
    } else {
      version = 1;
      created = true;
      const ins = await client.query<{ id: string }>(
        `INSERT INTO feed_items
           (slug, external_id, title, eyebrow, level, question, explanation, audio_asset_id,
            status, content_version, language, locale, accent, topic, scenario, format, speech_rate)
         VALUES ($1,$1,$2,$3,$4,$5,$6,$7,'draft',1,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [item.externalId, title, eyebrow, level, item.question, explanation, audioAssetId,
          item.language ?? null, item.locale ?? null, item.accent ?? null, item.topic ?? null,
          item.scenario ?? null, item.format ?? null, item.speechRate ?? null],
      );
      feedItemId = ins.rows[0].id;
    }

    // Replace options (remap arbitrary ids to positional letter keys the schema expects).
    await client.query("DELETE FROM feed_options WHERE feed_item_id=$1", [feedItemId]);
    for (const [i, opt] of item.options.entries()) {
      await client.query(
        `INSERT INTO feed_options (feed_item_id, option_key, label, is_correct, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [feedItemId, String.fromCharCode(97 + i), opt.label, opt.id === item.answerId, i],
      );
    }

    // Replace transcript.
    await client.query("DELETE FROM transcript_lines WHERE feed_item_id=$1", [feedItemId]);
    for (const [i, line] of (item.transcript ?? []).entries()) {
      await client.query(
        `INSERT INTO transcript_lines (feed_item_id, speaker_key, speaker_label, line, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [feedItemId, line.speaker.toLowerCase().replace(/\s+/g, "_") || "speaker", line.speaker, line.line, i],
      );
    }

    // Version history + audit.
    await client.query(
      `INSERT INTO content_versions (feed_item_id, version, snapshot, created_by)
       VALUES ($1,$2,$3,'content-toolkit') ON CONFLICT (feed_item_id, version) DO NOTHING`,
      [feedItemId, version, JSON.stringify(item)],
    );
    await client.query(
      `INSERT INTO audit_logs (actor, action, entity_type, entity_id, detail)
       VALUES ('content-toolkit', $1, 'feed_item', $2, $3)`,
      [created ? "import.create" : "import.update", item.externalId, JSON.stringify({ contentHash: audio.contentHash, version })],
    );

    return { status: created ? "created" : "updated", feedItemId };
  });
}

export async function importItems(
  items: unknown[],
  opts: { source: string },
): Promise<ImportResult> {
  const pool = getPool();
  const job = await pool.query<{ id: string }>(
    "INSERT INTO import_jobs (source, total) VALUES ($1,$2) RETURNING id",
    [opts.source, items.length],
  );
  const jobId = job.rows[0].id;

  const results: ImportItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const [position, raw] of items.entries()) {
    const item = raw as ImportItem;
    const externalId = item && typeof item === "object" ? (item.externalId ?? null) : null;
    const validation = validateImportItem(raw);

    if (!validation.ok) {
      failed += 1;
      results.push({ position, externalId, status: "failed", error: validation.errors.join("; "), retryable: false });
    } else {
      try {
        const r = await importOneItem(item);
        succeeded += 1;
        results.push({ position, externalId, status: r.status, retryable: false, feedItemId: r.feedItemId });
      } catch (err) {
        failed += 1;
        // Infra/transcode/DB errors are worth retrying; bad input already failed validation.
        results.push({ position, externalId, status: "failed", error: err instanceof Error ? err.message : String(err), retryable: true });
      }
    }

    await pool.query(
      `INSERT INTO import_job_items (import_job_id, position, external_id, status, error, retryable, feed_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [jobId, position, externalId, results[results.length - 1].status, results[results.length - 1].error ?? null,
        results[results.length - 1].retryable, results[results.length - 1].feedItemId ?? null],
    );
  }

  await pool.query(
    "UPDATE import_jobs SET status='completed', succeeded=$2, failed=$3, finished_at=now() WHERE id=$1",
    [jobId, succeeded, failed],
  );

  return { jobId, total: items.length, succeeded, failed, items: results };
}
