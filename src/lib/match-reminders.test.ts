import { test } from "node:test";
import assert from "node:assert/strict";
import { carpoolLine } from "./match-reminders";

const ride = {
  id: 1,
  matchId: 1,
  driver: { playerId: 1, name: "Seb" },
  seats: 3,
  meetingPoint: "Vereinsheim",
  departureTime: "17:00",
  passengers: [{ playerId: 2, name: "Pablo" }],
};

test("match-day email tells each player their carpool", () => {
  assert.equal(carpoolLine(1, { rides: [ride], requests: [] }), "Du fährst ab Vereinsheim um 17:00 Uhr – mit Pablo.");
  assert.equal(carpoolLine(2, { rides: [ride], requests: [] }), "Du fährst bei Seb mit – ab Vereinsheim um 17:00 Uhr.");
  assert.match(carpoolLine(3, { rides: [ride], requests: [] }), /Noch keine Mitfahrt/);
  assert.match(carpoolLine(3, undefined), /Noch keine Mitfahrt/);
});
