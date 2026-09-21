import type { CompiledPrompt, SceneSpec, SceneSpeaker } from "./types.js";
import { FAL_PROMPT_LIMIT, HARD_PROMPT_LIMIT } from "./types.js";
import { validateScene } from "./validate.js";

function bracket(text: string): string {
  const inner = text.replace(/^\[/, "").replace(/\]$/, "").trim();
  return `[${inner}]`;
}

function fmtSec(n: number): string {
  return `${n.toFixed(1)}s`;
}

function header(scene: SceneSpec): string {
  return [scene.genre, scene.setting, scene.mood].filter(Boolean).join(". ");
}

function voiceParen(speaker: SceneSpeaker, first: boolean, lineDirection?: string): string {
  const bits: string[] = [];
  if (first) bits.push(speaker.voice);
  if (lineDirection) bits.push(lineDirection);
  if (speaker.audioRef) bits.push(`voiced by @Audio${speaker.audioRef}`);
  return bits.length ? ` (${bits.join(", ")})` : "";
}

function spokenLine(
  speaker: SceneSpeaker,
  first: boolean,
  text: string,
  direction?: string,
  time?: { startSec: number; endSec: number },
): string {
  const timed = time ? `[${fmtSec(time.startSec)}:${fmtSec(time.endSec)}] ${text}` : text;
  return `${speaker.name}${voiceParen(speaker, first, direction)} says: "${timed}"`;
}

/**
 * Compile a scene spec into one Seed Audio 1.0 T2A prompt.
 * Seed Audio jointly models dialogue, SFX, and ambience — this is not an FFmpeg cue sheet.
 */
export function compileSeedAudioPrompt(scene: SceneSpec): CompiledPrompt {
  const check = validateScene(scene);
  if (!check.ok) throw new Error(check.errors.join("; "));

  const byName = new Map(scene.speakers.map((s) => [s.name, s]));
  const seen = new Set<string>();
  const parts: string[] = [bracket(header(scene)), bracket(scene.bed)];

  for (const beat of scene.beats) {
    if (beat.kind === "sfx" || beat.kind === "pause") {
      parts.push(bracket(beat.kind === "pause" ? (beat.text ?? "A brief silence.") : beat.text));
      continue;
    }
    const speaker = byName.get(beat.speaker);
    if (!speaker) throw new Error(`unknown speaker ${beat.speaker}`);
    const first = !seen.has(speaker.name);
    seen.add(speaker.name);
    parts.push(spokenLine(speaker, first, beat.text, beat.direction, beat.time));
  }

  if (scene.closing) parts.push(bracket(scene.closing));

  const prompt = parts.join("\n");
  return {
    prompt,
    characterCount: prompt.length,
    overFalLimit: prompt.length > FAL_PROMPT_LIMIT,
    overHardLimit: prompt.length > HARD_PROMPT_LIMIT,
  };
}

export type ImportDraft = {
  externalId: string;
  question: string;
  options: SceneSpec["options"];
  answerId: string;
  transcript: { speaker: string; line: string }[];
  language?: string;
  locale?: string;
  accent?: string;
  topic?: string;
  scenario?: string;
  format?: SceneSpec["format"];
  level?: string;
  title?: string;
  masterPath?: string;
};

export function sceneToImportDraft(scene: SceneSpec, masterPath?: string): ImportDraft {
  const check = validateScene(scene);
  if (!check.ok) throw new Error(check.errors.join("; "));
  return {
    externalId: scene.externalId,
    question: scene.question,
    options: scene.options,
    answerId: scene.answerId,
    transcript: scene.beats
      .filter((b): b is Extract<typeof b, { kind: "line" }> => b.kind === "line")
      .map((b) => ({ speaker: b.speaker, line: b.text })),
    language: scene.language,
    locale: scene.locale,
    accent: scene.accent,
    topic: scene.topic,
    scenario: scene.scenario,
    format: scene.format ?? "dialogue",
    level: scene.level,
    title: scene.title,
    masterPath,
  };
}
