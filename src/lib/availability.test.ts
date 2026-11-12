import { test } from "node:test";
import assert from "node:assert/strict";
import { dayCrowd, availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import type { RosterRow } from "@/lib/roster";
import type { MatchView } from "@/lib/matches";

const row = (playerId: number, name: string): RosterRow => ({
  ageClass: "herren", position: playerId, lk: null, countsAsGerman: true, nationality: null,
  playerId, wtbId: null, name, registered: true, playsMatches: true,
});
const match = (date: string): MatchView => ({
  id: 1, matchDate: date, startsAt: new Date(`${date}T10:00:00Z`), isHome: true, opponent: "X", playersNeeded: 4,
  lineupPublishedAt: null, scheduleVersion: 0,
  team: { id: 1, slug: "h1", name: "Herren", ageClass: "herren", rank: 1 }, venue: null,
});

test("dayCrowd lists Kann and Vielleicht by name, counts open, never names Kann nicht", () => {
  const rows = [row(1, "Zoe"), row(2, "Anna"), row(3, "Ben"), row(4, "Cem")];
  const answers = new Map<string, AvailabilityStatus>([
    [availabilityKey(1, "2030-01-05"), "ja"],
    [availabilityKey(2, "2030-01-05"), "ja"],
    [availabilityKey(3, "2030-01-05"), "nein"],
  ]);
  const crowd = dayCrowd([match("2030-01-05")], answers, rows, "2030-01-01").get("2030-01-05")!;
  assert.deepEqual(crowd.ja, ["Anna", "Zoe"]);
  assert.deepEqual(crowd.vielleicht, []);
  assert.equal(crowd.open, 1);
});
