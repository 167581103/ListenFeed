// Upload one item's audio to Cloudflare R2 in the content-addressed layout the
// CMS and feed expect:
//
//   audio/{content_hash}/master.wav    -> private masters bucket (original)
//   audio/{content_hash}/speech.webm   -> public media bucket (Opus)
//   audio/{content_hash}/speech.mp3    -> public media bucket (MP3 fallback)
//
// Optimized objects are written with a one-year immutable Cache-Control so the
// CDN (and browsers) can cache them forever; the content hash guarantees a
// changed recording lands at a new key instead of colliding with a cached one.
//
// Usage:
//   node scripts/upload-audio.mjs --slug coffee-shop --webm a.webm --mp3 a.mp3 \
//     [--master master.wav] [--legacy-webm-key audio/x.webm] \
//     [--legacy-mp3-key audio/x.mp3] [--dry-run]
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client, loadR2Config, publicUrl } from "./r2-client.mjs";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const CONTENT_TYPES = {
  webm: "audio/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "dry-run") {
      args[key] = true;
      continue;
    }
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function contentHash(buffers) {
  const hash = createHash("sha256");
  for (const buf of buffers) hash.update(buf);
  return hash.digest("hex").slice(0, 16);
}

async function putObject(client, { bucket, key, body, contentType, cacheControl }) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, webm, mp3, master } = args;

  if (!slug || !webm || !mp3) {
    throw new Error(
      "Usage: node scripts/upload-audio.mjs --slug <slug> --webm <file> --mp3 <file> " +
        "[--master <file>] [--legacy-webm-key <key>] [--legacy-mp3-key <key>] [--dry-run]",
    );
  }

  const config = loadR2Config();
  const [webmBody, mp3Body] = await Promise.all([readFile(webm), readFile(mp3)]);
  const masterBody = master ? await readFile(master) : null;

  // Base the item's content hash on the master when present so every encoding of
  // the same recording shares one directory; otherwise derive it from the
  // optimized outputs (legacy items predate the masters bucket).
  const hash = masterBody ? contentHash([masterBody]) : contentHash([webmBody, mp3Body]);

  const speechWebmKey = `audio/${hash}/speech.webm`;
  const speechMp3Key = `audio/${hash}/speech.mp3`;
  const masterKey = `audio/${hash}/master.wav`;

  const plan = [
    { bucket: config.mediaBucket, key: speechWebmKey, body: webmBody, contentType: CONTENT_TYPES.webm, cacheControl: IMMUTABLE_CACHE, visibility: "public" },
    { bucket: config.mediaBucket, key: speechMp3Key, body: mp3Body, contentType: CONTENT_TYPES.mp3, cacheControl: IMMUTABLE_CACHE, visibility: "public" },
  ];

  if (masterBody) {
    plan.push({ bucket: config.mastersBucket, key: masterKey, body: masterBody, contentType: CONTENT_TYPES.wav, cacheControl: undefined, visibility: "private" });
  }

  // Optional non-breaking safety net: also publish the optimized bytes at the
  // caller's legacy public keys so an interim deploy still resolves audio.
  if (args["legacy-webm-key"]) {
    plan.push({ bucket: config.mediaBucket, key: args["legacy-webm-key"].replace(/^\//, ""), body: webmBody, contentType: CONTENT_TYPES.webm, cacheControl: IMMUTABLE_CACHE, visibility: "public" });
  }
  if (args["legacy-mp3-key"]) {
    plan.push({ bucket: config.mediaBucket, key: args["legacy-mp3-key"].replace(/^\//, ""), body: mp3Body, contentType: CONTENT_TYPES.mp3, cacheControl: IMMUTABLE_CACHE, visibility: "public" });
  }

  console.log(`slug:          ${slug} (${basename(webm)} / ${basename(mp3)})`);
  console.log(`content_hash:  ${hash}`);
  console.log("");

  const client = args["dry-run"] ? null : createR2Client(config);

  for (const item of plan) {
    if (args["dry-run"]) {
      console.log(`[dry-run] would PUT ${item.visibility} ${item.bucket}/${item.key} (${item.body.length} bytes, ${item.contentType})`);
      continue;
    }
    await putObject(client, item);
    console.log(`PUT ${item.visibility.padEnd(7)} ${item.key} (${item.body.length} bytes, ${item.contentType})`);
  }

  console.log("");
  console.log("Library keys (relative; lib/media.ts prepends the media base):");
  console.log(`  webm: /${speechWebmKey}`);
  console.log(`  mp3:  /${speechMp3Key}`);
  console.log("");
  console.log("Public URLs:");
  console.log(`  webm: ${publicUrl(config, speechWebmKey)}`);
  console.log(`  mp3:  ${publicUrl(config, speechMp3Key)}`);
}

main().catch((err) => {
  console.error(`upload-audio failed: ${err.message}`);
  process.exit(1);
});
