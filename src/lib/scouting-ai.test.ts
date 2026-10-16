import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsName } from "./scouting-ai";

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

test("mentionsName: regex characters in names are taken literally, empty names are skipped", () => {
  assert.equal(mentionsName("Gegen O'Neil (2:1) wird's schwer", ["O'Neil"]), "O'Neil");
  assert.equal(mentionsName("Alles gut", ["", "A.l"]), null);
});
