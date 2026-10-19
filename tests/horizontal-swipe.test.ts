import assert from "node:assert/strict";
import { test } from "node:test";
import { allowPanAxis, choosePanAxis, clampPanOffset, createAxisLock, shouldOpenListening } from "../lib/horizontal-swipe";

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

test("keeps the active axis until its animation releases it", () => {
  assert.equal(allowPanAxis("x", "y"), false);
  assert.equal(allowPanAxis("y", "x"), false);
  assert.equal(allowPanAxis("x", "x"), true);
  assert.equal(allowPanAxis(null, "y"), true);

  const lock = createAxisLock();
  const releaseHorizontal = lock.claim("x");
  assert.equal(lock.get(), "x");
  const releaseVertical = lock.claim("y");
  releaseHorizontal();
  assert.equal(lock.get(), "y");
  releaseVertical();
  assert.equal(lock.get(), null);
});

test("settles from position or a short flick", () => {
  assert.equal(shouldOpenListening(-0.1, 0), false);
  assert.equal(shouldOpenListening(-0.22, 0), true);
  assert.equal(shouldOpenListening(-0.05, -0.0012), true);
  assert.equal(shouldOpenListening(-0.8, 0.004), false);
});
