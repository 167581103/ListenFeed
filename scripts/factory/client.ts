/** Thin HTTP clients for Seed Audio 1.0. No SDK — ops scripts only. */

export type SeedAudioInput = {
  prompt: string;
  audioUrls?: string[];
  imageUrl?: string;
  format?: "wav" | "mp3" | "pcm" | "ogg_opus";
  sampleRate?: number;
  speed?: number;
  volume?: number;
  multilingual?: boolean;
};

export type SeedAudioResult = {
  provider: string;
  requestId: string;
  url: string;
};

export type SeedAudioProvider = "fal" | "evolink";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function detectProvider(): SeedAudioProvider | null {
  const forced = process.env.SEEDAUDIO_PROVIDER as SeedAudioProvider | undefined;
  if (forced === "fal" || forced === "evolink") return forced;
  if (process.env.FAL_KEY) return "fal";
  if (process.env.EVOLINK_API_KEY) return "evolink";
  return null;
}

export async function generateSeedAudio(input: SeedAudioInput): Promise<SeedAudioResult> {
  const provider = detectProvider();
  if (!provider) {
    throw new Error(
      "No Seed Audio credentials. Set FAL_KEY (fal.ai) or EVOLINK_API_KEY, or omit --out to compile the prompt only.",
    );
  }
  if (provider === "fal") return generateFal(input);
  return generateEvolink(input);
}

async function generateFal(input: SeedAudioInput): Promise<SeedAudioResult> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const body = {
    prompt: input.prompt,
    audio_urls: input.audioUrls,
    image_url: input.imageUrl,
    output_format: input.format ?? "mp3",
    sample_rate: input.sampleRate ?? 24000,
    speed: input.speed ?? 1,
    volume: input.volume ?? 1,
    multilingual: input.multilingual ?? true,
  };
  const submit = await fetch("https://queue.fal.run/bytedance/seed-audio-1.0", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const submitted = await readJson(submit);
  const requestId = String(submitted.request_id ?? submitted.requestId ?? "");
  if (!requestId) throw new Error(`fal submit missing request_id: ${JSON.stringify(submitted)}`);

  const statusUrl =
    String(submitted.status_url ?? "") ||
    `https://queue.fal.run/bytedance/seed-audio-1.0/requests/${requestId}/status`;
  const resultUrl =
    String(submitted.response_url ?? "") ||
    `https://queue.fal.run/bytedance/seed-audio-1.0/requests/${requestId}`;

  const deadline = Date.now() + 5 * 60 * 1000;
  let completed = false;
  while (Date.now() < deadline) {
    const statusRes = await fetch(statusUrl, { headers });
    const status = await readJson(statusRes);
    const state = String(status.status ?? "");
    if (state === "COMPLETED") {
      completed = true;
      break;
    }
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`fal generation ${state}: ${JSON.stringify(status)}`);
    }
    await sleep(2500);
  }
  if (!completed) throw new Error(`fal generation timed out for ${requestId}`);

  const resultRes = await fetch(resultUrl, { headers });
  const result = await readJson(resultRes);
  const url = result.audio?.url ?? result.data?.audio?.url;
  if (!url) throw new Error(`fal result missing audio.url: ${JSON.stringify(result)}`);
  return { provider: "fal", requestId, url };
}

async function generateEvolink(input: SeedAudioInput): Promise<SeedAudioResult> {
  const key = process.env.EVOLINK_API_KEY;
  if (!key) throw new Error("EVOLINK_API_KEY is not set");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const submit = await fetch("https://api.evolink.ai/v1/audios/generations", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "doubao-seed-audio-1-0",
      prompt: input.prompt,
      audio_references: input.audioUrls,
      image_urls: input.imageUrl ? [input.imageUrl] : undefined,
      format: input.format ?? "mp3",
      sample_rate: input.sampleRate ?? 24000,
      speech_rate: input.speed ?? 1,
      loudness_rate: input.volume ?? 1,
    }),
  });
  const submitted = await readJson(submit);
  const requestId = String(submitted.id ?? "");
  if (!requestId) throw new Error(`evolink submit missing id: ${JSON.stringify(submitted)}`);

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const poll = await fetch(`https://api.evolink.ai/v1/tasks/${requestId}`, { headers });
    const status = await readJson(poll);
    const state = String(status.status ?? "");
    if (state === "completed") {
      const url =
        status.result?.url ??
        status.output?.url ??
        status.audio?.url ??
        status.task_info?.audio_url;
      if (!url) throw new Error(`evolink completed without audio url: ${JSON.stringify(status)}`);
      return { provider: "evolink", requestId, url };
    }
    if (state === "failed" || state === "cancelled") {
      throw new Error(`evolink generation ${state}: ${JSON.stringify(status)}`);
    }
    await sleep(2500);
  }
  throw new Error(`evolink generation timed out for ${requestId}`);
}

async function readJson(res: Response): Promise<Record<string, any>> {
  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 800)}`);
  }
  return parsed;
}

export function falCurl(prompt: string, multilingual = true): string {
  const payload = JSON.stringify({
    prompt,
    output_format: "mp3",
    sample_rate: 24000,
    multilingual,
  });
  return [
    "curl -sS -X POST https://queue.fal.run/bytedance/seed-audio-1.0 \\",
    '  -H "Authorization: Key $FAL_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '${payload.replace(/'/g, `'\\''`)}'`,
  ].join("\n");
}
