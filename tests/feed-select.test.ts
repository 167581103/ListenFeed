import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext, type SeenMap } from "../lib/feed-select";
import type { PublishedItem } from "../lib/feed-types";

function mk(id: string, seq: number): PublishedItem {
  return {
    id,
    seq,
    version: 1,
    question: `q-${id}`,
    options: [{ id: "a", label: "a" }],
    answerId: "a",
    transcript: [],
    durationMs: 1000,
    audio: { webm: `/audio/${id}.webm`, mp3: `/audio/${id}.mp3` },
  };
}

const pool = [mk("a", 1), mk("b", 2), mk("c", 3)];

test("unseen-first returns the freshest (highest seq) unseen item", () => {
  const res = pickNext(pool, {}, new Set(), [], false);
  assert.equal(res.kind, "item");
  if (res.kind === "item") {
    assert.equal(res.item.id, "c");
    assert.equal(res.cycle, false);
  }
});

test("skips items already queued in the buffer", () => {
  const res = pickNext(pool, {}, new Set(["c"]), [], false);
  assert.equal(res.kind, "item");
  if (res.kind === "item") assert.equal(res.item.id, "b");
});

test("asks for more pages when unseen exhausted but pages remain", () => {
  const seen: SeenMap = { a: { t: 1 }, b: { t: 2 }, c: { t: 3 } };
  const res = pickNext(pool, seen, new Set(), [], true);
  assert.equal(res.kind, "need-more");
});

test("cycles least-recently-seen first when everything is seen", () => {
  const seen: SeenMap = { a: { t: 300 }, b: { t: 100 }, c: { t: 200 } };
  const res = pickNext(pool, seen, new Set(), [], false);
  assert.equal(res.kind, "item");
  if (res.kind === "item") {
    assert.equal(res.item.id, "b"); // smallest t = longest since seen
    assert.equal(res.cycle, true);
  }
});

test("avoids replaying the most recently shown items back-to-back", () => {
  const seen: SeenMap = { a: { t: 300 }, b: { t: 100 }, c: { t: 200 } };
  // b is least-recent but was just shown; expect the next least-recent (c).
  const res = pickNext(pool, seen, new Set(), ["c", "b"], false, { avoidRecent: 2 });
  assert.equal(res.kind, "item");
  if (res.kind === "item") assert.equal(res.item.id, "a");
});

test("single-item library keeps cycling (stays scrollable) even when just shown", () => {
  const one = [mk("solo", 1)];
  const seen: SeenMap = { solo: { t: 100 } };
  // Item is seen, in the buffer (queued) and the most recent — must still repeat.
  const res = pickNext(one, seen, new Set(["solo"]), ["solo"], false);
  assert.equal(res.kind, "item");
  if (res.kind === "item") {
    assert.equal(res.item.id, "solo");
    assert.equal(res.cycle, true);
  }
});

test("returns none for an empty pool", () => {
  const res = pickNext([], {}, new Set(), [], false);
  assert.equal(res.kind, "none");
});
