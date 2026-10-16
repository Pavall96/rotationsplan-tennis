import { test } from "node:test";
import assert from "node:assert/strict";
import { AssessmentError, mentionsName, writeAssessment } from "./scouting-ai";
import type { ScoutingFacts } from "./scouting";

const facts: ScoutingFacts = {
  isHome: true,
  groupSize: 6,
  opponent: { rank: 2, points: "10:4", matches: "20:8", meetings: 3 },
  us: { rank: 4, points: "6:8", matches: "14:14", meetings: 3 },
  opponentHasPlayed: true,
  ourLineupPublished: false,
  positions: [{ position: 1, theirLk: 12, theirAppearances: 3, theirSingles: "2:1", ourLk: 14, verdict: "offen" }],
};

test("mentionsName: a different word that merely looks alike is no hit", () => {
  assert.equal(mentionsName("Eher knapp, do isch was drin.", ["Knapp"]), null);
});

test("mentionsName: returns the first name found as a whole word", () => {
  assert.equal(mentionsName("Gegen Müller wird's schwer", ["Müller"]), "Müller");
  assert.equal(mentionsName("Gegen Müller und Schmid wird's schwer", ["Schmid", "Müller"]), "Schmid");
});

test("mentionsName: a name inside a longer word is no hit", () => {
  assert.equal(mentionsName("Müllerstraße", ["Müller"]), null);
});

test("mentionsName: names starting with an umlaut are matched as whole words", () => {
  assert.equal(mentionsName("Gegen Öztürk wird's schwer", ["Öztürk"]), "Öztürk");
  assert.equal(mentionsName("Die Öztürkin kommt", ["Öztürk"]), null);
});

test("mentionsName: regex characters in names are taken literally", () => {
  assert.equal(mentionsName("Gegen O'Neil (2:1) wird's schwer", ["O'Neil"]), "O'Neil");
  // an unescaped "." would match the "i" of "Ail"
  assert.equal(mentionsName("Ail gut", ["A.l"]), null);
  assert.equal(mentionsName("Gegen A.l spielen", ["A.l"]), "A.l");
});

test("mentionsName: empty names are skipped", () => {
  // an unskipped empty pattern matches between "(" and "2" and would return ""
  assert.equal(mentionsName("(2:1)", [""]), null);
  assert.equal(mentionsName("Gegen Müller", ["", "Müller"]), "Müller");
});

test("writeAssessment: without ANTHROPIC_API_KEY it rejects with AssessmentError (no network call)", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(writeAssessment(facts, ["Müller"]), AssessmentError);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
