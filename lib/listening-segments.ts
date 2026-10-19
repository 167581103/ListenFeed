import type { TranscriptLine } from "./feed-types";

export type ListeningSegment = TranscriptLine & {
  startMs: number;
  endMs: number;
};

/**
 * Normalizes CMS-provided timestamps for sentence playback. Older content has
 * no timestamps yet, so it receives a deterministic equal-duration fallback
 * instead of becoming unusable.
 */
export function createListeningSegments(
  transcript: TranscriptLine[],
  durationMs: number,
): ListeningSegment[] {
  if (transcript.length === 0 || durationMs <= 0) return [];

  const fallbackDuration = durationMs / transcript.length;
  return transcript.map((line, index) => {
    const fallbackStart = Math.round(index * fallbackDuration);
    const fallbackEnd = index === transcript.length - 1
      ? durationMs
      : Math.round((index + 1) * fallbackDuration);
    const hasValidTiming =
      Number.isFinite(line.startMs) &&
      Number.isFinite(line.endMs) &&
      line.startMs! >= 0 &&
      line.endMs! > line.startMs!;

    return {
      ...line,
      startMs: hasValidTiming ? Math.min(line.startMs!, durationMs) : fallbackStart,
      endMs: hasValidTiming ? Math.min(line.endMs!, durationMs) : fallbackEnd,
    };
  });
}
