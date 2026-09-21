// Seed Audio 1.0 content factory.
//
//   npm run content:seedaudio -- --file scripts/factory/scenes/coffee-shop-order.json
//   npm run content:seedaudio -- --file scripts/factory/scenes/coffee-shop-order.json --print-curl
//   npm run content:seedaudio -- --file scripts/factory/scenes/coffee-shop-order.json --out /tmp/master.mp3
//
// Scene JSON is a screenwriter brief. Seed Audio generates dialogue + ambience +
// SFX in one pass — there is no FFmpeg mixer / director timeline.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compileSeedAudioPrompt, sceneToImportDraft } from "./compile.js";
import { validateScene } from "./validate.js";
import { detectProvider, falCurl, generateSeedAudio } from "./client.js";
import { HARD_PROMPT_LIMIT } from "./types.js";
import type { SceneSpec } from "./types.js";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

function usage(): never {
  throw new Error(
    "Usage: content:seedaudio -- --file <scene.json> [--print-curl] [--out <master.mp3>] [--emit-import <item.json>]",
  );
}

async function main() {
  const file = arg("file");
  if (!file) usage();

  const scene = JSON.parse(await readFile(file, "utf-8")) as SceneSpec;
  const check = validateScene(scene);
  if (!check.ok) {
    throw new Error(`invalid scene:\n  - ${check.errors.join("\n  - ")}`);
  }

  const compiled = compileSeedAudioPrompt(scene);
  console.log(`scene ${scene.externalId}`);
  console.log(`prompt ${compiled.characterCount} chars (fal soft cap 2048, hard cap ${HARD_PROMPT_LIMIT})`);
  if (compiled.overFalLimit) console.warn("warning: prompt exceeds fal.ai 2048-char cap; trim or use another provider");
  if (compiled.overHardLimit) throw new Error(`prompt exceeds ${HARD_PROMPT_LIMIT} characters`);

  console.log("\n----- Seed Audio prompt -----\n");
  console.log(compiled.prompt);
  console.log("\n----- end prompt -----\n");

  if (flag("print-curl")) {
    console.log(falCurl(compiled.prompt, scene.multilingual ?? true));
    console.log("");
  }

  const emitImport = arg("emit-import");
  const out = arg("out");
  const promptOnly = !out;

  if (promptOnly) {
    if (emitImport) {
      const draft = sceneToImportDraft(scene);
      await mkdir(dirname(resolve(emitImport)), { recursive: true });
      await writeFile(emitImport, JSON.stringify([draft], null, 2) + "\n");
      console.log(`wrote import draft (no audio yet) ${emitImport}`);
    }
    return;
  }

  const provider = detectProvider();
  console.log(`generating via ${provider ?? "?"}…`);
  const result = await generateSeedAudio({
    prompt: compiled.prompt,
    audioUrls: scene.audioUrls,
    format: "mp3",
    sampleRate: 24000,
    multilingual: scene.multilingual ?? true,
  });
  await download(result.url, out);
  console.log(`saved ${out}`);
  console.log(`provider=${result.provider} request=${result.requestId}`);

  if (emitImport) {
    const draft = sceneToImportDraft(scene, resolve(out));
    await mkdir(dirname(resolve(emitImport)), { recursive: true });
    await writeFile(emitImport, JSON.stringify([draft], null, 2) + "\n");
    console.log(`wrote import item ${emitImport}`);
  }
}

main().catch((err) => {
  console.error(`seedaudio failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
