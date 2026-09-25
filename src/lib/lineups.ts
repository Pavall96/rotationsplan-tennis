import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { players, lineups } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { AgeClass, MatchView } from "@/lib/matches";
import type { LineupContext } from "@/lib/eligibility";

export type LineupRole = "stamm" | "ersatz";

export type LineupEntry = {
  playerId: number;
  name: string;
  role: LineupRole;
  notified: boolean;
  hasEmail: boolean;
};

/** Every lineup, keyed by match id. */
export async function getLineups(): Promise<Map<number, LineupEntry[]>> {
  const rows = await getDb()
    .select({
      matchId: lineups.matchId,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
      email: players.email,
      role: lineups.role,
      notifiedAt: lineups.notifiedAt,
    })
    .from(lineups)
    .innerJoin(players, eq(lineups.playerId, players.id))
    .orderBy(asc(lineups.createdAt));

  const byMatch = new Map<number, LineupEntry[]>();
  for (const r of rows) {
    if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, []);
    byMatch.get(r.matchId)!.push({
      playerId: r.playerId,
      name: playerLabel(r),
      role: r.role as LineupRole,
      notified: Boolean(r.notifiedAt),
      hasEmail: Boolean(r.email),
    });
  }
  return byMatch;
}

/**
 * The facts `lineupCheck` needs about one player for one match: Festspiel count (first-team matches of the same age
 * class on earlier dates) and whether they're already lined up elsewhere that day (WSPO § 33a Ziff. 2).
 */
export function lineupContext(
  playerId: number,
  playsMatches: boolean,
  match: MatchView,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
): LineupContext {
  const inLineup = (m: MatchView, role?: LineupRole) =>
    (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId && (!role || e.role === role));

  const firstTeamAppearances = allMatches.filter(
    (m) =>
      m.team.ageClass === match.team.ageClass &&
      m.team.rank === 1 &&
      m.matchDate < match.matchDate &&
      inLineup(m, "stamm"),
  ).length;

  const sameDay = allMatches.find((m) => m.id !== match.id && m.matchDate === match.matchDate && inLineup(m));
  return { playsMatches, firstTeamAppearances, sameDayTeam: sameDay?.team.name ?? null };
}

/** Meldeliste position within the match's age class — the order singles must be played in (§ 33b Ziff. 1). */
export function singlesOrder<T extends { position: number | null }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
}

export function positionIn(ageClass: AgeClass, roster: Partial<Record<AgeClass, { position: number }>>): number | null {
  return roster[ageClass]?.position ?? null;
}
