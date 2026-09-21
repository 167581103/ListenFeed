import type { SceneSpec, SceneBeat, SceneSpeaker } from "./types.js";

export type SceneValidation = { ok: boolean; errors: string[] };

const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function isLine(b: SceneBeat): b is Extract<SceneBeat, { kind: "line" }> {
  return b.kind === "line";
}

export function validateScene(scene: unknown): SceneValidation {
  const errors: string[] = [];
  const it = scene as Partial<SceneSpec> | null;
  if (!it || typeof it !== "object") {
    return { ok: false, errors: ["scene is not an object"] };
  }

  if (!it.externalId || typeof it.externalId !== "string") errors.push("externalId is required");
  if (!it.question || typeof it.question !== "string") errors.push("question is required");
  if (!it.setting || typeof it.setting !== "string") errors.push("setting is required");
  if (!it.bed || typeof it.bed !== "string") errors.push("bed is required (one continuous sound bed)");

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

  if (!Array.isArray(it.speakers) || it.speakers.length === 0) {
    errors.push("at least one speaker is required");
  } else {
    const names = new Set<string>();
    for (const [i, sp] of it.speakers.entries()) {
      if (!sp || typeof sp.name !== "string" || typeof sp.voice !== "string") {
        errors.push(`speaker ${i} must have name and voice`);
        continue;
      }
      if (names.has(sp.name)) errors.push(`duplicate speaker name "${sp.name}"`);
      names.add(sp.name);
      if (sp.audioRef != null && ![1, 2, 3].includes(sp.audioRef)) {
        errors.push(`speaker "${sp.name}" audioRef must be 1, 2, or 3`);
      }
    }

    if (Array.isArray(it.beats)) {
      for (const [i, beat] of it.beats.entries()) {
        const err = validateBeat(beat, names, i);
        if (err) errors.push(err);
      }
    }
  }

  if (!Array.isArray(it.beats) || it.beats.length === 0) {
    errors.push("at least one beat is required");
  } else if (!it.beats.some(isLine)) {
    errors.push("at least one spoken line is required");
  }

  if (it.audioUrls && it.audioUrls.length > 3) {
    errors.push("audioUrls supports at most 3 reference clips");
  }
  if (it.level != null && !LEVELS.has(it.level)) {
    errors.push(`level must be one of ${[...LEVELS].join(", ")}`);
  }

  const refs = (it.speakers ?? []).map((s: SceneSpeaker) => s.audioRef).filter((n): n is 1 | 2 | 3 => n != null);
  if (refs.length > 0) {
    const urlCount = it.audioUrls?.length ?? 0;
    const maxRef = Math.max(...refs);
    if (urlCount > 0 && maxRef > urlCount) {
      errors.push(`@Audio${maxRef} is used but only ${urlCount} audioUrls provided`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateBeat(beat: SceneBeat, speakers: Set<string>, i: number): string | null {
  if (!beat || typeof beat !== "object" || !("kind" in beat)) {
    return `beat ${i} is invalid`;
  }
  if (beat.kind === "sfx") {
    return typeof beat.text === "string" && beat.text.trim() ? null : `beat ${i} sfx text is required`;
  }
  if (beat.kind === "pause") {
    return beat.text == null || typeof beat.text === "string" ? null : `beat ${i} pause text must be a string`;
  }
  if (beat.kind !== "line") return `beat ${i} kind must be line | sfx | pause`;
  if (typeof beat.speaker !== "string" || !speakers.has(beat.speaker)) {
    return `beat ${i} speaker "${beat.speaker}" is not in speakers`;
  }
  if (typeof beat.text !== "string" || !beat.text.trim()) return `beat ${i} line text is required`;
  if (beat.time) {
    const { startSec, endSec } = beat.time;
    if (!(startSec >= 0) || !(endSec > startSec)) {
      return `beat ${i} time must have endSec > startSec >= 0`;
    }
  }
  return null;
}
