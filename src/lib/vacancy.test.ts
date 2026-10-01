import { test } from "node:test";
import assert from "node:assert/strict";
import { openSlots, vacancyStatus, ersatzNeeded, ersatzNoLongerNeeded, playingErsatz } from "./vacancy";
import { assignment, makeSession } from "./test-fixtures";

const oneCancelled = [assignment(1, "nein"), assignment(2), assignment(3), assignment(4)];
const twoCancelled = [assignment(1, "nein"), assignment(2, "nein"), assignment(3), assignment(4)];

test("no cancellation: no open place and no status", () => {
  const s = makeSession();
  assert.equal(openSlots(s), 0);
  assert.equal(vacancyStatus(s), null);
  assert.equal(ersatzNeeded(s), false);
});

test("a cancellation opens a place while the Ersatz hasn't answered", () => {
  const s = makeSession({ starters: oneCancelled });
  assert.equal(openSlots(s), 1);
  assert.deepEqual(vacancyStatus(s), { open: 1, label: "Ersatz gesucht", short: "Ersatz gesucht" });
  assert.equal(ersatzNeeded(s), true);
});

test("the Ersatz saying yes fills the place", () => {
  const s = makeSession({ starters: oneCancelled, ersatz: assignment(5, "ja", "ersatz") });
  assert.equal(openSlots(s), 0);
  assert.deepEqual(vacancyStatus(s), { open: 0, label: "Ersatz springt ein", short: "Ersatz kommt" });
});

test("someone jumping in fills the place and the session reads as complete", () => {
  const s = makeSession({ starters: oneCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(openSlots(s), 0);
  assert.deepEqual(vacancyStatus(s), { open: 0, label: "Vollständig", short: "Vollständig" });
  assert.equal(ersatzNeeded(s), false);
});

test("an Ersatz yes after someone jumped in doesn't go below zero", () => {
  const s = makeSession({
    starters: oneCancelled,
    ersatz: assignment(5, "ja", "ersatz"),
    einspringer: [assignment(9, "ja", "einspringer")],
  });
  assert.equal(openSlots(s), 0);
  assert.equal(vacancyStatus(s)?.label, "Vollständig");
});

test("two cancellations, one filled: one place still open", () => {
  const s = makeSession({ starters: twoCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(openSlots(s), 1);
  assert.deepEqual(vacancyStatus(s), { open: 1, label: "Ersatz gesucht", short: "Ersatz gesucht" });
  assert.equal(ersatzNeeded(s), true);
});

test("status wording once the Ersatz answered or there is none", () => {
  assert.deepEqual(vacancyStatus(makeSession({ starters: twoCancelled })), {
    open: 2,
    label: "Ersatz gesucht – 2 Spieler fehlen",
    short: "Ersatz gesucht",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: twoCancelled, ersatz: assignment(5, "ja", "ersatz") })), {
    open: 1,
    label: "Ersatz springt ein – 1 Spieler fehlt noch",
    short: "1 Spieler fehlt",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: oneCancelled, ersatz: assignment(5, "nein", "ersatz") })), {
    open: 1,
    label: "1 Spieler fehlt – Ersatz kann auch nicht",
    short: "1 Spieler fehlt",
  });
  assert.deepEqual(vacancyStatus(makeSession({ starters: oneCancelled, ersatz: null })), {
    open: 1,
    label: "1 Spieler fehlt",
    short: "1 Spieler fehlt",
  });
});

test("the Ersatz gets the all-clear only when a jump-in filled the last place and they hadn't answered", () => {
  const before = new Date("2026-11-03T08:00:00Z");
  const filled = makeSession({ starters: oneCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(ersatzNoLongerNeeded(filled, before), true);

  assert.equal(ersatzNoLongerNeeded({ ...filled, ersatz: assignment(5, "nein", "ersatz") }, before), false);
  assert.equal(ersatzNoLongerNeeded({ ...filled, ersatz: null }, before), false);
  assert.equal(ersatzNoLongerNeeded(filled, new Date("2026-11-03T22:00:00Z")), false);
  const stillOpen = makeSession({ starters: twoCancelled, einspringer: [assignment(9, "ja", "einspringer")] });
  assert.equal(ersatzNoLongerNeeded(stillOpen, before), false);
});

test("the Ersatz is only named as playing once they said yes and a cancelled place is theirs", () => {
  const ja = assignment(5, "ja", "ersatz");
  assert.equal(playingErsatz(makeSession({ starters: oneCancelled, ersatz: ja }))?.playerId, 5);
  // Said yes, but nobody cancelled: just standing by.
  assert.equal(playingErsatz(makeSession({ ersatz: ja })), null);
  // Someone else already took the only free place.
  assert.equal(
    playingErsatz(makeSession({ starters: oneCancelled, ersatz: ja, einspringer: [assignment(9, "ja", "einspringer")] })),
    null,
  );
  // Hasn't answered yet.
  assert.equal(playingErsatz(makeSession({ starters: oneCancelled })), null);
});
