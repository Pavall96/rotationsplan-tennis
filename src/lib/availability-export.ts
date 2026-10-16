import ExcelJS from "exceljs";
import type { MatchView } from "@/lib/matches";
import type { RosterRow } from "@/lib/roster";
import { canBeAsked, type PlayerRoster } from "@/lib/eligibility";
import { availabilityKey, AVAILABILITY_LABEL, type AvailabilityStatus } from "@/lib/availability";
import { formatDayShort, formatTime } from "@/lib/format";

/** One cell of the matrix: an answer, "offen" (asked, no answer yet) or null (not asked — no team that day fits). */
export type ExportCell = AvailabilityStatus | "offen" | null;

export type ExportPlayer = { playerId: number; name: string; lists: string; lk: string | null; cells: ExportCell[] };

export type ExportDay = {
  date: string;
  matches: MatchView[];
  needed: number;
  counts: Record<AvailabilityStatus | "offen", number>;
};

/** Players × Spieltage, players in Meldeliste order (best position on either list first). */
export function availabilityMatrix(
  days: { date: string; matches: MatchView[] }[],
  roster: RosterRow[],
  rosters: Map<number, PlayerRoster>,
  answers: Map<string, AvailabilityStatus>,
): { days: ExportDay[]; players: ExportPlayer[] } {
  const people = new Map<number, ExportPlayer>();
  const bestPosition = new Map<number, number>();
  for (const r of roster) {
    const p = people.get(r.playerId) ?? { playerId: r.playerId, name: r.name, lists: "", lk: r.lk, cells: [] };
    const tag = `${r.ageClass === "h30" ? "H30" : "H"} ${r.position}`;
    p.lists = p.lists ? `${p.lists} · ${tag}` : tag;
    p.lk ??= r.lk;
    bestPosition.set(r.playerId, Math.min(bestPosition.get(r.playerId) ?? 999, r.position));
    people.set(r.playerId, p);
  }
  const sorted = [...people.values()].sort((a, b) => bestPosition.get(a.playerId)! - bestPosition.get(b.playerId)!);

  const exportDays = days.map(({ date, matches }) => {
    const counts = { ja: 0, vielleicht: 0, nein: 0, offen: 0 };
    for (const p of sorted) {
      const asked = matches.some((m) => canBeAsked(rosters.get(p.playerId) ?? {}, m.team));
      const cell: ExportCell = asked ? (answers.get(availabilityKey(p.playerId, date)) ?? "offen") : null;
      if (cell) counts[cell]++;
      p.cells.push(cell);
    }
    return { date, matches, needed: matches.reduce((n, m) => n + m.playersNeeded, 0), counts };
  });

  return { days: exportDays, players: sorted };
}

const CELL_TEXT: Record<AvailabilityStatus | "offen", string> = { ...AVAILABILITY_LABEL, offen: "offen" };
// Soft fills that print well: green / amber / red / grey.
const CELL_FILL: Record<AvailabilityStatus | "offen", string> = {
  ja: "FFC6EFCE",
  vielleicht: "FFFFEB9C",
  nein: "FFFFC7CE",
  offen: "FFEDEDED",
};

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** The .xlsx file: sheet "Abstimmungen" (who can when) and sheet "Spieltage" (the matches behind each column). */
export async function availabilityWorkbook(matrix: ReturnType<typeof availabilityMatrix>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const sheet = wb.addWorksheet("Abstimmungen", { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
  sheet.columns = [
    { header: "Spieler", width: 24 },
    { header: "Meldeliste", width: 14 },
    { header: "LK", width: 6, style: { numFmt: "0.0" } },
    ...matrix.days.map((d) => ({ header: formatDayShort(d.date), width: 12 })),
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  matrix.days.forEach((d, i) => {
    header.getCell(4 + i).note = d.matches
      .map((m) => `${m.team.name}: ${formatTime(m.startsAt)} ${m.isHome ? "vs" : "@"} ${m.opponent}`)
      .join("\n");
  });

  for (const p of matrix.players) {
    const row = sheet.addRow([
      p.name,
      p.lists,
      p.lk === null ? null : Number(p.lk),
      ...p.cells.map((c) => (c ? CELL_TEXT[c] : "–")),
    ]);
    p.cells.forEach((c, i) => {
      const cell = row.getCell(4 + i);
      cell.alignment = { horizontal: "center" };
      if (c) cell.fill = solid(CELL_FILL[c]);
      else cell.font = { color: { argb: "FFAAAAAA" } };
    });
  }

  sheet.addRow([]);
  const summary: [string, (d: ExportDay) => number][] = [
    ["Können", (d) => d.counts.ja],
    ["Vielleicht", (d) => d.counts.vielleicht],
    ["Können nicht", (d) => d.counts.nein],
    ["Noch offen", (d) => d.counts.offen],
    ["Nötig", (d) => d.needed],
  ];
  for (const [label, value] of summary) {
    const row = sheet.addRow([label, null, null, ...matrix.days.map(value)]);
    row.font = { bold: true };
    row.alignment = { horizontal: "center" };
    row.getCell(1).alignment = { horizontal: "left" };
  }
  // Not enough "Können" for the day's matches: mark the count red, like the Mannschaftsführer page does.
  const yesRow = sheet.getRow(sheet.rowCount - summary.length + 1);
  matrix.days.forEach((d, i) => {
    if (d.counts.ja < d.needed) yesRow.getCell(4 + i).font = { bold: true, color: { argb: "FFC00000" } };
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + matrix.players.length, column: 3 + matrix.days.length } };

  const games = wb.addWorksheet("Spieltage", { views: [{ state: "frozen", ySplit: 1 }] });
  games.columns = [
    { header: "Datum", width: 12 },
    { header: "Mannschaft", width: 16 },
    { header: "Beginn", width: 8 },
    { header: "Heim/Auswärts", width: 14 },
    { header: "Gegner", width: 32 },
    { header: "Halle", width: 32 },
    { header: "Spieler nötig", width: 13 },
  ];
  games.getRow(1).font = { bold: true };
  for (const d of matrix.days) {
    for (const m of d.matches) {
      games.addRow([
        formatDayShort(m.matchDate),
        m.team.name,
        formatTime(m.startsAt),
        m.isHome ? "Heim" : "Auswärts",
        m.opponent,
        m.venue?.name ?? "",
        m.playersNeeded,
      ]);
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
