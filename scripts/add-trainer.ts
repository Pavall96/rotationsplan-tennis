import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../src/db";
import { players, courts, sessions, sessionAssignments } from "../src/db/schema";

async function main() {
  const db = getDb();
  const displayName = process.argv[2];
  const email = process.argv[3];
  if (!displayName) throw new Error("Usage: tsx scripts/add-trainer.ts \"<Name>\" [email]");

  const [existing] = await db.select().from(players).where(eq(players.displayName, displayName)).limit(1);
  let playerId: number;
  if (existing) {
    playerId = existing.id;
    if (email && !existing.email) {
      await db.update(players).set({ email }).where(eq(players.id, existing.id));
    }
    console.log(`Spieler existiert bereits: ${displayName} (id ${playerId})`);
  } else {
    const [inserted] = await db
      .insert(players)
      .values({
        displayName,
        wantsCoach: true,
        email: email ?? null,
        token: crypto.randomBytes(24).toString("base64url"),
      })
      .returning({ id: players.id });
    playerId = inserted.id;
    console.log(`Spieler angelegt: ${displayName} (id ${playerId})`);
  }

  const coachSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(courts, eq(sessions.courtId, courts.id))
    .where(eq(courts.withCoach, true));

  let added = 0;
  for (const s of coachSessions) {
    const [existingAssignment] = await db
      .select()
      .from(sessionAssignments)
      .where(and(eq(sessionAssignments.sessionId, s.id), eq(sessionAssignments.playerId, playerId)))
      .limit(1);
    if (existingAssignment) continue;
    await db.insert(sessionAssignments).values({ sessionId: s.id, playerId, role: "trainer", slot: null });
    added++;
  }

  const [withToken] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  console.log(`Trainer-Zuordnungen ergänzt: ${added} von ${coachSessions.length} "mit Trainer"-Terminen.`);
  console.log(`Token: ${withToken.token}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
