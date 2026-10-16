import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSimulation, checkProposal, leftOut, DEFAULT_OPTIONS } from "./lineup-sim";
import { availabilityKey, type AvailabilityStatus } from "./availability";
import type { LineupEntry } from "./lineups";
import type { MatchView } from "./matches";
import type { RosterRow } from "./roster";

function match(id: number, date: string, rank: number, playersNeeded = 2): MatchView {
  return {
    id,
    matchDate: date,
    startsAt: new Date(`${date}T13:00:00Z`),
    isHome: true,
    opponent: `Gegner ${id}`,
    playersNeeded,
    lineupPublishedAt: null,
    scheduleVersion: 0,
    team: { id: rank, slug: `herren-${rank}`, name: `Herren ${rank}`, ageClass: "herren", rank },
    venue: null,
  };
}

function row(playerId: number, position: number, countsAsGerman = true): RosterRow {
  return {
    ageClass: "herren",
    position,
    lk: `${10 + position}.0`,
    countsAsGerman,
    nationality: null,
    playerId,
    wtbId: null,
    name: `P${playerId}`,
    registered: true,
    playsMatches: true,
  };
}

function stamm(playerId: number, response: "ja" | "nein" | null = null): LineupEntry {
  return { playerId, name: `P${playerId}`, role: "stamm", published: true, notified: true, hasEmail: true, response };
}

const DAY = "2026-11-21";
const earlier = match(1, "2026-11-07", 2);
const team1 = match(2, DAY, 1);
const team2 = match(3, DAY, 2);
const all = [earlier, team1, team2];
// P1–P4 fixed to the first team (positions 1–4); P5–P8 may play for both.
const roster = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => row(id, id, id !== 7 && id !== 8));

function answers(entries: [number, string, AvailabilityStatus][]) {
  return new Map(entries.map(([id, date, s]) => [availabilityKey(id, date), s]));
}

test("candidates are who said kann/vielleicht and may play for the team", () => {
  const a = answers([
    [1, DAY, "ja"],
    [5, DAY, "vielleicht"],
    [6, DAY, "nein"],
    [7, DAY, "ja"],
  ]);
  const input = buildSimulation(DAY, all, roster, a, new Map());
  const ids = (matchId: number) => input.matches.find((m) => m.matchId === matchId)!.candidates.map((c) => c.playerId);
  assert.deepEqual(ids(2), [1, 5, 7]);
  assert.deepEqual(ids(3), [5, 7]); // P1 is fixed to the first team
  assert.deepEqual(input.players.map((p) => p.playerId).sort(), [1, 5, 7]);
});

test("season stats count earlier Zusagen and Stammplätze, not cancellations", () => {
  const a = answers([
    [5, "2026-11-07", "ja"],
    [6, "2026-11-07", "ja"],
    [5, DAY, "ja"],
    [6, DAY, "ja"],
  ]);
  const lineups = new Map([[1, [stamm(5), stamm(6, "nein")]]]);
  const input = buildSimulation(DAY, all, roster, a, lineups);
  const p = (id: number) => input.players.find((x) => x.playerId === id)!;
  assert.equal(p(5).zusagenBisher, 1);
  assert.equal(p(5).einsaetzeBisher, 1);
  assert.deepEqual(p(5).einsaetzeProTeam, { "Herren 2": 1 });
  assert.equal(p(6).einsaetzeBisher, 0);
});

test("players already lined up that day stay fixed and aren't candidates elsewhere", () => {
  const a = answers([5, 6, 8].map((id) => [id, DAY, "ja"] as [number, string, AvailabilityStatus]));
  const input = buildSimulation(DAY, all, roster, a, new Map([[3, [stamm(5)]]]));
  const t2 = input.matches.find((m) => m.matchId === 3)!;
  assert.deepEqual(t2.fixedStamm, [5]);
  assert.ok(!input.matches.some((m) => m.candidates.some((c) => c.playerId === 5)));
});

const fullDay = answers([1, 2, 5, 6, 7, 8].map((id) => [id, DAY, "ja"] as [number, string, AvailabilityStatus]));

test("a valid proposal passes and is sorted in Meldeliste order", () => {
  const input = buildSimulation(DAY, all, roster, fullDay, new Map());
  const day = checkProposal(input, {
    teams: [
      { matchId: 2, stamm: [2, 1], ersatz: [], begruendung: "" },
      { matchId: 3, stamm: [6, 7], ersatz: [8], begruendung: "" },
    ],
    hinweise: "",
  });
  assert.deepEqual(day.errors, []);
  assert.deepEqual(day.teams[0].stamm, [1, 2]);
  assert.deepEqual(leftOut(input, day).map((p) => p.playerId), [5]);
});

test("broken rules are reported: twice a day, not eligible, two non-Germans, too few", () => {
  const input = buildSimulation(DAY, all, roster, fullDay, new Map());
  const day = checkProposal(input, {
    teams: [
      { matchId: 2, stamm: [7, 8], ersatz: [5], begruendung: "" },
      { matchId: 3, stamm: [1, 5], ersatz: [], begruendung: "" },
    ],
    hinweise: "",
  });
  assert.ok(day.errors.some((e) => e.includes("Nicht-Deutscher")));
  assert.ok(day.errors.some((e) => e.startsWith("P1 darf oder soll nicht für Herren 2")));
  assert.ok(day.errors.some((e) => e.startsWith("P5 steht zweimal auf")));
  assert.ok(day.errors.some((e) => e.startsWith("Herren 2: nur 0 von 2")));
});

test("too few is only a warning when nobody suitable is left", () => {
  const input = buildSimulation(DAY, all, roster, answers([[5, DAY, "ja"]]), new Map());
  const day = checkProposal(input, {
    teams: [
      { matchId: 2, stamm: [5], ersatz: [], begruendung: "" },
      { matchId: 3, stamm: [], ersatz: [], begruendung: "" },
    ],
    hinweise: "",
  });
  assert.deepEqual(day.errors, []);
  assert.equal(day.warnings.length, 2);
});

test("excluded players and (if wished) 'vielleicht' drop out of the candidates", () => {
  const a = answers([
    [5, DAY, "ja"],
    [6, DAY, "vielleicht"],
    [7, DAY, "ja"],
  ]);
  const input = buildSimulation(DAY, all, roster, a, new Map(), { ...DEFAULT_OPTIONS, excluded: [7], allowMaybe: false });
  assert.deepEqual(input.matches.find((m) => m.matchId === 3)!.candidates.map((c) => c.playerId), [5]);
});

test("a pinned player must end up in a Stamm", () => {
  const input = buildSimulation(DAY, all, roster, fullDay, new Map(), { ...DEFAULT_OPTIONS, pinned: [8] });
  const day = checkProposal(input, {
    teams: [
      { matchId: 2, stamm: [1, 2], ersatz: [8], begruendung: "" },
      { matchId: 3, stamm: [6, 7], ersatz: [], begruendung: "" },
    ],
    hinweise: "",
  });
  assert.deepEqual(day.errors, ["P8 ist festgelegt, steht aber in keinem Stamm."]);
});

test("Festspielen is refused while someone else is free, unless pinned or switched off", () => {
  // P5 played twice in the first team already — a third time locks him out of the second team.
  const before = [match(10, "2026-10-10", 1), match(11, "2026-10-17", 1)];
  const season = [...before, team1, team2];
  const lineups = new Map(before.map((m) => [m.id, [stamm(5)]]));
  const a = answers([5, 6, 7, 8].map((id) => [id, DAY, "ja"] as [number, string, AvailabilityStatus]));
  const proposal = {
    teams: [
      { matchId: 2, stamm: [5, 6], ersatz: [], begruendung: "" },
      { matchId: 3, stamm: [7], ersatz: [], begruendung: "" },
    ],
    hinweise: "",
  };
  const run = (opts: Partial<typeof DEFAULT_OPTIONS>) =>
    checkProposal(buildSimulation(DAY, season, roster, a, lineups, { ...DEFAULT_OPTIONS, ...opts }), proposal).errors;

  assert.ok(run({}).some((e) => e.startsWith("P5 würde sich in Herren 1 festspielen")));
  assert.ok(!run({ pinned: [5] }).some((e) => e.includes("festspielen")));
  assert.ok(!run({ avoidFestspielen: false }).some((e) => e.includes("festspielen")));
});
