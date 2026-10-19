import { test } from "node:test";
import assert from "node:assert/strict";
import { validateImportItem } from "../scripts/cms/validate";

const valid = {
  externalId: "x-1",
  question: "What?",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  answerId: "a",
  audioContentHash: "deadbeefdeadbeef",
  durationMs: 1000,
};

test("accepts a well-formed item", () => {
  const r = validateImportItem(valid);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("requires externalId and question", () => {
  const r = validateImportItem({ ...valid, externalId: "", question: "" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("externalId")));
  assert.ok(r.errors.some((e) => e.includes("question")));
});

test("answerId must match an option id", () => {
  const r = validateImportItem({ ...valid, answerId: "z" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("answerId")));
});

test("requires exactly one audio source", () => {
  const none = validateImportItem({ ...valid, audioContentHash: undefined });
  assert.equal(none.ok, false);
  assert.ok(none.errors.some((e) => e.includes("audio source")));

  const two = validateImportItem({ ...valid, masterPath: "/tmp/a.wav" });
  assert.equal(two.ok, false);
  assert.ok(two.errors.some((e) => e.includes("exactly one")));
});

test("requires durationMs when referencing existing audio", () => {
  const r = validateImportItem({ ...valid, durationMs: undefined });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("durationMs")));
});

test("requires complete and valid transcript timings when supplied", () => {
  const missingEnd = validateImportItem({
    ...valid,
    transcript: [{ speaker: "A", line: "Hello", startMs: 10 }],
  });
  assert.equal(missingEnd.ok, false);
  assert.ok(missingEnd.errors.some((e) => e.includes("both startMs and endMs")));

  const backwards = validateImportItem({
    ...valid,
    transcript: [{ speaker: "A", line: "Hello", startMs: 100, endMs: 10 }],
  });
  assert.equal(backwards.ok, false);
  assert.ok(backwards.errors.some((e) => e.includes("invalid timing")));
});

test("validation failures are non-retryable", () => {
  const r = validateImportItem({});
  assert.equal(r.ok, false);
  assert.equal(r.retryable, false);
});
