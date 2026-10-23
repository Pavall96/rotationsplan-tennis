import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { players, lineups } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { AgeClass, MatchView } from "@/lib/matches";
import type { LineupContext } from "@/lib/eligibility";

/** `doppel`: comes along for the doubles only — not in the singles (WSPO allows doubles players who played no single). */
export type LineupRole = "stamm" | "doppel" | "ersatz";

/** Everyone who actually plays — singles or doubles — as opposed to the Ersatz on standby. */
export function plays(role: LineupRole): boolean {
  return role === "stamm" || role === "doppel";
}

export type LineupEntry = {
  playerId: number;
  name: string;
  role: LineupRole;
  /** Visible to players (entries added after a publish stay private until the next one). */
  published: boolean;
  notified: boolean;
  hasEmail: boolean;
  response: LineupResponse | null;
};

export type LineupResponse = "ja" | "nein";

/**
 * Lineups keyed by match id. Captain views pass nothing and see every entry; everything players see (cards,
 * answers, calendar, reminders) must use `{ publishedOnly: true }`.
 */
export async function getLineups(opts: { publishedOnly?: boolean } = {}): Promise<Map<number, LineupEntry[]>> {
  const rows = await getDb()
    .select({
      matchId: lineups.matchId,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
      email: players.email,
      role: lineups.role,
      notifiedAt: lineups.notifiedAt,
      publishedAt: lineups.publishedAt,
      response: lineups.response,
    })
    .from(lineups)
    .innerJoin(players, eq(lineups.playerId, players.id))
    .orderBy(asc(lineups.createdAt));

  const byMatch = new Map<number, LineupEntry[]>();
  for (const r of rows) {
    if (opts.publishedOnly && !r.publishedAt) continue;
    if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, []);
    byMatch.get(r.matchId)!.push({
      playerId: r.playerId,
      name: playerLabel(r),
      role: r.role as LineupRole,
      published: Boolean(r.publishedAt),
      notified: Boolean(r.notifiedAt),
      hasEmail: Boolean(r.email),
      response: r.response as LineupResponse | null,
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
  const inLineup = (m: MatchView) => (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId);

  // A doubles appearance counts as an Einsatz too. A player who cancelled didn't play, so that match doesn't count.
  const playedFor = (m: MatchView) =>
    (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId && plays(e.role) && e.response !== "nein");
  const firstTeamAppearances = allMatches.filter(
    (m) =>
      m.team.ageClass === match.team.ageClass &&
      m.team.rank === 1 &&
      m.matchDate < match.matchDate &&
      playedFor(m),
  ).length;

  // Stricter than § 33a Ziff. 2 on purpose: an Ersatz must be free to step in, so they're taken for that day too.
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

export type ResponseAlerts = {
  /** What to tell the Mannschaftsführer, if anything. */
  captain: "absage" | "doch-dabei" | "springt-ein" | "ersatz-kann-nicht" | null;
  /** Ask the Ersatz players (who haven't said no) to step in. */
  askErsatz: boolean;
};

/**
 * Who hears about a player's answer to the published lineup. `lineup` is the state *after* the answer. Only real
 * changes alert anyone — re-tapping the same answer stays quiet.
 */
export function responseAlerts(
  role: LineupRole,
  previous: LineupResponse | null,
  next: LineupResponse,
  lineup: LineupEntry[],
): ResponseAlerts {
  const none: ResponseAlerts = { captain: null, askErsatz: false };
  if (previous === next) return none;
  const stammMissing = lineup.some((e) => e.role === "stamm" && e.response === "nein");

  if (role === "stamm") {
    if (next === "nein") return { captain: "absage", askErsatz: true };
    return previous === "nein" ? { captain: "doch-dabei", askErsatz: false } : none;
  }
  // A doubles-only player is missed less: the singles players can make up the doubles, so the Ersatz isn't asked.
  if (role === "doppel") {
    if (next === "nein") return { captain: "absage", askErsatz: false };
    return previous === "nein" ? { captain: "doch-dabei", askErsatz: false } : none;
  }
  if (!stammMissing) return none;
  return { captain: next === "ja" ? "springt-ein" : "ersatz-kann-nicht", askErsatz: false };
}
