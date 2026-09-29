import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchView } from "./matches";
import type { LineupEntry } from "./lineups";
import { appearances, canMark, conflictTeams, sameDayClaims, type Mark } from "./marks";

const match = (id: number, date: string, ageClass: "herren" | "h30", rank: number): MatchView => ({
  id,
  matchDate: date,
  startsAt: new Date(`${date}T18:00:00+01:00`),
  isHome: true,
  opponent: "X",
  playersNeeded: 4,
  lineupPublishedAt: null,
  scheduleVersion: 0,
  team: {
    id: rank + (ageClass === "h30" ? 10 : 0),
    slug: "",
    name: `${ageClass === "h30" ? "Herren 30" : "Herren"} ${rank === 1 ? "I" : "II"}`,
    ageClass,
    rank,
  },
  venue: null,
});

const entry = (playerId: number, role: "stamm" | "ersatz", response: "ja" | "nein" | null = null): LineupEntry => ({
  playerId,
  name: `P${playerId}`,
  role,
  published: false,
  notified: false,
  hasEmail: true,
  response,
});

const mark = (playerId: number, playsMatches = true): Mark => ({ playerId, name: `P${playerId}`, playsMatches });

const h30Second = match(1, "2027-01-16", "h30", 2); // team id 12
const herrenFirst = match(2, "2027-01-16", "herren", 1); // team id 1, same day
const herrenSecond = match(3, "2027-01-16", "herren", 2); // team id 2, same day
const otherDay = match(4, "2027-01-23", "herren", 1);
const all = [h30Second, herrenFirst, herrenSecond, otherDay];
const teams = [
  { id: 1, captainName: "Marco", captainPlayerId: 100 },
  { id: 2, captainName: null, captainPlayerId: null },
  { id: 12, captainName: "Pablo", captainPlayerId: 200 },
];

test("sameDayClaims: nobody else wants the player", () => {
  assert.deepEqual(sameDayClaims(7, h30Second, all, new Map(), new Map(), teams), []);
});

test("sameDayClaims: lined up elsewhere that day, as Stamm or Ersatz, with that team's captain", () => {
  const lineups = new Map([
    [2, [entry(7, "stamm")]],
    [3, [entry(8, "ersatz")]],
  ]);
  const seven = sameDayClaims(7, h30Second, all, lineups, new Map(), teams);
  assert.equal(seven.length, 1);
  assert.equal(seven[0].match.id, 2);
  assert.equal(seven[0].kind, "aufgestellt");
  assert.equal(seven[0].captainName, "Marco");
  assert.equal(seven[0].captainPlayerId, 100);

  const eight = sameDayClaims(8, h30Second, all, lineups, new Map(), teams);
  assert.equal(eight[0].kind, "aufgestellt");
  assert.equal(eight[0].captainName, null);
});

test("sameDayClaims: marked elsewhere counts, marks of players who don't play don't", () => {
  const marks = new Map([
    [2, [mark(7)]],
    [3, [mark(9, false)]],
  ]);
  assert.equal(sameDayClaims(7, h30Second, all, new Map(), marks, teams)[0].kind, "vorgemerkt");
  assert.deepEqual(sameDayClaims(9, h30Second, all, new Map(), marks, teams), []);
});

test("sameDayClaims: lined up beats marked for the same match", () => {
  const lineups = new Map([[2, [entry(7, "stamm")]]]);
  const marks = new Map([[2, [mark(7)]]]);
  assert.equal(sameDayClaims(7, h30Second, all, lineups, marks, teams)[0].kind, "aufgestellt");
});

test("sameDayClaims: ignores the match itself and other days", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm")]],
    [4, [entry(7, "stamm")]],
  ]);
  const marks = new Map([[1, [mark(7)]]]);
  assert.deepEqual(sameDayClaims(7, h30Second, all, lineups, marks, teams), []);
});

test("appearances: Stamm counts per team, Ersatz and Absagen don't", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm", "ja")]],
    [2, [entry(7, "stamm")]],
    [3, [entry(7, "ersatz")]],
    [4, [entry(7, "stamm", null)]],
  ]);
  assert.deepEqual(appearances(7, all, lineups), [
    { teamName: "Herren I", count: 2 },
    { teamName: "Herren 30 II", count: 1 },
  ]);
  const cancelled = new Map([[2, [entry(7, "stamm", "nein")]]]);
  assert.deepEqual(appearances(7, all, cancelled), []);
});

test("canMark: allowed although the player plays for another team that day", () => {
  const roster = { h30: { position: 8, countsAsGerman: true } };
  const ctx = { playsMatches: true, firstTeamAppearances: 0, sameDayTeam: "Herren I" };
  assert.equal(canMark(roster, { ageClass: "h30", rank: 2 }, ctx).ok, true);
});

test("canMark: refused when the player may not play for the team at all", () => {
  const free = { playsMatches: true, firstTeamAppearances: 0, sameDayTeam: null };
  const team = { ageClass: "h30" as const, rank: 2 };
  assert.equal(canMark({ h30: { position: 2, countsAsGerman: true } }, team, free).ok, false); // fest in der 1.
  assert.equal(canMark({}, team, free).ok, false); // nicht auf der Meldeliste
  assert.equal(canMark({ h30: { position: 8, countsAsGerman: true } }, team, { ...free, firstTeamAppearances: 3 }).ok, false);
  assert.equal(canMark({ h30: { position: 8, countsAsGerman: true } }, team, { ...free, playsMatches: false }).ok, false);
});

test("conflictTeams: via a lineup entry or a mark of this match; nothing without a claim elsewhere", () => {
  const lineups = new Map([
    [1, [entry(7, "stamm")]],
    [2, [entry(8, "stamm")]],
  ]);
  const marks = new Map([
    [1, [mark(8)]],
    [2, [mark(7)]],
    [3, [mark(8)]],
  ]);
  assert.deepEqual(conflictTeams(h30Second, all, lineups, marks), ["Herren I", "Herren II"]);
  assert.deepEqual(conflictTeams(h30Second, all, new Map([[1, [entry(7, "stamm")]]]), new Map()), []);
});
