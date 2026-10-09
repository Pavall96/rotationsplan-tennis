import { test } from "node:test";
import assert from "node:assert/strict";
import { officialName, MELDELISTE_SOURCE, MELDELISTE_WTB_URL } from "./meldeliste";

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

test("each age class links to its own WTB document", () => {
  assert.match(MELDELISTE_WTB_URL.herren, /^https:\/\/wtb\.liga\.nu\/.*contestType=104760$/);
  assert.match(MELDELISTE_WTB_URL.h30, /^https:\/\/wtb\.liga\.nu\/.*contestType=104749$/);
});
