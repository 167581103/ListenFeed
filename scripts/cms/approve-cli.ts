// Promote content to published (the governance gate; agents must NOT call this).
// Assigns a stable global publish sequence on first publish, writes an audit log.
//
//   npm run content:approve -- --external-id coffee-shop-order-001
//   npm run content:approve -- --all-drafts
import { getPool, withTransaction, closePool } from "./db.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const externalId = arg("external-id");
  const allDrafts = process.argv.includes("--all-drafts");
  if (!externalId && !allDrafts) {
    throw new Error("Usage: content:approve -- (--external-id <id> | --all-drafts)");
  }

  const pool = getPool();
  const rows = allDrafts
    ? (await pool.query<{ id: string; external_id: string }>(
        "SELECT id, external_id FROM feed_items WHERE status IN ('draft','reviewing','generated')",
      )).rows
    : (await pool.query<{ id: string; external_id: string }>(
        "SELECT id, external_id FROM feed_items WHERE external_id=$1",
        [externalId],
      )).rows;

  if (rows.length === 0) {
    console.log("no matching items to approve");
    await closePool();
    return;
  }

  for (const row of rows) {
    await withTransaction(async (client) => {
      // Assign a publish seq only the first time; keep it stable afterwards.
      const upd = await client.query<{ published_seq: string }>(
        `UPDATE feed_items
           SET status='published',
               published_at=COALESCE(published_at, now()),
               published_seq=COALESCE(published_seq, nextval('feed_publish_seq'))
         WHERE id=$1
         RETURNING published_seq`,
        [row.id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor, action, entity_type, entity_id, detail)
         VALUES ('admin','publish','feed_item',$1,$2)`,
        [row.external_id, JSON.stringify({ publishedSeq: upd.rows[0].published_seq })],
      );
      console.log(`published ${row.external_id} (seq=${upd.rows[0].published_seq})`);
    });
  }

  await closePool();
}

main().catch(async (err) => {
  console.error(`approve failed: ${err instanceof Error ? err.message : err}`);
  await closePool();
  process.exit(1);
});
