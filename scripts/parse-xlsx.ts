import ExcelJS from "exceljs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

type ParsedPlayer = {
  displayName: string;
  lk: number | null;
  wantsCoach: boolean;
  expectedMit: number;
  expectedOhne: number;
  expectedGesamt: number;
};

type ParsedSession = {
  court: "happy-match" | "frankenbach";
  sessionNo: number;
  date: string; // YYYY-MM-DD
  players: string[]; // 4 names, slot order
  ersatz: string;
  lkRange: string | null;
  note: string | null;
};

const COURTS = [
  {
    slug: "happy-match" as const,
    label: "Platz 1",
    hallName: "Happy Match",
    withCoach: true,
    startLocal: "20:30",
    endLocal: "22:00",
  },
  {
    slug: "frankenbach" as const,
    label: "Platz 2",
    hallName: "Tennishalle Frankenbach",
    withCoach: false,
    startLocal: "20:00",
    endLocal: "21:30",
  },
];

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "formula" in (value as object)) {
    const result = (value as { result?: unknown }).result;
    // ExcelJS drops the cached `result` key entirely when a COUNTIF formula's
    // cached value is exactly 0 (confirmed against the raw sheet XML, which
    // does contain <v>0</v>) — so a missing result on a formula cell means 0.
    if (result === undefined) return 0;
    return typeof result === "number" ? result : Number(result);
  }
  return Number(value ?? 0);
}

function cellDate(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  throw new Error(`Expected a Date cell, got: ${JSON.stringify(value)}`);
}

function isTuesday(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 2;
}

async function main() {
  const filePath =
    process.argv[2] ?? path.join(os.homedir(), "Downloads", "Rotationsplan_Wintertraining_2026-27.xlsx");

  console.log(`Lese ${filePath} ...`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // ---- Players (Übersicht, rows 12-28) ----
  const uebersicht = workbook.getWorksheet("Übersicht");
  if (!uebersicht) fail('Sheet "Übersicht" nicht gefunden.');

  const players: ParsedPlayer[] = [];
  for (let r = 12; r <= 28; r++) {
    const row = uebersicht.getRow(r);
    const name = cellText(row.getCell(1).value);
    if (!name || name.toLowerCase() === "summe") break;
    const lkRaw = row.getCell(2).value;
    const lk = typeof lkRaw === "number" ? lkRaw : lkRaw ? Number(String(lkRaw).replace(",", ".")) : null;
    const wantsCoachRaw = cellText(row.getCell(3).value).toLowerCase();
    const expectedMit = cellNumber(row.getCell(4).value);
    const expectedOhne = cellNumber(row.getCell(5).value);
    const expectedGesamt = cellNumber(row.getCell(6).value);
    players.push({
      displayName: name,
      lk: Number.isFinite(lk) ? (lk as number) : null,
      wantsCoach: wantsCoachRaw === "ja",
      expectedMit,
      expectedOhne,
      expectedGesamt,
    });
  }

  if (players.length !== 17) {
    fail(`Erwartet 17 Spieler in Übersicht, gefunden: ${players.length}`);
  }
  const coachCount = players.filter((p) => p.wantsCoach).length;
  if (coachCount !== 10) {
    fail(`Erwartet 10 Spieler mit Trainerwunsch, gefunden: ${coachCount}`);
  }
  const playerNames = new Set(players.map((p) => p.displayName));

  // ---- Sessions (Mit Trainer / Ohne Trainer) ----
  function parseSessionSheet(sheetName: string, court: "happy-match" | "frankenbach"): ParsedSession[] {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) fail(`Sheet "${sheetName}" nicht gefunden.`);

    const out: ParsedSession[] = [];
    let r = 5; // header is row 4
    while (r <= sheet.rowCount) {
      const row = sheet.getRow(r);
      const terminRaw = cellText(row.getCell(1).value);
      r++;
      if (!/^\d+$/.test(terminRaw)) {
        // Skip decoy rows ("—" / "kein Training") and trailing footnote text.
        continue;
      }
      const sessionNo = Number(terminRaw);
      const date = cellDate(row.getCell(2).value);
      const playerCells = [3, 4, 5, 6].map((c) => cellText(row.getCell(c).value));
      const ersatz = cellText(row.getCell(8).value);
      const lkRange = cellText(row.getCell(7).value) || null;
      const note = cellText(row.getCell(9).value) || null;

      out.push({ court, sessionNo, date, players: playerCells, ersatz, lkRange, note });
    }
    return out;
  }

  const mitTrainer = parseSessionSheet("Mit Trainer", "happy-match");
  const ohneTrainer = parseSessionSheet("Ohne Trainer", "frankenbach");
  const allSessions = [...mitTrainer, ...ohneTrainer];

  if (mitTrainer.length !== 28) fail(`Erwartet 28 Termine "Mit Trainer", gefunden: ${mitTrainer.length}`);
  if (ohneTrainer.length !== 30) fail(`Erwartet 30 Termine "Ohne Trainer", gefunden: ${ohneTrainer.length}`);

  // ---- Assertion: exact name resolution ----
  for (const s of allSessions) {
    for (const name of [...s.players, s.ersatz]) {
      if (!playerNames.has(name)) {
        fail(`Unbekannter Spielername "${name}" bei ${s.court} Termin ${s.sessionNo} (${s.date})`);
      }
    }
  }

  // ---- Assertion: every date is a Tuesday, in range ----
  for (const s of allSessions) {
    if (!isTuesday(s.date)) fail(`Datum ${s.date} (${s.court} #${s.sessionNo}) ist kein Dienstag.`);
    if (s.date < "2026-10-06" || s.date > "2027-04-27") {
      fail(`Datum ${s.date} (${s.court} #${s.sessionNo}) liegt außerhalb der erwarteten Saison.`);
    }
  }

  // ---- Assertion: no duplicate (court, date) ----
  const seenCourtDate = new Set<string>();
  for (const s of allSessions) {
    const key = `${s.court}|${s.date}`;
    if (seenCourtDate.has(key)) fail(`Doppeltes Datum ${s.date} für ${s.court}.`);
    seenCourtDate.add(key);
  }

  // ---- Assertion: 4 distinct players, Ersatz not among them ----
  for (const s of allSessions) {
    const uniquePlayers = new Set(s.players);
    if (uniquePlayers.size !== 4) {
      fail(`${s.court} #${s.sessionNo} (${s.date}) hat keine 4 unterschiedlichen Spieler.`);
    }
    if (uniquePlayers.has(s.ersatz)) {
      fail(`${s.court} #${s.sessionNo} (${s.date}): Ersatz "${s.ersatz}" ist auch Starter.`);
    }
  }

  // ---- Assertion: no player on both courts same date ----
  const byDateCourtPlayers = new Map<string, Map<string, Set<string>>>();
  for (const s of allSessions) {
    if (!byDateCourtPlayers.has(s.date)) byDateCourtPlayers.set(s.date, new Map());
    byDateCourtPlayers.get(s.date)!.set(s.court, new Set(s.players));
  }
  for (const [date, courtsMap] of byDateCourtPlayers) {
    const hm = courtsMap.get("happy-match");
    const fb = courtsMap.get("frankenbach");
    if (hm && fb) {
      for (const name of hm) {
        if (fb.has(name)) fail(`${name} ist am ${date} auf beiden Plätzen eingeteilt.`);
      }
    }
  }

  // ---- Assertion: every Mit-Trainer starter/Ersatz wants coach ----
  const wantsCoachSet = new Set(players.filter((p) => p.wantsCoach).map((p) => p.displayName));
  for (const s of mitTrainer) {
    for (const name of [...s.players, s.ersatz]) {
      if (!wantsCoachSet.has(name)) {
        fail(`${name} spielt "Mit Trainer" (#${s.sessionNo}, ${s.date}), hat aber keinen Trainerwunsch.`);
      }
    }
  }

  // ---- Assertion: recomputed per-player counts match Übersicht ----
  const mitCount = new Map<string, number>();
  const ohneCount = new Map<string, number>();
  for (const s of mitTrainer) {
    for (const name of s.players) mitCount.set(name, (mitCount.get(name) ?? 0) + 1);
  }
  for (const s of ohneTrainer) {
    for (const name of s.players) ohneCount.set(name, (ohneCount.get(name) ?? 0) + 1);
  }
  for (const p of players) {
    const mit = mitCount.get(p.displayName) ?? 0;
    const ohne = ohneCount.get(p.displayName) ?? 0;
    if (mit !== p.expectedMit) {
      fail(`${p.displayName}: berechnete "mit Trainer"-Termine (${mit}) != Übersicht (${p.expectedMit})`);
    }
    if (ohne !== p.expectedOhne) {
      fail(`${p.displayName}: berechnete "ohne Trainer"-Termine (${ohne}) != Übersicht (${p.expectedOhne})`);
    }
    if (mit + ohne !== p.expectedGesamt) {
      fail(`${p.displayName}: berechnete Gesamt-Termine (${mit + ohne}) != Übersicht (${p.expectedGesamt})`);
    }
  }
  const totalMit = [...mitCount.values()].reduce((a, b) => a + b, 0);
  const totalOhne = [...ohneCount.values()].reduce((a, b) => a + b, 0);
  if (totalMit !== 112) fail(`Gesamtzahl "mit Trainer"-Slots erwartet 112, berechnet ${totalMit}`);
  if (totalOhne !== 120) fail(`Gesamtzahl "ohne Trainer"-Slots erwartet 120, berechnet ${totalOhne}`);

  console.log("✅ Alle Prüfungen bestanden.");
  console.log(`   Spieler: ${players.length} (davon ${coachCount} mit Trainerwunsch)`);
  console.log(`   Termine: ${mitTrainer.length} mit Trainer, ${ohneTrainer.length} ohne Trainer`);

  const seed = {
    generatedAt: new Date().toISOString(),
    courts: COURTS,
    players,
    sessions: allSessions,
  };

  const outDir = path.join(process.cwd(), "data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "seed.json");
  await writeFile(outPath, JSON.stringify(seed, null, 2), "utf-8");
  console.log(`   Geschrieben: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
