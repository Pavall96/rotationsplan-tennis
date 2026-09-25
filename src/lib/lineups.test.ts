import { test } from "node:test";
import assert from "node:assert/strict";
import { responseAlerts, type LineupEntry } from "./lineups";

const entry = (playerId: number, role: "stamm" | "ersatz", response: "ja" | "nein" | null): LineupEntry => ({
  playerId,
  name: `P${playerId}`,
  role,
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
