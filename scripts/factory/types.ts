/** Structured scene for Seed Audio 1.0. This is a screenwriter brief, not a mix timeline. */

export type SceneSpeaker = {
  name: string;
  /** Voice attributes: age, accent, timbre, pace. Rendered on first appearance. */
  voice: string;
  /** Optional Seed Audio reference: 1, 2, or 3 → @Audio1 / @Audio2 / @Audio3. */
  audioRef?: 1 | 2 | 3;
};

export type SceneLine = {
  kind: "line";
  speaker: string;
  /** Performance direction for this line only (emotion, blocking). */
  direction?: string;
  text: string;
  /** Optional Seed Audio timing control, 100ms precision: [start:end] on the line. */
  time?: { startSec: number; endSec: number };
};

export type SceneSfx = {
  kind: "sfx";
  text: string;
};

export type ScenePause = {
  kind: "pause";
  /** What we still hear in the gap. Default: a brief silence. */
  text?: string;
};

export type SceneBeat = SceneLine | SceneSfx | ScenePause;

export type SceneOption = { id: string; label: string };

export type SceneSpec = {
  externalId: string;
  question: string;
  options: SceneOption[];
  answerId: string;

  /** Genre / style, e.g. "everyday spoken American English". */
  genre?: string;
  /** Place and situation. */
  setting: string;
  mood?: string;
  /** Continuous sound bed under the whole scene. One bed, not a stem list. */
  bed: string;
  speakers: SceneSpeaker[];
  beats: SceneBeat[];
  closing?: string;

  language?: string;
  locale?: string;
  accent?: string;
  topic?: string;
  scenario?: string;
  format?: "dialogue" | "monologue";
  level?: string;
  title?: string;

  /** Public URLs for TA2A voice references, order matching audioRef 1..3. */
  audioUrls?: string[];
  /** Prefer the 20-language Seed Audio variant (timing control + non-EN/ZH). */
  multilingual?: boolean;
};

export type CompiledPrompt = {
  prompt: string;
  characterCount: number;
  overFalLimit: boolean;
  overHardLimit: boolean;
};

/** fal.ai prompt cap reported in their guide; official playground allows ~3000. */
export const FAL_PROMPT_LIMIT = 2048;
export const HARD_PROMPT_LIMIT = 3000;
