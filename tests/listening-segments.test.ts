import assert from "node:assert/strict";
import { test } from "node:test";
import { createListeningSegments } from "../lib/listening-segments";

test("uses CMS timestamps when both bounds are valid", () => {
  const segments = createListeningSegments(
    [{ speaker: "A", line: "Hello", startMs: 120, endMs: 840 }],
    1000,
  );

  assert.deepEqual(segments[0], { speaker: "A", line: "Hello", startMs: 120, endMs: 840 });
});

test("creates contiguous fallback timings for legacy transcripts", () => {
  const segments = createListeningSegments(
    [
      { speaker: "A", line: "One" },
      { speaker: "B", line: "Two" },
      { speaker: "A", line: "Three" },
    ],
    1000,
  );

  assert.deepEqual(
    segments.map(({ startMs, endMs }) => ({ startMs, endMs })),
    [
      { startMs: 0, endMs: 333 },
      { startMs: 333, endMs: 667 },
      { startMs: 667, endMs: 1000 },
    ],
  );
});

test("replaces invalid timestamps with fallback timing", () => {
  const segments = createListeningSegments(
    [{ speaker: "A", line: "Hello", startMs: 600, endMs: 200 }],
    1000,
  );

  assert.deepEqual(segments[0], { speaker: "A", line: "Hello", startMs: 0, endMs: 1000 });
});
