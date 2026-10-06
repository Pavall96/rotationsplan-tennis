import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { players, reminderLog } from "@/db/schema";
import { getFullSchedule, type SessionView } from "@/lib/queries";
import { sendEmailBatch, type OutgoingEmail } from "@/lib/email";
import { renderTrainerEmail, trainerStand } from "@/lib/trainer-email";
import { formatDateForFile, playerLabel } from "@/lib/format";

export type TrainerUpdateResult = {
  date: string;
  sent: number;
  wouldSend?: { to: string; subject: string }[];
  skippedNoEmail: number;
  skippedAlreadySent: number;
};

/** Whether the coach should hear in the afternoon that the round is still short of confirmed players. */
export function trainerUpdateDue(session: SessionView, now: Date): boolean {
  if (!session.trainer || session.trainer.rsvpStatus === "nein") return false;
  if (session.startsAt <= now) return false;
  const stand = trainerStand(session);
  return stand.zugesagt.length < stand.places;
}

/**
 * Afternoon email to the coach of each of today's sessions that isn't fully confirmed yet. Runs from its own
 * daily cron; the 'nachmittag' rows in reminder_log make it safe to run more than once.
 */
export async function runTrainerUpdates(opts: { dryRun: boolean; baseUrl: string }): Promise<TrainerUpdateResult> {
  const now = new Date();
  const today = formatDateForFile(now);
  const due = (await getFullSchedule()).filter((s) => formatDateForFile(s.startsAt) === today && trainerUpdateDue(s, now));
  if (due.length === 0) return { date: today, sent: 0, skippedNoEmail: 0, skippedAlreadySent: 0 };

  const db = getDb();
  const [trainers, logs] = await Promise.all([
    db.select().from(players).where(inArray(players.id, due.map((s) => s.trainer!.playerId))),
    db
      .select()
      .from(reminderLog)
      .where(and(eq(reminderLog.kind, "nachmittag"), inArray(reminderLog.sessionId, due.map((s) => s.id)))),
  ]);
  const trainerById = new Map(trainers.map((p) => [p.id, p]));
  const alreadySent = new Set(logs.map((r) => `${r.sessionId}:${r.playerId}`));

  let skippedNoEmail = 0;
  let skippedAlreadySent = 0;
  const toSend: { email: OutgoingEmail; sessionId: number; playerId: number }[] = [];
  for (const session of due) {
    const trainer = trainerById.get(session.trainer!.playerId);
    if (alreadySent.has(`${session.id}:${session.trainer!.playerId}`)) {
      skippedAlreadySent++;
      continue;
    }
    if (!trainer?.email) {
      skippedNoEmail++;
      continue;
    }
    const rendered = renderTrainerEmail({
      to: trainer.email,
      playerName: playerLabel(trainer),
      confirmed: session.trainer!.rsvpStatus === "ja",
      lauf: "nachmittag",
      session,
      token: trainer.token,
      baseUrl: opts.baseUrl,
    });
    toSend.push({ email: { to: trainer.email, ...rendered }, sessionId: session.id, playerId: trainer.id });
  }

  if (opts.dryRun) {
    return {
      date: today,
      sent: 0,
      wouldSend: toSend.map((t) => ({ to: t.email.to, subject: t.email.subject })),
      skippedNoEmail,
      skippedAlreadySent,
    };
  }
  if (toSend.length === 0) return { date: today, sent: 0, skippedNoEmail, skippedAlreadySent };

  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM ist nicht gesetzt.");
  const results = await sendEmailBatch(
    toSend.map((t) => t.email),
    { from, replyTo: process.env.REPLY_TO },
  );

  let sent = 0;
  for (let i = 0; i < toSend.length; i++) {
    const result = results[i];
    if (result?.error) continue;
    await db
      .insert(reminderLog)
      .values({
        sessionId: toSend[i].sessionId,
        playerId: toSend[i].playerId,
        kind: "nachmittag",
        providerMessageId: result?.id ?? null,
      })
      .onConflictDoNothing();
    sent++;
  }
  return { date: today, sent, skippedNoEmail, skippedAlreadySent };
}
