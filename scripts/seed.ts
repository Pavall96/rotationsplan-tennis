import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "../src/db";
import { players, courts, sessions, sessionAssignments } from "../src/db/schema";

type SeedData = {
  courts: {
    slug: "happy-match" | "frankenbach";
    label: string;
    hallName: string;
    withCoach: boolean;
    startLocal: string;
    endLocal: string;
    address: string;
  }[];
  players: { displayName: string; lk: number | null; wantsCoach: boolean }[];
  sessions: {
    court: "happy-match" | "frankenbach";
    sessionNo: number;
    date: string;
    players: string[];
    ersatz: string;
    lkRange: string | null;
    note: string | null;
  }[];
};

function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function main() {
  const db = getDb();
  const seedPath = path.join(process.cwd(), "data", "seed.json");
  const seed: SeedData = JSON.parse(await readFile(seedPath, "utf-8"));

  // ---- Courts (upsert by slug) ----
  for (const c of seed.courts) {
    await db
      .insert(courts)
      .values(c)
      .onConflictDoUpdate({
        target: courts.slug,
        set: {
          label: c.label,
          hallName: c.hallName,
          withCoach: c.withCoach,
          startLocal: c.startLocal,
          endLocal: c.endLocal,
          address: c.address,
        },
      });
  }
  const courtRows = await db.select().from(courts);
  const courtIdBySlug = new Map(courtRows.map((c) => [c.slug, c.id]));

  // ---- Players (upsert by displayName; never rotate token; never null out email) ----
  for (const p of seed.players) {
    await db
      .insert(players)
      .values({
        displayName: p.displayName,
        lk: p.lk === null ? null : String(p.lk),
        wantsCoach: p.wantsCoach,
        token: newToken(),
      })
      .onConflictDoUpdate({
        target: players.displayName,
        set: {
          lk: p.lk === null ? null : String(p.lk),
          wantsCoach: p.wantsCoach,
          // email and token intentionally omitted: existing values are preserved.
        },
      });
  }
  const playerRows = await db.select().from(players);
  const playerIdByName = new Map(playerRows.map((p) => [p.displayName, p.id]));

  // ---- Sessions (upsert by court+date), starts_at/ends_at computed in Postgres for DST correctness ----
  let sessionCount = 0;
  let assignmentCount = 0;
  for (const s of seed.sessions) {
    const courtId = courtIdBySlug.get(s.court);
    if (!courtId) throw new Error(`Unbekannter Platz-Slug: ${s.court}`);
    const court = seed.courts.find((c) => c.slug === s.court)!;

    const [row] = await db
      .insert(sessions)
      .values({
        courtId,
        sessionNo: s.sessionNo,
        sessionDate: s.date,
        lkRange: s.lkRange,
        note: s.note,
        startsAt: sql`((${s.date}::date + ${court.startLocal}::time) at time zone 'Europe/Berlin')`,
        endsAt: sql`((${s.date}::date + ${court.endLocal}::time) at time zone 'Europe/Berlin')`,
      })
      .onConflictDoUpdate({
        target: [sessions.courtId, sessions.sessionDate],
        set: {
          sessionNo: s.sessionNo,
          lkRange: s.lkRange,
          note: s.note,
          startsAt: sql`((${s.date}::date + ${court.startLocal}::time) at time zone 'Europe/Berlin')`,
          endsAt: sql`((${s.date}::date + ${court.endLocal}::time) at time zone 'Europe/Berlin')`,
        },
      })
      .returning({ id: sessions.id });

    sessionCount++;

    // Replace starter/ersatz assignments for this session (rsvps/reminder_log are untouched,
    // and any manually-added 'trainer' assignment is preserved — it isn't in the workbook).
    await db
      .delete(sessionAssignments)
      .where(and(eq(sessionAssignments.sessionId, row.id), inArray(sessionAssignments.role, ["starter", "ersatz"])));

    const rows: { sessionId: number; playerId: number; role: "starter" | "ersatz"; slot: number | null }[] = [];
    s.players.forEach((name, idx) => {
      const playerId = playerIdByName.get(name);
      if (!playerId) throw new Error(`Unbekannter Spieler beim Seeding: ${name}`);
      rows.push({ sessionId: row.id, playerId, role: "starter", slot: idx + 1 });
    });
    const ersatzId = playerIdByName.get(s.ersatz);
    if (!ersatzId) throw new Error(`Unbekannter Ersatzspieler beim Seeding: ${s.ersatz}`);
    rows.push({ sessionId: row.id, playerId: ersatzId, role: "ersatz", slot: null });

    await db.insert(sessionAssignments).values(rows);
    assignmentCount += rows.length;
  }

  console.log("✅ Seed abgeschlossen.");
  console.log(`   Spieler: ${playerRows.length}`);
  console.log(`   Plätze: ${courtRows.length}`);
  console.log(`   Termine: ${sessionCount}`);
  console.log(`   Zuordnungen: ${assignmentCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
