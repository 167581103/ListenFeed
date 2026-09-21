import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileSeedAudioPrompt, sceneToImportDraft } from "../scripts/factory/compile";
import { validateScene } from "../scripts/factory/validate";
import { validateImportItem } from "../scripts/cms/validate";
import type { SceneSpec } from "../scripts/factory/types";

function base(over: Partial<SceneSpec> = {}): SceneSpec {
  return {
    externalId: "t-1",
    question: "What happens?",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    answerId: "a",
    setting: "a quiet office",
    bed: "Throughout: faint keyboard clicks and air conditioning.",
    speakers: [{ name: "Sam", voice: "young man, American, calm, medium pace" }],
    beats: [{ kind: "line", speaker: "Sam", text: "I'll send it over." }],
    ...over,
  };
}

test("rejects a scene with no sound bed", () => {
  const r = validateScene({ ...base(), bed: "" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("bed")));
});

test("rejects a line from an unknown speaker", () => {
  const r = validateScene(
    base({ beats: [{ kind: "line", speaker: "Nobody", text: "Hi" }] }),
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("Nobody")));
});

test("compiles environment, bed, first voice, later direction, sfx, pause, and timing", () => {
  const compiled = compileSeedAudioPrompt(
    base({
      genre: "office small talk",
      mood: "rushed",
      speakers: [
        { name: "Sam", voice: "young man, American, calm, medium pace", audioRef: 1 },
        { name: "Riley", voice: "young woman, American, bright, fast" },
      ],
      beats: [
        { kind: "line", speaker: "Sam", direction: "half-whispering", text: "You got a second?" },
        { kind: "sfx", text: "A keyboard clacks hard, then stops." },
        { kind: "pause", text: "A brief silence. Only the AC hums." },
        {
          kind: "line",
          speaker: "Riley",
          direction: "not looking up",
          text: "Make it quick.",
          time: { startSec: 5.5, endSec: 8 },
        },
      ],
      closing: "Footsteps walk off down the hall.",
    }),
  );

  assert.match(compiled.prompt, /\[office small talk\. a quiet office\. rushed\]/);
  assert.match(compiled.prompt, /keyboard clicks/);
  assert.match(
    compiled.prompt,
    /Sam \(young man, American, calm, medium pace, half-whispering, voiced by @Audio1\) says: "You got a second\?"/,
  );
  assert.match(compiled.prompt, /\[A keyboard clacks hard, then stops\.\]/);
  assert.match(compiled.prompt, /\[A brief silence\. Only the AC hums\.\]/);
  assert.match(
    compiled.prompt,
    /Riley \(young woman, American, bright, fast, not looking up\) says: "\[5\.5s:8\.0s\] Make it quick\."/,
  );
  assert.match(compiled.prompt, /\[Footsteps walk off down the hall\.\]/);
  assert.equal(compiled.overHardLimit, false);
});

test("later lines keep the name but drop the full voice bio unless a new direction is set", () => {
  const compiled = compileSeedAudioPrompt(
    base({
      beats: [
        { kind: "line", speaker: "Sam", text: "First." },
        { kind: "line", speaker: "Sam", text: "Second." },
        { kind: "line", speaker: "Sam", direction: "softer", text: "Third." },
      ],
    }),
  );
  const samLines = compiled.prompt.split("\n").filter((l) => l.startsWith("Sam"));
  assert.equal(samLines.length, 3);
  assert.match(samLines[0], /young man, American/);
  assert.equal(samLines[1], `Sam says: "Second."`);
  assert.equal(samLines[2], `Sam (softer) says: "Third."`);
});

test("coffee-shop and wrong-order scenes compile under the hard cap and emit valid import drafts", async () => {
  for (const file of [
    "scripts/factory/scenes/coffee-shop-order.json",
    "scripts/factory/scenes/wrong-order.json",
  ]) {
    const scene = JSON.parse(await readFile(file, "utf-8")) as SceneSpec;
    assert.equal(validateScene(scene).ok, true, file);
    const compiled = compileSeedAudioPrompt(scene);
    assert.equal(compiled.overHardLimit, false, `${file} ${compiled.characterCount}`);
    assert.match(compiled.prompt, /espresso|steamer|café murmur|cafe murmur/i);

    const draft = sceneToImportDraft(scene, "/tmp/master.mp3");
    const imported = validateImportItem(draft);
    assert.equal(imported.ok, true, imported.errors.join("; "));
    assert.ok(draft.transcript.length >= 4);
    assert.ok(draft.transcript.every((t) => t.line.length > 0));
  }
});

test("sceneToImportDraft copies spoken lines only, not sfx", () => {
  const draft = sceneToImportDraft(
    base({
      beats: [
        { kind: "sfx", text: "A door closes." },
        { kind: "line", speaker: "Sam", text: "I'm in." },
        { kind: "pause", text: "Silence." },
      ],
    }),
  );
  assert.deepEqual(draft.transcript, [{ speaker: "Sam", line: "I'm in." }]);
});
