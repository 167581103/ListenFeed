import { readFileSync } from "node:fs";
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

test("accepts a sentence-listening item without quiz choices", () => {
  const r = validateImportItem({
    externalId: "jp-news",
    learningMode: "sentence-listening",
    question: "10月19日新闻",
    proficiency: "N5",
    level: "A1",
    audioContentHash: "deadbeefdeadbeef",
    durationMs: 50000,
    transcript: [{
      speaker: "アナウンサー",
      line: "今日のニュースです。",
      translation: "今天的新闻。",
      terms: ["ニュース"],
      startMs: 0,
      endMs: 1160,
    }],
  });
  assert.equal(r.ok, true, r.errors.join("; "));
});

test("rejects quiz fields and missing timings on sentence-listening items", () => {
  const withOptions = validateImportItem({
    externalId: "jp-news",
    learningMode: "sentence-listening",
    question: "10月19日新闻",
    options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
    answerId: "a",
    masterPath: "/tmp/news.wav",
    transcript: [{ speaker: "A", line: "今日。", startMs: 0, endMs: 1000 }],
  });
  assert.equal(withOptions.ok, false);
  assert.ok(withOptions.errors.some((e) => e.includes("do not take quiz options")));

  const untimed = validateImportItem({
    externalId: "jp-news",
    learningMode: "sentence-listening",
    question: "10月19日新闻",
    masterPath: "/tmp/news.wav",
    transcript: [{ speaker: "A", line: "今日。" }],
  });
  assert.equal(untimed.ok, false);
  assert.ok(untimed.errors.some((e) => e.includes("requires startMs and endMs")));
});

test("the Japanese news package is a valid sentence-listening import", () => {
  const items = JSON.parse(readFileSync(new URL("../content/jp-news-daily-2026-10-19.json", import.meta.url), "utf8"));
  const r = validateImportItem(items[0]);
  assert.equal(r.ok, true, r.errors.join("; "));
  assert.equal(items[0].transcript.length, 16);
  assert.equal(items[0].proficiency, "N5");
  assert.equal(items[0].level, "A1");
});

test("validation failures are non-retryable", () => {
  const r = validateImportItem({});
  assert.equal(r.ok, false);
  assert.equal(r.retryable, false);
});
