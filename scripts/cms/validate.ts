// Input contract for the content factory + pure validation (unit-tested).

export type ImportOption = { id: string; label: string };
export type LearningMode = "quiz" | "sentence-listening";

export type ImportTranscriptLine = {
  speaker: string;
  line: string;
  translation?: string;
  terms?: string[];
  startMs?: number;
  endMs?: number;
};

export type ImportItem = {
  /** Idempotency key from the content factory. Required. */
  externalId: string;
  /** Defaults to quiz so existing multiple-choice imports stay valid. */
  learningMode?: LearningMode;
  question: string;
  options?: ImportOption[];
  answerId?: string;
  transcript?: ImportTranscriptLine[];
  durationMs?: number;

  // Audio source — exactly one of:
  masterPath?: string; // local master file to transcode + upload
  audioContentHash?: string; // already-uploaded audio (audio/{hash}/speech.*)
  audio?: { webm: string; mp3: string }; // explicit relative keys (advanced)

  // Optional metadata (defaults applied on insert).
  title?: string;
  eyebrow?: string;
  level?: string;
  explanation?: string;
  language?: string;
  locale?: string;
  accent?: string;
  topic?: string;
  scenario?: string;
  format?: "dialogue" | "monologue";
  speechRate?: number;
  /** Framework-specific level such as JLPT N5. CEFR remains in `level`. */
  proficiency?: string;
  tags?: string[];
};

export type ValidationResult = { ok: boolean; errors: string[]; retryable: boolean };

const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

/**
 * Validate a single import item. Content errors are non-retryable (bad input);
 * they never surface as retryable so a naive retry loop won't spin on them.
 */
export function validateImportItem(item: unknown): ValidationResult {
  const errors: string[] = [];
  const it = item as Partial<ImportItem> | null;

  if (!it || typeof it !== "object") {
    return { ok: false, errors: ["item is not an object"], retryable: false };
  }

  if (!it.externalId || typeof it.externalId !== "string") errors.push("externalId is required");
  if (!it.question || typeof it.question !== "string") errors.push("question is required");
  const learningMode = it.learningMode ?? "quiz";
  if (learningMode !== "quiz" && learningMode !== "sentence-listening") {
    errors.push("learningMode must be quiz or sentence-listening");
  }

  if (learningMode === "quiz") {
    if (!Array.isArray(it.options) || it.options.length < 2) {
      errors.push("at least 2 options are required");
    } else {
      const ids = new Set<string>();
      for (const [i, opt] of it.options.entries()) {
        if (!opt || typeof opt.id !== "string" || typeof opt.label !== "string") {
          errors.push(`option ${i} must have string id and label`);
          continue;
        }
        if (ids.has(opt.id)) errors.push(`duplicate option id "${opt.id}"`);
        ids.add(opt.id);
      }
      if (typeof it.answerId !== "string" || !ids.has(it.answerId)) {
        errors.push("answerId must match one of the option ids");
      }
    }
  } else if (it.options != null || it.answerId != null) {
    errors.push("sentence-listening items do not take quiz options");
  }

  const audioSources = [it.masterPath, it.audioContentHash, it.audio].filter((v) => v != null);
  if (audioSources.length === 0) {
    errors.push("one audio source is required (masterPath | audioContentHash | audio)");
  } else if (audioSources.length > 1) {
    errors.push("provide exactly one audio source");
  }
  if (it.audio && (typeof it.audio.webm !== "string" || typeof it.audio.mp3 !== "string")) {
    errors.push("audio must have webm and mp3 keys");
  }
  if ((it.audioContentHash || it.audio) && it.durationMs == null) {
    errors.push("durationMs is required when not transcoding a master");
  }
  if (it.level != null && !LEVELS.has(it.level)) {
    errors.push(`level must be one of ${[...LEVELS].join(", ")}`);
  }
  if (it.proficiency != null && typeof it.proficiency !== "string") {
    errors.push("proficiency must be a string");
  }
  if (learningMode === "sentence-listening" && (!Array.isArray(it.transcript) || it.transcript.length === 0)) {
    errors.push("sentence-listening requires a timed transcript");
  }
  if (it.transcript != null && !Array.isArray(it.transcript)) {
    errors.push("transcript must be an array");
  } else {
    for (const [i, line] of (it.transcript ?? []).entries()) {
      if (!line || typeof line.speaker !== "string" || typeof line.line !== "string") {
        errors.push(`transcript line ${i} must have speaker and line strings`);
        continue;
      }
      if (line.translation != null && typeof line.translation !== "string") {
        errors.push(`transcript line ${i} translation must be a string`);
      }
      if (line.terms != null && (!Array.isArray(line.terms) || line.terms.some((term) => typeof term !== "string" || term === ""))) {
        errors.push(`transcript line ${i} terms must be non-empty strings`);
      }
      const hasStart = line.startMs != null;
      const hasEnd = line.endMs != null;
      if (learningMode === "sentence-listening" && (!hasStart || !hasEnd)) {
        errors.push(`transcript line ${i} requires startMs and endMs`);
      }
      if (hasStart !== hasEnd) {
        errors.push(`transcript line ${i} must provide both startMs and endMs`);
      } else if (
        hasStart &&
        (!Number.isInteger(line.startMs) ||
          !Number.isInteger(line.endMs) ||
          line.startMs < 0 ||
          line.endMs <= line.startMs)
      ) {
        errors.push(`transcript line ${i} has invalid timing`);
      }
    }
  }

  return { ok: errors.length === 0, errors, retryable: false };
}
