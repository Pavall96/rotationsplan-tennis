import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { lineups, players } from "@/db/schema";
import { getAllMatches, type MatchView } from "@/lib/matches";
import { getLineups, type LineupEntry } from "@/lib/lineups";
import { getRidesByMatch, type MatchRides } from "@/lib/rides";
import { sendNotice } from "@/lib/email";
import { formatDateForFile, formatTime, playerLabel } from "@/lib/format";

export type MatchReminderResult = {
  matches: number;
  sent: number;
  wouldSend?: { to: string; subject: string }[];
  skippedNoEmail: number;
};

/** The carpool line for one player: their own ride, the ride they're in, or a nudge. */
export function carpoolLine(playerId: number, rides: MatchRides | undefined): string {
  const all = rides?.rides ?? [];
  const driving = all.find((r) => r.driver.playerId === playerId);
  if (driving) {
    const with_ = driving.passengers.map((p) => p.name).join(", ");
    return `Du fährst ab ${driving.meetingPoint} um ${driving.departureTime} Uhr${with_ ? ` – mit ${with_}` : ""}.`;
  }
  const riding = all.find((r) => r.passengers.some((p) => p.playerId === playerId));
  if (riding) {
    return `Du fährst bei ${riding.driver.name} mit – ab ${riding.meetingPoint} um ${riding.departureTime} Uhr.`;
  }
  return "Noch keine Mitfahrt? Schau in die Fahrgemeinschaft.";
}

function subjectFor(match: MatchView): string {
  return `Heute: ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent} um ${formatTime(match.startsAt)} Uhr`;
}

/**
 * Morning email on match day to everyone in a published lineup who hasn't cancelled. Runs from the daily cron;
 * `reminded_at` makes it safe to run more than once.
 */
export async function runMatchReminders(opts: { dryRun: boolean; baseUrl: string }): Promise<MatchReminderResult> {
  const today = formatDateForFile(new Date());
  const todays = (await getAllMatches()).filter((m) => m.matchDate === today && m.lineupPublishedAt);
  if (todays.length === 0) return { matches: 0, sent: 0, skippedNoEmail: 0 };

  const db = getDb();
  const [lineupsByMatch, ridesByMatch, remindedRows] = await Promise.all([
    getLineups({ publishedOnly: true }),
    getRidesByMatch(),
    db.select({ matchId: lineups.matchId, playerId: lineups.playerId, remindedAt: lineups.remindedAt }).from(lineups),
  ]);
  const reminded = new Set(remindedRows.filter((r) => r.remindedAt).map((r) => `${r.matchId}:${r.playerId}`));

  const due: { match: MatchView; entry: LineupEntry; lineup: LineupEntry[] }[] = [];
  for (const match of todays) {
    const lineup = lineupsByMatch.get(match.id) ?? [];
    for (const entry of lineup) {
      if (entry.response === "nein" || reminded.has(`${match.id}:${entry.playerId}`)) continue;
      due.push({ match, entry, lineup });
    }
  }
  const recipients = due.length
    ? await db.select().from(players).where(inArray(players.id, due.map((d) => d.entry.playerId)))
    : [];
  const byId = new Map(recipients.map((p) => [p.id, p]));
  const withEmail = due.filter((d) => byId.get(d.entry.playerId)?.email);
  const skippedNoEmail = due.length - withEmail.length;

  if (opts.dryRun) {
    return {
      matches: todays.length,
      sent: 0,
      wouldSend: withEmail.map((d) => ({ to: byId.get(d.entry.playerId)!.email!, subject: subjectFor(d.match) })),
      skippedNoEmail,
    };
  }

  const from = process.env.MAIL_FROM;
  if (!from) throw new Error("MAIL_FROM ist nicht gesetzt.");

  let sent = 0;
  for (const { match, entry, lineup } of withEmail) {
    const p = byId.get(entry.playerId)!;
    const stamm = lineup.filter((e) => e.role === "stamm" && e.response !== "nein");
    const missing = lineup.some((e) => e.role === "stamm" && e.response === "nein");
    const venue = match.venue ? `${match.venue.name}${match.venue.address ? `, ${match.venue.address}` : ""}` : "";
    const result = await sendNotice(
      {
        to: p.email!,
        playerName: playerLabel(p),
        subject: subjectFor(match),
        line:
          entry.role === "stamm"
            ? `Heute spielst du für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}. ${carpoolLine(p.id, ridesByMatch.get(match.id))}`
            : `Heute ist Punktspiel – du bist Ersatz${missing ? " und wirst gebraucht" : ""}. ${carpoolLine(p.id, ridesByMatch.get(match.id))}`,
        detail: [`${formatTime(match.startsAt)} Uhr`, venue, `Aufstellung: ${stamm.map((e) => e.name).join(", ")}`]
          .filter(Boolean)
          .join(" · "),
        cta: { url: `${opts.baseUrl}/spieler/${p.token}/punktspiele#spiel-${match.id}`, label: "Route & Fahrgemeinschaft" },
        token: p.token,
        baseUrl: opts.baseUrl,
      },
      { from, replyTo: process.env.REPLY_TO },
    );
    if (result.error) {
      console.error(`Spieltags-Erinnerung an ${p.email} fehlgeschlagen: ${result.error}`);
      continue;
    }
    await db
      .update(lineups)
      .set({ remindedAt: new Date() })
      .where(and(eq(lineups.matchId, match.id), eq(lineups.playerId, p.id)));
    sent++;
    await new Promise((r) => setTimeout(r, 600));
  }
  return { matches: todays.length, sent, skippedNoEmail };
}
