// Apply SQL migrations in database/*.sql that haven't run yet.
//
// Statements are executed one-by-one in autocommit (not wrapped in a single
// transaction) so that `ALTER TYPE ... ADD VALUE` is allowed. Migrations are
// written idempotently (IF NOT EXISTS), so re-running is safe.
//
//   npm run db:migrate
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool, query, closePool } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "..", "database");

/** Split SQL into top-level statements, ignoring line comments. */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  getPool();
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await query<{ filename: string }>("SELECT filename FROM schema_migrations")).rows.map(
      (r) => r.filename,
    ),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    const statements = splitStatements(sql);
    console.log(`apply ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await query(stmt);
    }
    await query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
  }

  console.log("migrations up to date");
  await closePool();
}

main().catch(async (err) => {
  console.error(`migrate failed: ${err instanceof Error ? err.message : err}`);
  await closePool();
  process.exit(1);
});
