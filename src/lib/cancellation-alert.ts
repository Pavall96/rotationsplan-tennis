import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { players, reminderLog } from "@/db/schema";
import { getFullSchedule } from "@/lib/queries";
import { renderOpenSlot, sendEmailBatch, type OutgoingEmail } from "@/lib/email";
import { isAppleRelayEmail, playerLabel } from "@/lib/format";
import { sameDayOpenSlotRecipients, type Cancellation } from "./same-day-cancellation";

/** On the training day a cancellation goes out as "Platz frei" right away. Never throws. */
export async function notifySameDayCancellation(opts: Cancellation & { sessionId: number; baseUrl: string }): Promise<void> {
  try {
    const schedule = await getFullSchedule();
    const session = schedule.find((s) => s.id === opts.sessionId);
    if (!session) return;

    const ids = sameDayOpenSlotRecipients(schedule, session, opts, new Date());
    if (ids.length === 0) return;

    const from = process.env.MAIL_FROM;
    if (!from) {
      console.warn("MAIL_FROM ist nicht gesetzt – Platz-frei-Mail übersprungen.");
      return;
    }

    const db = getDb();
    const rows = (await db.select().from(players).where(inArray(players.id, ids))).filter(
      (p) => p.email && !isAppleRelayEmail(p.email),
    );
    if (rows.length === 0) return;

    const emails: OutgoingEmail[] = rows.map((p) => ({
      to: p.email!,
      ...renderOpenSlot({
        kind: "platz-frei",
        to: p.email!,
        playerName: playerLabel(p),
        session,
        token: p.token,
        baseUrl: opts.baseUrl,
      }),
    }));
    const results = await sendEmailBatch(emails, { from, replyTo: process.env.REPLY_TO });

    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error(`Platz-frei-Mail: ${failed.length} fehlgeschlagen, z.B.:`, failed[0].error);
    }

    // Logged so the 06:00 cron doesn't mail the same person again. Without RESEND_API_KEY there is no id, so nothing is logged.
    const sent = rows.flatMap((p, i) => (results[i]?.id && !results[i].error ? [{ p, id: results[i].id! }] : []));
    for (const { p, id } of sent) {
      await db
        .insert(reminderLog)
        .values({ sessionId: session.id, playerId: p.id, kind: "morgen", providerMessageId: id })
        .onConflictDoNothing();
    }
  } catch (err) {
    console.error("Platz-frei-Benachrichtigung fehlgeschlagen:", err);
  }
}
