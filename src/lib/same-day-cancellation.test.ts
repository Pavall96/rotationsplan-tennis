import { test } from "node:test";
import assert from "node:assert/strict";
import { sameDayOpenSlotRecipients, type Cancellation } from "./same-day-cancellation";
import { assignment, makeSession } from "./test-fixtures";

// Platz 2 the same evening (starters 11–14, trainer 20) and the following week's session (starters 6–9).
// Players 6–9 are on the rotation and free tonight; 11–14 are busy in the other hall.
const platz2 = makeSession({
  id: 2,
  courtSlug: "other-hall",
  courtLabel: "Platz 2",
  hallName: "Other Hall",
  starters: [assignment(11), assignment(12), assignment(13), assignment(14)],
  trainer: assignment(20, "offen", "trainer"),
  ersatz: null,
});
const nextWeek = makeSession({
  id: 3,
  sessionDate: "2026-11-10",
  startsAt: new Date("2026-11-10T19:30:00Z"),
  endsAt: new Date("2026-11-10T21:00:00Z"),
  starters: [assignment(6), assignment(7), assignment(8), assignment(9)],
  ersatz: null,
});
const morning = new Date("2026-11-03T08:00:00Z");

test("on the training day a starter's 'nein' alerts the free rotation players, not those busy elsewhere", () => {
  const session = makeSession({ ersatz: null, starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const cancelled: Cancellation = { playerId: 1, role: "starter", previous: "ja" };
  assert.deepEqual(sameDayOpenSlotRecipients([session, platz2, nextWeek], session, cancelled, morning), [6, 7, 8, 9]);
});

test("a starter who had already said 'nein' doesn't alert again", () => {
  const session = makeSession({ ersatz: null, starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const cancelled: Cancellation = { playerId: 1, role: "starter", previous: "nein" };
  assert.deepEqual(sameDayOpenSlotRecipients([session, platz2, nextWeek], session, cancelled, morning), []);
});

test("nothing goes out before the training day, and from Berlin midnight on it does", () => {
  const session = makeSession({ ersatz: null, starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const cancelled: Cancellation = { playerId: 1, role: "starter", previous: "ja" };
  const schedule = [session, platz2, nextWeek];
  assert.deepEqual(sameDayOpenSlotRecipients(schedule, session, cancelled, new Date("2026-11-02T21:00:00Z")), []);
  assert.deepEqual(sameDayOpenSlotRecipients(schedule, session, cancelled, new Date("2026-11-02T23:30:00Z")), [6, 7, 8, 9]);
});

test("nothing goes out once the session has started", () => {
  const session = makeSession({ ersatz: null, starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const cancelled: Cancellation = { playerId: 1, role: "starter", previous: "ja" };
  assert.deepEqual(sameDayOpenSlotRecipients([session, platz2, nextWeek], session, cancelled, new Date("2026-11-03T19:45:00Z")), []);
});

test("an einspringer who leaves doesn't get the alert themselves", () => {
  const session = makeSession({ ersatz: null, starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)] });
  const cancelled: Cancellation = { playerId: 6, role: "einspringer", previous: "ja" };
  assert.deepEqual(sameDayOpenSlotRecipients([session, platz2, nextWeek], session, cancelled, morning), [7, 8, 9]);
});

test("no alert when a place is already taken by someone who jumped in", () => {
  const session = makeSession({
    ersatz: null,
    starters: [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)],
    einspringer: [assignment(10, "ja", "einspringer")],
  });
  const cancelled: Cancellation = { playerId: 1, role: "starter", previous: "ja" };
  assert.deepEqual(sameDayOpenSlotRecipients([session, platz2, nextWeek], session, cancelled, morning), []);
});
