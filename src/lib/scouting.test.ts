import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFacts,
  compareLk,
  factsHash,
  findStanding,
  likelyLineup,
  nextMatchIds,
  opponentView,
  ourStanding,
  shortName,
  surnames,
  type GroupSnapshot,
} from "./scouting";
import type { MatchView } from "./matches";
import type { StandingRow, WtbPlayer } from "./wtb";

function match(id: number, date: string, teamId: number, opponent = "TC Musterstadt 1", playersNeeded = 4): MatchView {
  return {
    id,
    matchDate: date,
    startsAt: new Date(`${date}T13:00:00Z`),
    isHome: true,
    opponent,
    playersNeeded,
    lineupPublishedAt: null,
    scheduleVersion: 0,
    team: { id: teamId, slug: `herren-${teamId}`, name: `Herren ${teamId}`, ageClass: "herren", rank: teamId },
    venue: null,
  };
}

function player(rank: number, lk: number | null, singlesTotal = 0, name = `Spieler ${rank}`): WtbPlayer {
  const won = Math.ceil(singlesTotal / 2);
  return { rank, lk, name, singles: { won, lost: singlesTotal - won }, doubles: { won: 0, lost: 0 } };
}

function standing(rank: number, team: string, id: string): StandingRow {
  return { rank, team, teamUrl: `https://www.wtb-tennis.de/x/m/${id}.html`, meetings: 2, points: "3:1", matches: "10:8" };
}

const OPP_URL = standing(2, "TC Musterstadt 1", "222").teamUrl;
const OUR_URL = standing(1, "TC Sonnenbrunnen Heilbronn 1", "111").teamUrl;

function snapshot(opponentPlayers: WtbPlayer[], ourPlayers: WtbPlayer[] = []): GroupSnapshot {
  return {
    groupUrl: "https://www.wtb-tennis.de/g/1",
    standings: [standing(1, "TC Sonnenbrunnen Heilbronn 1", "111"), standing(2, "TC Musterstadt 1", "222")],
    teamPlayers: { [OPP_URL]: opponentPlayers, [OUR_URL]: ourPlayers },
    fetchedAt: new Date("2026-10-16T08:00:00Z"),
  };
}

test("compareLk: gap of two or more decides, lower LK is stronger", () => {
  assert.equal(compareLk(13, 15), "vorne");
  assert.equal(compareLk(15, 13), "hinten");
  assert.equal(compareLk(14, 15), "offen");
  assert.equal(compareLk(null, 13), null);
  assert.equal(compareLk(13, null), null);
});

test("likelyLineup picks most singles appearances, ties by rank, sorted by rank", () => {
  const players = [5, 6, 7, 8, 9, 10].map((rank, i) => player(rank, 15, [0, 3, 3, 1, 0, 2][i]));
  const lineup = likelyLineup(players, 4);
  assert.deepEqual(lineup.map((l) => l.player.rank), [6, 7, 8, 10]);
  assert.deepEqual(lineup.map((l) => l.position), [1, 2, 3, 4]);
});

test("likelyLineup without appearances takes the first ranks", () => {
  const players = [10, 9, 8, 7, 6, 5].map((rank) => player(rank, 15));
  assert.deepEqual(likelyLineup(players, 4).map((l) => l.player.rank), [5, 6, 7, 8]);
});

test("likelyLineup fills up by rank when fewer than needed have played", () => {
  const players = [1, 2, 3, 4, 5].map((rank) => player(rank, 15, rank === 4 ? 2 : 0));
  assert.deepEqual(likelyLineup(players, 3).map((l) => l.player.rank), [1, 2, 4]);
});

test("shortName and surnames", () => {
  assert.equal(shortName("Sascha Müller"), "S. Müller");
  assert.equal(shortName("Hans-Peter von Berg"), "H. von Berg");
  assert.equal(shortName("Cher"), "Cher");
  assert.deepEqual(surnames([player(1, 10, 0, "Sascha Müller"), player(2, 10, 0, "Cher")]), ["Müller", "Cher"]);
});

test("findStanding ignores surrounding and repeated whitespace", () => {
  const standings = snapshot([]).standings;
  assert.equal(findStanding(standings, "  TC  Musterstadt 1 ")?.rank, 2);
  assert.equal(findStanding(standings, "TC Anderswo 1"), null);
});

test("ourStanding matches the WTB team id at the end of the team URL", () => {
  const standings = snapshot([]).standings;
  assert.equal(ourStanding(standings, "111")?.rank, 1);
  assert.equal(ourStanding(standings, "11"), null);
});

test("nextMatchIds returns the earliest upcoming match per team", () => {
  const a1 = match(1, "2026-11-14", 1);
  const a2 = match(2, "2026-11-28", 1);
  const b1 = match(3, "2026-11-14", 2);
  const all = [a2, a1, b1];
  assert.deepEqual([...nextMatchIds(all, "2026-11-14")].sort(), [1, 3]);
  assert.deepEqual([...nextMatchIds(all, "2026-11-15")], [2]);
});

test("buildFacts compares the published lineup with the likely opponent lineup", () => {
  const opp = [player(1, 10, 3), player(2, 13, 3), player(3, 14, 3), player(4, 20, 3)];
  const facts = buildFacts({ match: match(1, "2026-11-14", 1), snapshot: snapshot(opp), wtbTeamId: "111", ourPublishedLks: [11, 13, 16, 18] });
  assert.ok(facts);
  assert.deepEqual(facts.positions.map((p) => p.verdict), ["offen", "offen", "hinten", "vorne"]);
  assert.equal(facts.ourLineupPublished, true);
  assert.equal(facts.positions[0].theirSingles, "2:1");
  assert.equal(facts.positions[0].theirAppearances, 3);
  assert.equal(facts.opponentHasPlayed, true);
  assert.equal(facts.groupSize, 2);
  assert.deepEqual(facts.opponent, { rank: 2, points: "3:1", matches: "10:8", meetings: 2 });
  assert.deepEqual(facts.us, { rank: 1, points: "3:1", matches: "10:8", meetings: 2 });
});

test("buildFacts falls back to our likely lineup and leaves missing sides null", () => {
  const opp = [player(1, 10), player(2, 13), player(3, 14), player(4, 20)];
  const ours = [player(1, 12), player(2, 14), player(3, 16)];
  const facts = buildFacts({ match: match(1, "2026-11-14", 1), snapshot: snapshot(opp, ours), wtbTeamId: "111", ourPublishedLks: null });
  assert.ok(facts);
  assert.equal(facts.ourLineupPublished, false);
  assert.equal(facts.opponentHasPlayed, false);
  assert.deepEqual(facts.positions.map((p) => p.ourLk), [12, 14, 16, null]);
  assert.equal(facts.positions[3].verdict, null);

  const short = buildFacts({ match: match(1, "2026-11-14", 1), snapshot: snapshot(opp), wtbTeamId: "111", ourPublishedLks: [11, 13, 16] });
  assert.deepEqual(short?.positions.map((p) => p.ourLk), [11, 13, 16, null]);
  assert.equal(short?.positions[3].verdict, null);
});

test("buildFacts returns null when the opponent or we are not in the table", () => {
  const snap = snapshot([player(1, 10)]);
  assert.equal(buildFacts({ match: match(1, "2026-11-14", 1, "TC Anderswo 1"), snapshot: snap, wtbTeamId: "111", ourPublishedLks: null }), null);
  assert.equal(buildFacts({ match: match(1, "2026-11-14", 1), snapshot: snap, wtbTeamId: "999", ourPublishedLks: null }), null);
});

test("factsHash is stable and changes with the facts", () => {
  const opp = [player(1, 10), player(2, 13), player(3, 14), player(4, 20)];
  const make = (lks: number[]) =>
    buildFacts({ match: match(1, "2026-11-14", 1), snapshot: snapshot(opp), wtbTeamId: "111", ourPublishedLks: lks })!;
  assert.equal(factsHash(make([11, 13, 16, 18])), factsHash(make([11, 13, 16, 18])));
  assert.notEqual(factsHash(make([11, 13, 16, 18])), factsHash(make([11, 13, 16, 19])));
});

test("opponentView before the first match shows playersNeeded + 2 players", () => {
  const opp = [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => player(rank, 15));
  const view = opponentView(snapshot(opp), match(1, "2026-11-14", 1), "111", null);
  assert.ok(view);
  assert.equal(view.hasPlayed, false);
  assert.equal(view.players.length, 6);
  assert.deepEqual(view.players.map((p) => p.position), [1, 2, 3, 4, 5, 6]);
  assert.equal(view.opponentTeamUrl, OPP_URL);
  assert.equal(view.ourTeamUrl, OUR_URL);
  assert.equal(view.groupUrl, "https://www.wtb-tennis.de/g/1");
  assert.equal(view.assessment, null);
});

test("opponentView lists only players with matches once the season started", () => {
  const opp = [player(1, 10, 0), player(2, 13, 2, "Sascha Müller"), player(3, 14, 0, "Hans Beck"), player(4, 20, 1, "Tim Roth")];
  opp[2].doubles = { won: 1, lost: 0 };
  const view = opponentView(snapshot(opp), match(1, "2026-11-14", 1), "111", "Text");
  assert.ok(view);
  assert.equal(view.hasPlayed, true);
  assert.deepEqual(view.players.map((p) => p.name), ["S. Müller", "H. Beck", "T. Roth"]);
  assert.equal(view.players[0].singles, "1:1");
  assert.equal(view.players[1].doubles, "1:0");
  assert.deepEqual(view.players.map((p) => p.position), [1, 2, 3]);
  assert.equal(view.assessment, "Text");
});

test("opponentView is null when a standing is missing", () => {
  assert.equal(opponentView(snapshot([]), match(1, "2026-11-14", 1, "TC Anderswo 1"), "111", null), null);
});
