import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAgenda } from "./agenda";
import { makeSession } from "./test-fixtures";
import type { MatchView } from "./matches";

const match = (id: number, startsAt: string): MatchView => ({
  id,
  matchDate: startsAt.slice(0, 10),
  startsAt: new Date(startsAt),
  isHome: true,
  opponent: "X",
  playersNeeded: 4,
  lineupPublishedAt: null,
  scheduleVersion: 0,
  team: { id: 1, slug: "h30-1", name: "Herren 30 1", ageClass: "h30", rank: 1 },
  venue: null,
});

test("mergeAgenda: sessions and matches in the order they start", () => {
  const tuesday = makeSession({ id: 1, startsAt: new Date("2026-11-03T19:30:00Z") });
  const nextTuesday = makeSession({ id: 2, startsAt: new Date("2026-11-10T19:30:00Z") });
  const saturday = match(7, "2026-11-07T13:00:00Z");
  const items = mergeAgenda([nextTuesday, tuesday], [saturday]);
  assert.deepEqual(
    items.map((i) => (i.kind === "session" ? `s${i.session.id}` : `m${i.match.id}`)),
    ["s1", "m7", "s2"],
  );
});

test("mergeAgenda: nothing in, nothing out", () => {
  assert.deepEqual(mergeAgenda([], []), []);
});
