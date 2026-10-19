import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySwipe } from "../lib/horizontal-swipe";

test("classifies movement direction", () => {
  assert.equal(classifySwipe(80, 10), "right");
  assert.equal(classifySwipe(-80, 8), "left");
});

test("ignores vertical feed swipes and small movements", () => {
  assert.equal(classifySwipe(20, 4), null);
  assert.equal(classifySwipe(40, 90), null);
  assert.equal(classifySwipe(70, 70), null);
});
