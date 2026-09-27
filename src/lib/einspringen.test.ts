import { test } from "node:test";
import assert from "node:assert/strict";
import { canJumpIn, jumpInOptions, openSlotRecipients } from "./einspringen";
import { assignment, makeSession } from "./test-fixtures";

const before = new Date("2026-11-03T08:00:00Z");

// 03.11: Platz 1 (starters 1–4, Ersatz 5) where 1 cancelled; Platz 2 (starters 11–14, Ersatz 15, Trainer 20).
// 10.11: Platz 1 with starters 6–9, Ersatz 10, Trainer 21 — makes 6–10 rotation players too (21 only ever coaches).
const platz1 = makeSession({ starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
const platz2 = makeSession({
  id: 2,
  courtSlug: "frankenbach",
  hallName: "Tennishalle Frankenbach",
  starters: [assignment(11), assignment(12), assignment(13), assignment(14)],
  ersatz: assignment(15, "offen", "ersatz"),
  trainer: assignment(20, "offen", "trainer"),
});
const nextWeek = makeSession({
  id: 3,
  sessionDate: "2026-11-10",
  startsAt: new Date("2026-11-10T19:30:00Z"),
  endsAt: new Date("2026-11-10T21:00:00Z"),
  starters: [assignment(6), assignment(7), assignment(8), assignment(9)],
  ersatz: assignment(10, "offen", "ersatz"),
  trainer: assignment(21, "offen", "trainer"),
});
const schedule = [platz1, platz2, nextWeek];

test("a rotation player who is free that evening may jump in", () => {
  assert.equal(canJumpIn(schedule, platz1, 6, before), true);
});

test("the Ersatz in the other hall that evening may jump in", () => {
  assert.equal(canJumpIn(schedule, platz1, 15, before), true);
});

test("nobody already on this session may jump in, including its Ersatz", () => {
  for (const id of [1, 2, 5]) assert.equal(canJumpIn(schedule, platz1, id, before), false, `player ${id}`);
});

test("starters and the coach of the other hall that evening may not", () => {
  assert.equal(canJumpIn(schedule, platz1, 11, before), false);
  assert.equal(canJumpIn(schedule, platz1, 20, before), false);
});

test("players who are only ever coaches, or not on the rotation at all, may not", () => {
  assert.equal(canJumpIn(schedule, platz1, 21, before), false);
  assert.equal(canJumpIn(schedule, platz1, 99, before), false);
});

test("no open place, or the session is over: nobody may", () => {
  assert.equal(canJumpIn(schedule, platz2, 6, before), false);
  assert.equal(canJumpIn(schedule, platz1, 6, new Date("2026-11-03T21:00:00Z")), false);
  const filled = { ...platz1, einspringer: [assignment(7, "ja", "einspringer")] };
  assert.equal(canJumpIn([filled, platz2, nextWeek], filled, 6, before), false);
});

test("having jumped in elsewhere that evening blocks a second place", () => {
  const otherHallShort = {
    ...platz2,
    starters: [assignment(11, "nein"), assignment(12), assignment(13), assignment(14)],
  };
  const tookPlatz1 = { ...platz1, einspringer: [assignment(6, "ja", "einspringer")] };
  assert.equal(canJumpIn([tookPlatz1, otherHallShort, nextWeek], otherHallShort, 6, before), false);
});

test("jumpInOptions lists the sessions a player could take", () => {
  assert.deepEqual(jumpInOptions(schedule, 6, before).map((s) => s.id), [1]);
  assert.deepEqual(jumpInOptions(schedule, 11, before), []);
});

test("openSlotRecipients: every eligible rotation player, nobody else", () => {
  assert.deepEqual(
    openSlotRecipients(schedule, platz1, before).sort((a, b) => a - b),
    [6, 7, 8, 9, 10, 15],
  );
});
