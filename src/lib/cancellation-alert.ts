import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { players, reminderLog } from "@/db/schema";
import { getFullSchedule } from "@/lib/queries";
import { sendReminderBatch, type CancellationNoticeInput, type OpenSlotEmailInput } from "@/lib/email";
import { playerLabel } from "@/lib/format";
import { sameDayCancellationMails, type Cancellation } from "@/lib/same-day-cancellation";

/**
 * After someone cancelled on the day of the session — by then the morning email has usually gone out: asks
 * everyone who could jump in ("Platz frei") and tells everyone still coming that a place is free. Never throws.
 */
export async function notifySameDayCancellation(
  opts: Cancellation & { sessionId: number; baseUrl: string },
): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session) return;

    const { freePlayers, court } = sameDayCancellationMails(schedule, session, opts, new Date());
    if (freePlayers.length + court.length === 0) return;

    const from = process.env.MAIL_FROM;
    if (!from) {
      console.warn("MAIL_FROM ist nicht gesetzt – Absage-Benachrichtigung übersprungen.");
      return;
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(players)
      .where(inArray(players.id, [...freePlayers, ...court]));
    const withEmail = (ids: number[]) => rows.filter((p) => p.email && ids.includes(p.id));

    const asked = withEmail(freePlayers);
    const inputs: (OpenSlotEmailInput | CancellationNoticeInput)[] = [
      ...asked.map((p) => ({
        kind: "platz-frei" as const,
        to: p.email!,
        playerName: playerLabel(p),
        session,
        token: p.token,
        baseUrl: opts.baseUrl,
      })),
      ...withEmail(court).map((p) => ({
        kind: "absage" as const,
        to: p.email!,
        playerName: playerLabel(p),
        session,
        coachCancelled: opts.role === "trainer",
        token: p.token,
        baseUrl: opts.baseUrl,
      })),
    ];
    if (inputs.length === 0) return;

    const results = await sendReminderBatch(inputs, { from, replyTo: process.env.REPLY_TO });
    const failed = results.find((r) => r.error);
    if (failed) console.error("Absage-Benachrichtigung fehlgeschlagen:", failed.error);

    // "Platz frei" is logged like in the morning run, so a cancellation before that run isn't announced twice.
    const logged = asked
      .map((p, i) => ({ sessionId: session.id, playerId: p.id, result: results[i] }))
      .filter((r) => r.result && !r.result.error);
    if (logged.length === 0) return;
    await db
      .insert(reminderLog)
      .values(logged.map((r) => ({ sessionId: r.sessionId, playerId: r.playerId, providerMessageId: r.result.id ?? null })))
      .onConflictDoNothing();
  } catch (err) {
    console.error("Absage-Benachrichtigung fehlgeschlagen:", err);
  }
}
