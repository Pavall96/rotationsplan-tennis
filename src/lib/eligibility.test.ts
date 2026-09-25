import { test } from "node:test";
import assert from "node:assert/strict";
import { canPlay, canBeAsked, festspielWarning, tooManyNonGermans, sortByMeldeliste } from "./eligibility";

const herren1 = { ageClass: "herren", rank: 1 } as const;
const herren2 = { ageClass: "herren", rank: 2 } as const;
const h30_1 = { ageClass: "h30", rank: 1 } as const;
const h30_2 = { ageClass: "h30", rank: 2 } as const;

test("a Herren-only player can't play for Herren 30", () => {
  const roster = { herren: { position: 10, countsAsGerman: true } };
  assert.equal(canPlay(roster, h30_1).ok, false);
  assert.equal(canPlay(roster, h30_2).ok, false);
  assert.equal(canPlay(roster, herren1).ok, true);
  assert.equal(canPlay(roster, herren2).ok, true);
});

test("an H30 player on both lists can play for all four teams", () => {
  const roster = { h30: { position: 16, countsAsGerman: false }, herren: { position: 20, countsAsGerman: false } };
  for (const team of [herren1, herren2, h30_1, h30_2]) assert.equal(canPlay(roster, team).ok, true);
});

test("positions 1–4 are fixed to the first team, per age class", () => {
  // Top 4 of H30, but position 7 of Herren: locked out of H30 II only.
  const roster = { h30: { position: 4, countsAsGerman: true }, herren: { position: 7, countsAsGerman: true } };
  assert.equal(canPlay(roster, h30_1).ok, true);
  assert.equal(canPlay(roster, h30_2).ok, false);
  assert.equal(canPlay(roster, herren2).ok, true);
  assert.equal(canPlay({ h30: { position: 5, countsAsGerman: true } }, h30_2).ok, true);
});

test("more than two first-team appearances lock a player out of the second team", () => {
  const roster = { h30: { position: 8, countsAsGerman: true } };
  assert.equal(canPlay(roster, h30_2, 2).ok, true);
  assert.equal(canPlay(roster, h30_2, 3).ok, false);
  assert.equal(canPlay(roster, h30_1, 5).ok, true);
});

test("warns before the appearance that locks a player into the first team", () => {
  const roster = { h30: { position: 8, countsAsGerman: true } };
  assert.equal(festspielWarning(roster, h30_1, 1), null);
  assert.match(festspielWarning(roster, h30_1, 2) ?? "", /3\. Einsatz/);
  assert.equal(festspielWarning(roster, h30_2, 2), null);
  assert.equal(festspielWarning({ h30: { position: 2, countsAsGerman: true } }, h30_1, 2), null);
});

test("at most one non-German per team", () => {
  const de = { position: 1, countsAsGerman: true };
  const gua = { position: 2, countsAsGerman: false };
  assert.equal(tooManyNonGermans([de, gua, de]), false);
  assert.equal(tooManyNonGermans([gua, { ...gua, position: 3 }]), true);
});

test("singles are ordered by Meldeliste position", () => {
  const lineup = [5, 2, 9, 3].map((position) => ({ position, countsAsGerman: true }));
  assert.deepEqual(sortByMeldeliste(lineup).map((e) => e.position), [2, 3, 5, 9]);
});

test("availability poll: who is asked about which team", () => {
  const h30Only = { h30: { position: 8, countsAsGerman: true } };
  assert.equal(canBeAsked(h30Only, herren1), true);
  assert.equal(canBeAsked(h30Only, herren2), true);
  assert.equal(canBeAsked(h30Only, h30_2), true);

  const herrenOnly = { herren: { position: 12, countsAsGerman: true } };
  assert.equal(canBeAsked(herrenOnly, h30_1), false);

  const topH30 = { h30: { position: 1, countsAsGerman: true }, herren: { position: 2, countsAsGerman: true } };
  assert.equal(canBeAsked(topH30, h30_2), false);
  assert.equal(canBeAsked(topH30, herren2), false);
  assert.equal(canBeAsked(topH30, h30_1), true);

  assert.equal(canBeAsked({}, h30_2), false);
  assert.equal(canBeAsked({}, herren1), false);
});
