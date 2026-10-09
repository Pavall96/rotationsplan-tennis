import { test } from "node:test";
import assert from "node:assert/strict";
import { officialName, MELDELISTE_SOURCE } from "./meldeliste";

test("officialName: the WTB spelling by ID-Nummer", () => {
  assert.equal(officialName("18152806", "Seb"), "Hesse, Sebastian");
  assert.equal(officialName("19662285", "Pablo"), "Vallendor, Pablo");
});

test("officialName: the app name when the list doesn't know the player", () => {
  assert.equal(officialName(null, "Gast"), "Gast");
  assert.equal(officialName("00000000", "Gast"), "Gast");
});

test("the source names the Mannschaftsmeldung", () => {
  assert.match(MELDELISTE_SOURCE, /Namentliche Mannschaftsmeldung/);
});
