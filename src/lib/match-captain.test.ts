import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMatchCaptain } from "./match-captain";

const captain = { playerId: 7, name: "P7" };

test("the Spieltags-Mannschaftsführer counts while he is in the lineup", () => {
  assert.deepEqual(activeMatchCaptain(captain, [{ playerId: 7, response: null }]), captain);
  assert.deepEqual(activeMatchCaptain(captain, [{ playerId: 7, response: "ja" }]), captain);
});

test("not in the (published) lineup, or cancelled: nobody", () => {
  assert.equal(activeMatchCaptain(captain, [{ playerId: 3, response: "ja" }]), null);
  assert.equal(activeMatchCaptain(captain, [{ playerId: 7, response: "nein" }]), null);
});

test("no Spieltags-Mannschaftsführer set", () => {
  assert.equal(activeMatchCaptain(null, [{ playerId: 7, response: "ja" }]), null);
  assert.equal(activeMatchCaptain(undefined, []), null);
});
