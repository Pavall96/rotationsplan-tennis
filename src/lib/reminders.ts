import { getDb } from "@/db";
import { players, reminderLog } from "@/db/schema";
import { getFullSchedule } from "@/lib/queries";
import { sendReminderBatch, type ReminderEmailInput } from "@/lib/email";
import { formatDateForFile } from "@/lib/format";

export type ReminderRunResult =
  | { date: string; sessions: number; sent: number; skippedNoEmail: number; skippedAlreadySent: number }
  | {
      date: string;
      sessions: number;
      wouldSend: { to: string; subject: string }[];
      skippedNoEmail: number;
      skippedAlreadySent: number;
    };

export async function runReminders(opts: { dryRun: boolean; baseUrl: string }): Promise<ReminderRunResult> {
  const today = formatDateForFile(new Date());
  const schedule = await getFullSchedule();
  const todaysSessions = schedule.filter((s) => formatDateForFile(s.startsAt) === today);

  if (todaysSessions.length === 0) {
    return { date: today, sessions: 0, sent: 0, skippedNoEmail: 0, skippedAlreadySent: 0 };
  }

  const db = getDb();
  const allPlayers = await db.select().from(players);
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));

  const existingLogs = await db.select().from(reminderLog);
  const alreadySent = new Set(existingLogs.map((r) => `${r.sessionId}:${r.playerId}`));

  const from = process.env.MAIL_FROM;
  const replyTo = process.env.REPLY_TO;
  if (!opts.dryRun && !from) {
    throw new Error("MAIL_FROM ist nicht gesetzt.");
  }

  let skippedNoEmail = 0;
  let skippedAlreadySent = 0;
  const toSend: { input: ReminderEmailInput; sessionId: number; playerId: number }[] = [];
  const dryRunList: { to: string; subject: string }[] = [];

  for (const session of todaysSessions) {
    const recipients = [
      ...session.starters.map((a) => ({ playerId: a.playerId, role: "starter" as const })),
      ...(session.ersatz ? [{ playerId: session.ersatz.playerId, role: "ersatz" as const }] : []),
    ];

    for (const r of recipients) {
      const key = `${session.id}:${r.playerId}`;
      if (alreadySent.has(key)) {
        skippedAlreadySent++;
        continue;
      }
      const player = playerById.get(r.playerId);
      if (!player?.email) {
        skippedNoEmail++;
        continue;
      }
      const input: ReminderEmailInput = {
        to: player.email,
        playerName: player.displayName,
        role: r.role,
        session,
        token: player.token,
        baseUrl: opts.baseUrl,
      };
      if (opts.dryRun) {
        dryRunList.push({ to: player.email, subject: `(${r.role}) ${session.hallName} ${today}` });
      } else {
        toSend.push({ input, sessionId: session.id, playerId: r.playerId });
      }
    }
  }

  if (opts.dryRun) {
    return { date: today, sessions: todaysSessions.length, wouldSend: dryRunList, skippedNoEmail, skippedAlreadySent };
  }

  const results = await sendReminderBatch(
    toSend.map((t) => t.input),
    { from: from!, replyTo },
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
        providerMessageId: result?.id ?? null,
      })
      .onConflictDoNothing();
    sent++;
  }

  return { date: today, sessions: todaysSessions.length, sent, skippedNoEmail, skippedAlreadySent };
}
