import { test } from "node:test";
import assert from "node:assert/strict";
import { responseAlerts, type LineupEntry } from "./lineups";

const entry = (playerId: number, role: "stamm" | "ersatz", response: "ja" | "nein" | null): LineupEntry => ({
  playerId,
  name: `P${playerId}`,
  role,
  published: true,
  notified: true,
  hasEmail: true,
  response,
});

test("a Stammspieler's Absage alerts the captain and asks the Ersatz", () => {
  const after = [entry(1, "stamm", "nein"), entry(2, "stamm", "ja"), entry(5, "ersatz", null)];
  assert.deepEqual(responseAlerts("stamm", null, "nein", after), { captain: "absage", askErsatz: true });
  assert.deepEqual(responseAlerts("stamm", "ja", "nein", after), { captain: "absage", askErsatz: true });
});

test("confirming, or repeating an answer, stays quiet", () => {
  const lineup = [entry(1, "stamm", "ja")];
  assert.deepEqual(responseAlerts("stamm", null, "ja", lineup), { captain: null, askErsatz: false });
  assert.deepEqual(responseAlerts("stamm", "nein", "nein", lineup), { captain: null, askErsatz: false });
});

test("taking an Absage back tells the captain", () => {
  assert.deepEqual(responseAlerts("stamm", "nein", "ja", [entry(1, "stamm", "ja")]).captain, "doch-dabei");
});

test("the Ersatz only matters to the captain once someone is missing", () => {
  const nobodyMissing = [entry(1, "stamm", "ja"), entry(5, "ersatz", "ja")];
  assert.equal(responseAlerts("ersatz", null, "ja", nobodyMissing).captain, null);

  const missing = [entry(1, "stamm", "nein"), entry(5, "ersatz", "ja")];
  assert.equal(responseAlerts("ersatz", null, "ja", missing).captain, "springt-ein");
  assert.equal(responseAlerts("ersatz", null, "nein", missing).captain, "ersatz-kann-nicht");
});

test("lineupContext: Festspiel count and same-day check", async () => {
  const { lineupContext } = await import("./lineups");
  const match = (id: number, date: string, ageClass: "herren" | "h30", rank: number) =>
    ({
      id,
      matchDate: date,
      startsAt: new Date(`${date}T18:00:00+01:00`),
      isHome: true,
      opponent: "X",
      playersNeeded: 4,
      lineupPublishedAt: null,
      scheduleVersion: 0,
      team: { id: rank + (ageClass === "h30" ? 10 : 0), slug: "", name: `${ageClass} ${rank}`, ageClass, rank },
      venue: null,
    }) as const;
  const h30First1 = match(1, "2026-11-14", "h30", 1);
  const h30First2 = match(2, "2026-12-19", "h30", 1);
  const herrenFirst = match(3, "2026-12-05", "herren", 1);
  const h30Second = match(4, "2027-01-16", "h30", 2);
  const sameDayHerren = match(5, "2027-01-16", "herren", 1);
  const all = [h30First1, h30First2, herrenFirst, h30Second, sameDayHerren];

  const lineups = new Map<number, LineupEntry[]>([
    [1, [entry(7, "stamm", "ja")]],
    [2, [entry(7, "stamm", "nein")]], // cancelled: didn't play
    [3, [entry(7, "stamm", "ja")]], // other age class: doesn't count for H30
    [5, [entry(7, "ersatz", null)]],
  ]);
  const ctx = lineupContext(7, true, h30Second, all, lineups);
  assert.equal(ctx.firstTeamAppearances, 1);
  assert.equal(ctx.sameDayTeam, "herren 1");
});
