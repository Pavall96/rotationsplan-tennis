import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSimulation, checkProposal, leftOut } from "./lineup-sim";
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
  assert.ok(day.errors.some((e) => e.startsWith("P1 darf nicht für Herren 2")));
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
