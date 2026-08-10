import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSeed, shuffleWithSeed } from "../lib/shuffle";
import { shuffleOptions } from "../lib/shuffle-options";

const options = [
  { id: "a", label: "correct" },
  { id: "b", label: "wrong-1" },
  { id: "c", label: "wrong-2" },
  { id: "d", label: "wrong-3" },
];

test("shuffleWithSeed is deterministic for the same seed", () => {
  const a = shuffleWithSeed(options, "item-1");
  const b = shuffleWithSeed(options, "item-1");
  assert.deepEqual(a, b);
});

test("shuffleWithSeed does not mutate the input", () => {
  const copy = options.map((o) => ({ ...o }));
  shuffleWithSeed(options, "item-1");
  assert.deepEqual(options, copy);
});

test("different seeds usually yield different answer positions", () => {
  const positions = new Set<number>();
  for (let i = 0; i < 40; i += 1) {
    const shuffled = shuffleOptions(options, `item-${i}`);
    positions.add(shuffled.findIndex((o) => o.id === "a"));
  }
  // With 40 seeds over 4 slots, we should see more than one distinct position.
  assert.ok(positions.size >= 2, `expected varied positions, got ${[...positions]}`);
  // And specifically not stuck on index 0 for every item.
  assert.ok(!(positions.size === 1 && positions.has(0)), "answer was always first");
});

test("shuffleOptions keeps every option and the answer id", () => {
  const shuffled = shuffleOptions(options, "coffee-shop-order-001", 1);
  assert.equal(shuffled.length, options.length);
  assert.deepEqual(
    [...shuffled.map((o) => o.id)].sort(),
    [...options.map((o) => o.id)].sort(),
  );
  assert.ok(shuffled.some((o) => o.id === "a" && o.label === "correct"));
});

test("hashSeed is stable", () => {
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  assert.notEqual(hashSeed("abc"), hashSeed("abd"));
});
