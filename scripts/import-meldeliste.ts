// Imports the namentliche Mannschaftsmeldung (data/meldeliste.json) into roster_entries, creating app players for
// everyone on the lists who isn't in the app yet. Safe to re-run: players are matched by their WTB ID, and each age
// class's list is replaced as a whole (the Meldeliste order is the WTB's, not something edited in the app).
//
//   npm run data:meldeliste -- --dry-run
//   npm run data:meldeliste

import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "../src/db";
import { players, rosterEntries } from "../src/db/schema";

type ListEntry = {
  position: number;
  firstName: string;
  lastName: string;
  wtbId: string;
  lk: number;
  nationality: string | null;
  countsAsGerman: boolean;
};
type MeldelisteFile = { source: string; lists: Record<"herren" | "h30", ListEntry[]> };

// Players already in the app under a nickname (from the training spreadsheet), keyed by WTB ID-Nummer.
const EXISTING_APP_PLAYERS: Record<string, string> = {
  "10152452": "Patrick Kremer",
  "19954396": "Phillipp Kremer",
  "18152806": "Seb",
  "19158295": "Hakan",
  "10300931": "Yassin",
  "10768663": "Ben",
  "19662285": "Pablo",
  "10913897": "Nils Saxinger",
  "19865483": "Pascal",
  "18151753": "Uli",
  "19158856": "Daniel",
  "18555117": "Philipp Wilson",
  "18151754": "Motzi",
  "19301251": "Moritz",
  "19259708": "Mario",
  "19765040": "Louis",
  "17054401": "Martin",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const file: MeldelisteFile = JSON.parse(
    await readFile(path.join(process.cwd(), "data", "meldeliste.json"), "utf-8"),
  );

  // Same person appears on both lists — collect each WTB ID once.
  const people = new Map<string, ListEntry>();
  for (const list of Object.values(file.lists)) for (const e of list) people.set(e.wtbId, e);

  const db = getDb();
  const appPlayers = await db.select().from(players);
  const byName = new Map(appPlayers.map((p) => [p.displayName, p]));
  const byWtbId = new Map(appPlayers.filter((p) => p.wtbId).map((p) => [p.wtbId!, p]));

  const toLink: { playerId: number; name: string; wtbId: string }[] = [];
  const toCreate: ListEntry[] = [];
  for (const [wtbId, e] of people) {
    if (byWtbId.has(wtbId)) continue;
    const nickname = EXISTING_APP_PLAYERS[wtbId];
    if (nickname) {
      const p = byName.get(nickname);
      if (!p) throw new Error(`Spieler „${nickname}“ (WTB ${wtbId}) nicht in der App gefunden.`);
      toLink.push({ playerId: p.id, name: nickname, wtbId });
    } else {
      toCreate.push(e);
    }
  }

  console.log(`${file.source}`);
  console.log(`  Herren: ${file.lists.herren.length} · Herren 30: ${file.lists.h30.length} · Personen: ${people.size}`);
  console.log(`  Verknüpfe ${toLink.length} bestehende Spieler: ${toLink.map((l) => l.name).join(", ") || "–"}`);
  console.log(
    `  Lege ${toCreate.length} neue Spieler an: ${toCreate.map((e) => `${e.firstName} ${e.lastName}`).join(", ") || "–"}`,
  );

  if (dryRun) {
    console.log("\n(Dry run – nichts gespeichert.)");
    return;
  }

  for (const l of toLink) {
    await db.update(players).set({ wtbId: l.wtbId }).where(eq(players.id, l.playerId));
  }
  for (const e of toCreate) {
    await db.insert(players).values({
      displayName: `${e.firstName} ${e.lastName}`,
      lk: e.lk.toFixed(1),
      wantsCoach: false,
      wtbId: e.wtbId,
      token: crypto.randomBytes(24).toString("base64url"),
    });
  }
  // Fill in an LK for linked players that have none yet; never overwrite the training spreadsheet's value.
  for (const [wtbId, e] of people) {
    await db
      .update(players)
      .set({ lk: e.lk.toFixed(1) })
      .where(and(eq(players.wtbId, wtbId), isNull(players.lk)));
  }

  const idByWtb = new Map(
    (await db.select({ id: players.id, wtbId: players.wtbId }).from(players))
      .filter((p) => p.wtbId)
      .map((p) => [p.wtbId!, p.id]),
  );

  for (const [ageClass, list] of Object.entries(file.lists) as ["herren" | "h30", ListEntry[]][]) {
    const rows = list.map((e) => {
      const playerId = idByWtb.get(e.wtbId);
      if (!playerId) throw new Error(`Kein Spieler für WTB-ID ${e.wtbId} (${e.firstName} ${e.lastName}).`);
      return {
        ageClass,
        position: e.position,
        playerId,
        lk: e.lk.toFixed(1),
        nationality: e.nationality,
        countsAsGerman: e.countsAsGerman,
      };
    });
    // Delete and re-insert as one transaction (the HTTP driver's batch): if the insert fails, the old list stays,
    // so production never ends up with an empty Meldeliste.
    await db.batch([
      db.delete(rosterEntries).where(eq(rosterEntries.ageClass, ageClass)),
      db.insert(rosterEntries).values(rows),
    ]);
  }

  console.log(`\n✅ Meldeliste importiert.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
