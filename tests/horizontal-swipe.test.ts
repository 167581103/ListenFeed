import assert from "node:assert/strict";
import { test } from "node:test";
import { choosePanAxis, clampPanOffset, shouldOpenListening } from "../lib/horizontal-swipe";

test("locks a horizontal pan before it can be mistaken for scrolling", () => {
  assert.equal(choosePanAxis(4, 3), null);
  assert.equal(choosePanAxis(7, 6), "x");
  assert.equal(choosePanAxis(8, 8), "x");
  assert.equal(choosePanAxis(6, 12), "y");
});

test("follows the finger and clamps at either control page", () => {
  assert.equal(clampPanOffset(0, -40, -100, 0), -40);
  assert.equal(clampPanOffset(0, 25, -100, 0), 0);
  assert.equal(clampPanOffset(-100, 35, -100, 0), -65);
  assert.equal(clampPanOffset(-100, -20, -100, 0), -100);
});

test("settles from position or a short flick", () => {
  assert.equal(shouldOpenListening(-0.1, 0), false);
  assert.equal(shouldOpenListening(-0.22, 0), true);
  assert.equal(shouldOpenListening(-0.05, -0.0012), true);
  assert.equal(shouldOpenListening(-0.8, 0.004), false);
});
