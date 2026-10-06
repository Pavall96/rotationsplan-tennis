import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionToIcsEvent } from "./ics";
import { assignment, makeSession } from "./test-fixtures";

const player = { id: 1, token: "tok" };
const describe = (overrides: Parameters<typeof makeSession>[0]) =>
  sessionToIcsEvent(makeSession(overrides), player, "https://example.test").description.split("\n");

test("nobody cancelled: everyone is listed, with the Ersatz on standby", () => {
  assert.deepEqual(describe({}), [
    "Mit dabei: P1, P2, P3, P4",
    "Ersatz: Antwort offen",
    "Rückmeldung: https://example.test/spieler/tok",
  ]);
});

test("cancelled starters move out of „Mit dabei“ and the open place is spelled out", () => {
  const lines = describe({
    starters: [assignment(1, "ja"), assignment(2, "nein"), assignment(3, "ja"), assignment(4, "nein")],
    einspringer: [assignment(9, "ja", "einspringer")],
    ersatz: assignment(5, "nein", "ersatz"),
    trainer: assignment(7, "ja", "trainer"),
    note: "Saisonstart",
  });
  assert.deepEqual(lines, [
    "Mit dabei: P1, P3, P9",
    "Abgesagt: P2, P4",
    "Trainer: P7",
    "Ersatz: abgesagt",
    "Noch frei: 1 Platz",
    "Hinweis: Saisonstart",
    "Rückmeldung: https://example.test/spieler/tok",
  ]);
});

test("an Ersatz who plays is listed with the players, and a full session has no free place", () => {
  const lines = describe({
    starters: [assignment(1, "ja"), assignment(2, "nein"), assignment(3), assignment(4)],
    ersatz: assignment(5, "ja", "ersatz"),
  });
  assert.deepEqual(lines, [
    "Mit dabei: P1, P3, P4, P5",
    "Abgesagt: P2",
    "Rückmeldung: https://example.test/spieler/tok",
  ]);
});

test("a trainer who cancelled is marked", () => {
  const lines = describe({ trainer: assignment(7, "nein", "trainer") });
  assert.equal(lines[1], "Trainer: P7 (abgesagt)");
});

test("the Ersatz on standby is never named, only their answer", () => {
  const lines = describe({ ersatz: assignment(5, "ja", "ersatz") });
  assert.equal(lines[1], "Ersatz: steht bereit");
  assert.ok(!lines.join("\n").includes("P5"));
});

test("everyone cancelled: the line doesn't end in nothing", () => {
  const lines = describe({ starters: [assignment(1, "nein"), assignment(2, "nein")], ersatz: null });
  assert.deepEqual(lines.slice(0, 3), ["Mit dabei: niemand", "Abgesagt: P1, P2", "Noch frei: 2 Plätze"]);
});
