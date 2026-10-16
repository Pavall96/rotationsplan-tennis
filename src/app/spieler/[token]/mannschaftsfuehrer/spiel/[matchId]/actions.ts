"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { lineups, matches, players, teams } from "@/db/schema";
import { getAllMatches, type MatchView } from "@/lib/matches";
import { getLineups, lineupContext, type LineupRole } from "@/lib/lineups";
import { getPlayerRoster, getRoster, rosterByPlayer } from "@/lib/roster";
import { lineupCheck, isNonGerman, tooManyNonGermans } from "@/lib/eligibility";
import { canMark, markStatement, unmarkStatement } from "@/lib/marks";
import { getMatchCaptains } from "@/lib/match-captain";
import { getBaseUrl } from "@/lib/base-url";
import { sendNotice } from "@/lib/email";
import { formatDayShort, formatTime, playerLabel } from "@/lib/format";

type Result = { error?: string } | void;

/** The match, if the token belongs to that team's Mannschaftsführer and the match is still ahead. */
async function captainMatch(token: string, matchId: number): Promise<{ match: MatchView; all: MatchView[] } | null> {
  const [captain] = await getDb()
    .select({ teamId: teams.id })
    .from(players)
    .innerJoin(teams, eq(teams.captainPlayerId, players.id))
    .innerJoin(matches, eq(matches.teamId, teams.id))
    .where(and(eq(players.token, token), eq(matches.id, matchId), sql`${matches.startsAt} > now()`))
    .limit(1);
  if (!captain) return null;
  const all = await getAllMatches();
  const match = all.find((m) => m.id === matchId);
  return match ? { match, all } : null;
}

function refresh() {
  revalidatePath("/spieler/[token]/mannschaftsfuehrer/spiel/[matchId]", "page");
  revalidatePath("/spieler/[token]/mannschaftsfuehrer", "page");
  revalidatePath("/spieler/[token]/punktspiele", "page");
  revalidatePath("/spieler/[token]", "page");
}

function describe(match: MatchView): string {
  const venue = match.venue ? ` · ${match.venue.name}${match.venue.address ? `, ${match.venue.address}` : ""}` : "";
  return `${formatDayShort(match.startsAt)} · ${formatTime(match.startsAt)} Uhr${venue}`;
}

export async function addToLineup(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));
  const role = String(formData.get("role")) as LineupRole;
  if (role !== "stamm" && role !== "ersatz") return { error: "Ungültige Rolle." };

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann aufstellen." };
  const { match, all } = ctx;

  const db = getDb();
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) return { error: "Spieler nicht gefunden." };

  const [roster, lineupsByMatch] = await Promise.all([getPlayerRoster(playerId), getLineups()]);
  const check = lineupCheck(roster, match.team, lineupContext(playerId, player.playsMatches, match, all, lineupsByMatch));
  if (!check.ok) return { error: `${playerLabel(player)}: ${check.reason}` };

  const current = lineupsByMatch.get(matchId) ?? [];
  const otherStamm = current.filter((e) => e.role === "stamm" && e.playerId !== playerId);
  const stamm = otherStamm.length;
  if (role === "stamm" && isNonGerman(roster)) {
    // WSPO § 33a Ziff. 1: at most one non-German per match.
    const rosters = rosterByPlayer(await getRoster());
    if (otherStamm.some((e) => isNonGerman(rosters.get(e.playerId) ?? {}))) {
      return { error: `${playerLabel(player)}: Es steht schon ein Nicht-Deutscher auf – höchstens einer pro Spiel.` };
    }
  }
  if (role === "stamm" && stamm >= match.playersNeeded) {
    return { error: `Es stehen schon ${match.playersNeeded} Spieler auf – erst jemanden entfernen oder als Ersatz eintragen.` };
  }

  // A role change (e.g. Ersatz moves up) means the player must be told again on the next publish.
  const previousRole = current.find((e) => e.playerId === playerId)?.role;
  // One transaction: lining up replaces this team's own mark (other teams' marks for the day stay, so the conflict
  // stays visible) — never a lineup entry without the mark going, or the other way round.
  await db.batch([
    db
      .insert(lineups)
      .values({ matchId, playerId, role })
      .onConflictDoUpdate({
        target: [lineups.matchId, lineups.playerId],
        // A new role is a change the players only see (and the player is only told about) on the next publish.
        set: previousRole && previousRole !== role ? { role, publishedAt: null, notifiedAt: null } : { role },
      }),
    unmarkStatement(matchId, playerId),
  ]);
  refresh();
}

export async function removeFromLineup(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann aufstellen." };
  const { match } = ctx;

  const [removed] = await getDb()
    .delete(lineups)
    .where(and(eq(lineups.matchId, matchId), eq(lineups.playerId, playerId)))
    .returning();

  // Out of the lineup means no longer Spieltags-Mannschaftsführer — the role falls back to the team's captain.
  await getDb()
    .update(matches)
    .set({ matchCaptainPlayerId: null })
    .where(and(eq(matches.id, matchId), eq(matches.matchCaptainPlayerId, playerId)));

  // Someone who was already told they play should hear that they don't anymore — unless they cancelled themselves.
  if (removed?.notifiedAt && removed.response !== "nein") {
    const baseUrl = await getBaseUrl();
    const from = process.env.MAIL_FROM;
    after(async () => {
      const [p] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
      if (!p?.email || !from) return;
      const result = await sendNotice(
        {
          to: p.email,
          playerName: playerLabel(p),
          subject: `Aufstellung geändert: ${match.team.name} am ${formatDayShort(match.startsAt)}`,
          line: `Du bist für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent} doch nicht mehr aufgestellt.`,
          detail: describe(match),
          cta: { url: `${baseUrl}/spieler/${p.token}/punktspiele#spiel-${match.id}`, label: "Winterspiele ansehen" },
          token: p.token,
          baseUrl,
        },
        { from, replyTo: process.env.REPLY_TO },
      );
      if (result.error) console.error(`Aufstellungs-Mail an ${p.email} fehlgeschlagen: ${result.error}`);
    });
  }
  refresh();
}

export async function markPlayer(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann vormerken." };
  const { match, all } = ctx;

  const [player] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) return { error: "Spieler nicht gefunden." };

  const [roster, lineupsByMatch] = await Promise.all([getPlayerRoster(playerId), getLineups()]);
  if ((lineupsByMatch.get(matchId) ?? []).some((e) => e.playerId === playerId)) {
    return { error: `${playerLabel(player)} steht schon in der Aufstellung.` };
  }
  const check = canMark(roster, match.team, lineupContext(playerId, player.playsMatches, match, all, lineupsByMatch));
  if (!check.ok) return { error: `${playerLabel(player)}: ${check.reason}` };

  await markStatement(matchId, playerId);
  refresh();
}

/** Marks a simulated lineup in one go. Players who can't be marked (anymore) are skipped and named. */
export async function markProposal(
  token: string,
  matchId: number,
  playerIds: number[],
): Promise<{ marked: number; skipped: string[] } | { error: string }> {
  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann vormerken." };
  const { match, all } = ctx;

  const [lineupsByMatch, rows] = await Promise.all([
    getLineups(),
    playerIds.length ? getDb().select().from(players).where(inArray(players.id, playerIds)) : [],
  ]);
  const skipped: string[] = [];
  let marked = 0;
  for (const player of rows) {
    if ((lineupsByMatch.get(matchId) ?? []).some((e) => e.playerId === player.id)) continue;
    const roster = await getPlayerRoster(player.id);
    const check = canMark(roster, match.team, lineupContext(player.id, player.playsMatches, match, all, lineupsByMatch));
    if (!check.ok) {
      skipped.push(`${playerLabel(player)}: ${check.reason}`);
      continue;
    }
    await markStatement(matchId, player.id);
    marked++;
  }
  refresh();
  return { marked, skipped };
}

export async function unmarkPlayer(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const playerId = Number(formData.get("playerId"));

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann Vormerkungen entfernen." };

  await unmarkStatement(matchId, playerId);
  refresh();
}

/**
 * Sets the Spieltags-Mannschaftsführer (a lined-up player who stands in for the team's Mannschaftsführer), or clears
 * it with an empty playerId. They only see more and hear about Absagen — lining up stays with the team's captain.
 */
export async function setMatchCaptain(formData: FormData): Promise<Result> {
  const token = String(formData.get("token") ?? "");
  const matchId = Number(formData.get("matchId"));
  const raw = String(formData.get("playerId") ?? "");
  const playerId = raw ? Number(raw) : null;

  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann das ändern." };
  const { match } = ctx;

  const db = getDb();
  if (playerId === null) {
    await db.update(matches).set({ matchCaptainPlayerId: null }).where(eq(matches.id, matchId));
    refresh();
    return;
  }

  const entry = ((await getLineups()).get(matchId) ?? []).find((e) => e.playerId === playerId);
  if (!entry) return { error: "Nur wer für dieses Spiel aufgestellt ist, kann Mannschaftsführer am Spieltag sein." };
  if (entry.response === "nein") return { error: `${entry.name} hat für dieses Spiel abgesagt.` };

  // Only an actual change returns a row, so saving the same choice twice doesn't email twice.
  const changed = await db
    .update(matches)
    .set({ matchCaptainPlayerId: playerId })
    .where(and(eq(matches.id, matchId), sql`${matches.matchCaptainPlayerId} is distinct from ${playerId}`))
    .returning({ id: matches.id });
  refresh();

  // Told right away only if they already know they play; otherwise the publish email says it.
  if (changed.length > 0 && entry.published) {
    const baseUrl = await getBaseUrl();
    const from = process.env.MAIL_FROM;
    after(async () => {
      const [p] = await getDb().select().from(players).where(eq(players.id, playerId)).limit(1);
      if (!p?.email || !from) return;
      const result = await sendNotice(
        {
          to: p.email,
          playerName: playerLabel(p),
          subject: `Du bist Mannschaftsführer: ${match.team.name} am ${formatDayShort(match.startsAt)}`,
          line: `Du bist am Spieltag Mannschaftsführer für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}. Die Meldeliste findest du in der App.`,
          detail: describe(match),
          cta: { url: `${baseUrl}/spieler/${p.token}/punktspiele/meldeliste/${match.id}`, label: "Meldeliste öffnen" },
          token: p.token,
          baseUrl,
        },
        { from, replyTo: process.env.REPLY_TO },
      );
      if (result.error) console.error(`Mannschaftsführer-Mail an ${p.email} fehlgeschlagen: ${result.error}`);
    });
  }
}

export type PublishPreview = {
  stammCount: number;
  playersNeeded: number;
  withEmail: string[];
  withoutEmail: string[];
  sent: boolean;
};

/**
 * Publishes the lineup: players see it on their page, and everyone in it who hasn't been told yet gets an email.
 * Without `send` it only returns who would be emailed.
 */
export async function publishLineup(token: string, matchId: number, send: boolean): Promise<PublishPreview | { error: string }> {
  const ctx = await captainMatch(token, matchId);
  if (!ctx) return { error: "Nur der Mannschaftsführer dieses Teams kann veröffentlichen." };
  const { match } = ctx;

  const [lineupsByMatch, roster] = await Promise.all([getLineups(), getRoster()]);
  const entries = lineupsByMatch.get(matchId) ?? [];
  if (entries.length === 0) return { error: "Noch niemand aufgestellt." };
  const rosters = rosterByPlayer(roster);
  const starters = entries.filter((e) => e.role === "stamm" && e.response !== "nein");
  if (starters.length > match.playersNeeded) {
    return { error: `${starters.length} Stammspieler aufgestellt – höchstens ${match.playersNeeded}.` };
  }
  if (tooManyNonGermans(starters.map((e) => ({ countsAsGerman: !isNonGerman(rosters.get(e.playerId) ?? {}) })))) {
    return { error: "Mehr als ein Nicht-Deutscher aufgestellt – so darf die Aufstellung nicht raus." };
  }
  const pending = entries.filter((e) => !e.published);
  const preview: PublishPreview = {
    stammCount: entries.filter((e) => e.role === "stamm").length,
    playersNeeded: match.playersNeeded,
    withEmail: pending.filter((e) => e.hasEmail).map((e) => e.name),
    withoutEmail: pending.filter((e) => !e.hasEmail).map((e) => e.name),
    sent: false,
  };
  if (!send) return preview;

  const from = process.env.MAIL_FROM;
  if (preview.withEmail.length > 0 && !from) return { error: "MAIL_FROM fehlt – es wurde nichts veröffentlicht." };

  const db = getDb();
  await db.update(matches).set({ lineupPublishedAt: new Date() }).where(and(eq(matches.id, matchId), isNull(matches.lineupPublishedAt)));
  // Claim the unpublished entries in one conditional update: of two simultaneous publishes, only one gets each
  // player back — and only those get an email.
  const claimed = await db
    .update(lineups)
    .set({ publishedAt: new Date() })
    .where(and(eq(lineups.matchId, matchId), isNull(lineups.publishedAt)))
    .returning({ playerId: lineups.playerId });
  const withEmail = new Set(pending.filter((e) => e.hasEmail).map((e) => e.playerId));
  const toNotify = claimed.map((r) => r.playerId).filter((id) => withEmail.has(id));
  if (toNotify.length > 0) {
    await db
      .update(lineups)
      .set({ notifiedAt: new Date() })
      .where(and(eq(lineups.matchId, matchId), inArray(lineups.playerId, toNotify)));
  }
  refresh();
  const baseUrl = await getBaseUrl();
  const stammNames = entries.filter((e) => e.role === "stamm").map((e) => e.name);
  const matchCaptainId = (await getMatchCaptains()).get(matchId)?.playerId ?? null;

  after(async () => {
    const recipients = toNotify.length ? await db.select().from(players).where(inArray(players.id, toNotify)) : [];
    for (const p of recipients) {
      const entry = entries.find((e) => e.playerId === p.id)!;
      const others = stammNames.filter((n) => n !== entry.name);
      try {
        const result = await sendNotice(
          {
            to: p.email!,
            playerName: playerLabel(p),
            subject: `Aufstellung ${match.team.name}: ${formatDayShort(match.startsAt)} ${match.isHome ? "gegen" : "bei"} ${match.opponent}`,
            line:
              (entry.role === "stamm"
                ? `Du bist aufgestellt für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent}.`
                : `Du bist Ersatz für ${match.team.name} ${match.isHome ? "gegen" : "bei"} ${match.opponent} – bitte halt dir den Termin frei.`) +
              (p.id === matchCaptainId ? " Du bist an dem Tag auch Mannschaftsführer – die Meldeliste findest du in der App." : ""),
            detail: `${describe(match)}${others.length ? ` · Mit: ${others.join(", ")}` : ""}`,
            cta: {
              url: `${baseUrl}/spieler/${p.token}/punktspiele#spiel-${match.id}`,
              label: "Route & Fahrgemeinschaft",
            },
            token: p.token,
            baseUrl,
          },
          { from: from!, replyTo: process.env.REPLY_TO },
        );
        if (result.error) console.error(`Aufstellungs-Mail an ${p.email} fehlgeschlagen: ${result.error}`);
      } catch (err) {
        console.error(`Aufstellungs-Mail an ${p.email} fehlgeschlagen:`, err);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  });
  return { ...preview, sent: true };
}
