// Batch-import content into Neon (drafts).
//
//   npm run content:import -- --file items.json
//   npm run content:import -- --from-library      # seed from data/library.ts
//
// items.json is an array (or { "items": [...] }) of ImportItem (see validate.ts).
import { readFile } from "node:fs/promises";
import { importItems, type ImportResult } from "./import.js";
import { closePool } from "./db.js";
import type { ImportItem } from "./validate.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadFromLibrary(): Promise<ImportItem[]> {
  const { library } = await import("../../data/library.js");
  return library.map((it) => ({
    externalId: it.id,
    question: it.question,
    options: it.options,
    answerId: it.answerId,
    transcript: it.transcript,
    durationMs: it.durationMs,
    audio: it.audio,
  }));
}

function printResult(result: ImportResult): void {
  console.log(`\nimport job ${result.jobId}`);
  console.log(`total=${result.total} succeeded=${result.succeeded} failed=${result.failed}`);
  for (const r of result.items) {
    const tag = r.status === "failed" ? `FAILED${r.retryable ? " (retryable)" : ""}` : r.status;
    console.log(`  [${r.position}] ${r.externalId ?? "?"}: ${tag}${r.error ? ` — ${r.error}` : ""}`);
  }
}

async function main() {
  const file = arg("file");
  const fromLibrary = process.argv.includes("--from-library");

  let items: unknown[];
  if (fromLibrary) {
    items = await loadFromLibrary();
  } else if (file) {
    const parsed = JSON.parse(await readFile(file, "utf-8"));
    items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) throw new Error("file must be a JSON array or { items: [...] }");
  } else {
    throw new Error("Usage: content:import -- (--file <items.json> | --from-library)");
  }

  const result = await importItems(items, { source: fromLibrary ? "library" : (file ?? "unknown") });
  printResult(result);
  await closePool();
  if (result.failed > 0 && process.argv.includes("--fail-on-error")) process.exit(1);
}

main().catch(async (err) => {
  console.error(`import failed: ${err instanceof Error ? err.message : err}`);
  await closePool();
  process.exit(1);
});
