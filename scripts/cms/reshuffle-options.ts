// Ops helper: deterministically reshuffle feed_options so the correct answer is
// not stuck at position 0 for every item (content factories often emit
// answer-first). Safe to re-run; uses the same seed as import (external_id).
import { getPool, closePool, withTransaction } from "./db.js";
import { shuffleWithSeed } from "../../lib/shuffle.js";

async function main() {
  const pool = getPool();
  const items = await pool.query<{ id: string; external_id: string }>(
    "SELECT id, external_id FROM feed_items ORDER BY published_seq NULLS LAST, created_at",
  );

  let updated = 0;
  for (const item of items.rows) {
    await withTransaction(async (client) => {
      const opts = await client.query<{
        label: string;
        is_correct: boolean;
        position: number;
      }>(
        `SELECT label, is_correct, position
           FROM feed_options WHERE feed_item_id=$1 ORDER BY position`,
        [item.id],
      );
      if (opts.rows.length < 2) return;

      const shuffled = shuffleWithSeed(opts.rows, item.external_id);
      await client.query("DELETE FROM feed_options WHERE feed_item_id=$1", [item.id]);
      for (const [i, row] of shuffled.entries()) {
        await client.query(
          `INSERT INTO feed_options (feed_item_id, option_key, label, is_correct, position)
           VALUES ($1,$2,$3,$4,$5)`,
          [item.id, String.fromCharCode(97 + i), row.label, row.is_correct, i],
        );
      }

      const correctPos = shuffled.findIndex((r) => r.is_correct);
      console.log(
        `${item.external_id}: correct -> pos ${correctPos} key ${String.fromCharCode(97 + correctPos)}`,
      );
      updated += 1;
    });
  }

  console.log(`reshuffled ${updated} item(s)`);
}

main()
  .then(closePool)
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closePool();
    process.exit(1);
  });
