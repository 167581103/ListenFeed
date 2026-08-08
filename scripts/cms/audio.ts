// Turn a master recording into the two web encodings and upload everything to
// R2 in the content-addressed layout (audio/{hash}/master.wav|speech.webm|speech.mp3).
// Mirrors scripts/encode-audio.sh (mono 24kHz; MP3 64k + Opus 32k).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
// @ts-expect-error - plain ESM helper shared with the other ops scripts.
import { createR2Client, loadR2Config } from "../r2-client.mjs";

const run = promisify(execFile);
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export type UploadedAudio = {
  contentHash: string;
  durationMs: number;
  mp3Key: string;
  webmKey: string;
  masterKey: string;
  mp3ByteSize: number;
  webmByteSize: number;
  publicMp3Url: string;
};

/** Public media base used to build browser-facing URLs. */
export function mediaPublicBase(): string {
  return loadR2Config().publicBaseUrl as string;
}

/** Extract the content hash from an audio key like /audio/{hash}/speech.mp3. */
export function hashFromKey(key: string): string | null {
  const m = key.match(/audio\/([^/]+)\/speech\./);
  return m ? m[1] : null;
}

/** HEAD the already-uploaded encodings to record their byte sizes. */
export async function headSizes(mp3Key: string, webmKey: string): Promise<{ mp3ByteSize: number; webmByteSize: number }> {
  const config = loadR2Config();
  const client = createR2Client(config);
  const head = async (key: string) => {
    const r = await client.send(new HeadObjectCommand({ Bucket: config.mediaBucket, Key: key.replace(/^\//, "") }));
    return r.ContentLength ?? 0;
  };
  const [mp3ByteSize, webmByteSize] = await Promise.all([head(mp3Key), head(webmKey)]);
  return { mp3ByteSize, webmByteSize };
}

export function audioKeys(contentHash: string) {
  return {
    masterKey: `audio/${contentHash}/master.wav`,
    webmKey: `audio/${contentHash}/speech.webm`,
    mp3Key: `audio/${contentHash}/speech.mp3`,
  };
}

async function probeDurationMs(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path,
  ]);
  return Math.round(Number.parseFloat(stdout.trim()) * 1000);
}

/** Transcode a master file and upload master (private) + speech.{webm,mp3} (public). */
export async function transcodeAndUpload(masterPath: string): Promise<UploadedAudio> {
  const masterBuf = await readFile(masterPath);
  const contentHash = createHash("sha256").update(masterBuf).digest("hex").slice(0, 16);
  const { masterKey, webmKey, mp3Key } = audioKeys(contentHash);

  const dir = await mkdtemp(join(tmpdir(), "listenfeed-"));
  try {
    const mp3Path = join(dir, "out.mp3");
    const webmPath = join(dir, "out.webm");
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", masterPath, "-ac", "1", "-ar", "24000",
      "-b:a", "64k", "-map_metadata", "-1", mp3Path,
    ]);
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", masterPath, "-ac", "1", "-ar", "24000",
      "-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-application", "audio",
      "-map_metadata", "-1", webmPath,
    ]);

    const [mp3Buf, webmBuf, durationMs] = await Promise.all([
      readFile(mp3Path),
      readFile(webmPath),
      probeDurationMs(masterPath),
    ]);

    const config = loadR2Config();
    const client = createR2Client(config);
    const put = (bucket: string, key: string, body: Buffer, type: string, cache?: string) =>
      client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: type, CacheControl: cache }));

    await put(config.mastersBucket, masterKey, masterBuf, "audio/wav");
    await put(config.mediaBucket, webmKey, webmBuf, "audio/webm", IMMUTABLE_CACHE);
    await put(config.mediaBucket, mp3Key, mp3Buf, "audio/mpeg", IMMUTABLE_CACHE);

    return {
      contentHash,
      durationMs,
      mp3Key,
      webmKey,
      masterKey,
      mp3ByteSize: mp3Buf.length,
      webmByteSize: webmBuf.length,
      publicMp3Url: `${config.publicBaseUrl}/${mp3Key}`,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
