import { getDb } from "@/db";
import { players, reminderLog } from "@/db/schema";
import { getFullSchedule } from "@/lib/queries";
import { sendReminderBatch, type OpenSlotEmailInput, type ReminderEmailInput } from "@/lib/email";
import { openSlotRecipients } from "@/lib/einspringen";
import { openSlots } from "@/lib/vacancy";
import { formatDateForFile, playerLabel } from "@/lib/format";

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
  const toSend: { input: ReminderEmailInput | OpenSlotEmailInput; sessionId: number; playerId: number }[] = [];
  const dryRunList: { to: string; subject: string }[] = [];

  // One email per session and player: reminders for everyone on the session, then — while a cancelled place is
  // still free — a "Platz frei" email to every rotation player who is free tonight. reminder_log covers both.
  const queue = (
    session: (typeof todaysSessions)[number],
    playerId: number,
    makeInput: (player: (typeof allPlayers)[number]) => ReminderEmailInput | OpenSlotEmailInput,
    label: string,
  ) => {
    const key = `${session.id}:${playerId}`;
    if (alreadySent.has(key)) {
      skippedAlreadySent++;
      return;
    }
    const player = playerById.get(playerId);
    if (!player?.email) {
      skippedNoEmail++;
      return;
    }
    if (opts.dryRun) {
      dryRunList.push({ to: player.email, subject: `(${label}) ${session.hallName} ${today}` });
    } else {
      toSend.push({ input: makeInput(player), sessionId: session.id, playerId });
    }
  };

  const now = new Date();
  for (const session of todaysSessions) {
    const recipients = [
      ...session.starters.map((a) => ({ playerId: a.playerId, role: "starter" as const })),
      ...session.einspringer.map((a) => ({ playerId: a.playerId, role: "starter" as const })),
      ...(session.ersatz ? [{ playerId: session.ersatz.playerId, role: "ersatz" as const }] : []),
      ...(session.trainer ? [{ playerId: session.trainer.playerId, role: "trainer" as const }] : []),
    ];
    for (const r of recipients) {
      queue(
        session,
        r.playerId,
        (player) => ({
          to: player.email!,
          playerName: playerLabel(player),
          role: r.role,
          session,
          token: player.token,
          baseUrl: opts.baseUrl,
        }),
        r.role,
      );
    }

    if (openSlots(session) === 0) continue;
    for (const playerId of openSlotRecipients(schedule, session, now)) {
      queue(
        session,
        playerId,
        (player) => ({
          kind: "platz-frei",
          to: player.email!,
          playerName: playerLabel(player),
          session,
          token: player.token,
          baseUrl: opts.baseUrl,
        }),
        "platz-frei",
      );
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
