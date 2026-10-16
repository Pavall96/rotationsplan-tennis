import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { availabilityMatrix, availabilityWorkbook } from "./availability-export";
import { availabilityKey, type AvailabilityStatus } from "./availability";
import { rosterByPlayer, type RosterRow } from "./roster";
import type { MatchView } from "./matches";

function match(id: number, date: string, ageClass: "herren" | "h30", rank: number): MatchView {
  return {
    id,
    matchDate: date,
    startsAt: new Date(`${date}T13:00:00Z`),
    isHome: true,
    opponent: `Gegner ${id}`,
    playersNeeded: 4,
    lineupPublishedAt: null,
    scheduleVersion: 0,
    team: { id: rank, slug: `${ageClass}-${rank}`, name: `${ageClass === "h30" ? "Herren 30" : "Herren"} ${rank}`, ageClass, rank },
    venue: null,
  };
}

function row(playerId: number, ageClass: "herren" | "h30", position: number): RosterRow {
  return {
    ageClass,
    position,
    lk: "12.3",
    countsAsGerman: true,
    nationality: null,
    playerId,
    wtbId: null,
    name: `P${playerId}`,
    registered: true,
    playsMatches: true,
  };
}

const roster = [row(1, "herren", 5), row(2, "h30", 2), row(2, "herren", 9), row(3, "herren", 1)];
const days = [
  { date: "2026-11-07", matches: [match(1, "2026-11-07", "herren", 1)] },
  { date: "2026-11-14", matches: [match(2, "2026-11-14", "h30", 1)] },
];
const answers = new Map<string, AvailabilityStatus>([
  [availabilityKey(1, "2026-11-07"), "ja"],
  [availabilityKey(2, "2026-11-07"), "nein"],
  [availabilityKey(2, "2026-11-14"), "vielleicht"],
]);

test("players come in Meldeliste order, with both list positions", () => {
  const { players } = availabilityMatrix(days, roster, rosterByPlayer(roster), answers);
  assert.deepEqual(
    players.map((p) => [p.name, p.lists]),
    [
      ["P3", "H 1"],
      ["P2", "H30 2 · H 9"],
      ["P1", "H 5"],
    ],
  );
});

test("cells hold the answer, 'offen' when asked without answer, null when no team that day fits", () => {
  const { players, days: out } = availabilityMatrix(days, roster, rosterByPlayer(roster), answers);
  const cells = Object.fromEntries(players.map((p) => [p.name, p.cells]));
  assert.deepEqual(cells.P1, ["ja", null]);
  assert.deepEqual(cells.P2, ["nein", "vielleicht"]);
  assert.deepEqual(cells.P3, ["offen", null]);
  assert.deepEqual(out[0].counts, { ja: 1, vielleicht: 0, nein: 1, offen: 1 });
  assert.equal(out[0].needed, 4);
});

test("the workbook has the matrix and the match list", async () => {
  const buffer = await availabilityWorkbook(availabilityMatrix(days, roster, rosterByPlayer(roster), answers));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet("Abstimmungen")!;
  assert.equal(sheet.getCell("A2").value, "P3");
  assert.equal(sheet.getCell("D2").value, "offen");
  assert.equal(sheet.getCell("E2").value, "–");
  assert.equal(sheet.getCell("D3").value, "Kann nicht");
  assert.equal(wb.getWorksheet("Spieltage")!.rowCount, 3);
});
