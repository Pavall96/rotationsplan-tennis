// Vormerkungen: a Mannschaftsführer's "I'd like this player" for one match, and what follows from them. Captain pages
// only — players never see marks. The pure functions take everything as arguments so the rules can be tested.

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lineupMarks, players } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { MatchView, TeamView } from "@/lib/matches";
import type { LineupEntry } from "@/lib/lineups";
import { lineupCheck, type LineupCheck, type LineupContext, type PlayerRoster, type TeamRef } from "@/lib/eligibility";

export type Mark = { playerId: number; name: string; playsMatches: boolean };

/** Marks keyed by match id, oldest first. Only for Mannschaftsführer pages and actions. */
export async function getMarks(): Promise<Map<number, Mark[]>> {
  const rows = await getDb()
    .select({
      matchId: lineupMarks.matchId,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
      playsMatches: players.playsMatches,
    })
    .from(lineupMarks)
    .innerJoin(players, eq(lineupMarks.playerId, players.id))
    .orderBy(asc(lineupMarks.createdAt));

  const byMatch = new Map<number, Mark[]>();
  for (const r of rows) {
    if (!byMatch.has(r.matchId)) byMatch.set(r.matchId, []);
    byMatch.get(r.matchId)!.push({ playerId: r.playerId, name: playerLabel(r), playsMatches: r.playsMatches });
  }
  return byMatch;
}

export type CaptainRef = Pick<TeamView, "id" | "captainName" | "captainPlayerId">;

export type Claim = {
  match: MatchView;
  kind: "aufgestellt" | "vorgemerkt";
  captainName: string | null;
  captainPlayerId: number | null;
};

/** Other matches on the same day that have this player lined up (Stamm or Ersatz) or marked. */
export function sameDayClaims(
  playerId: number,
  match: MatchView,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
  marksByMatch: Map<number, Mark[]>,
  teams: readonly CaptainRef[],
): Claim[] {
  const claims: Claim[] = [];
  for (const m of allMatches) {
    if (m.id === match.id || m.matchDate !== match.matchDate) continue;
    const linedUp = (lineupsByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId);
    const marked = (marksByMatch.get(m.id) ?? []).some((e) => e.playerId === playerId && e.playsMatches);
    if (!linedUp && !marked) continue;
    const team = teams.find((t) => t.id === m.team.id);
    claims.push({
      match: m,
      kind: linedUp ? "aufgestellt" : "vorgemerkt",
      captainName: team?.captainName ?? null,
      captainPlayerId: team?.captainPlayerId ?? null,
    });
  }
  return claims;
}

export type Appearance = { teamName: string; count: number };

/** Stammplätze over the whole season per team, played or planned; Ersatz and Absagen don't count. Herren first. */
export function appearances(
  playerId: number,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
): Appearance[] {
  const byTeam = new Map<number, { team: MatchView["team"]; count: number }>();
  for (const m of allMatches) {
    const plays = (lineupsByMatch.get(m.id) ?? []).some(
      (e) => e.playerId === playerId && e.role === "stamm" && e.response !== "nein",
    );
    if (!plays) continue;
    const current = byTeam.get(m.team.id) ?? { team: m.team, count: 0 };
    current.count++;
    byTeam.set(m.team.id, current);
  }
  return [...byTeam.values()]
    .sort(
      (a, b) =>
        (a.team.ageClass === "herren" ? 0 : 1) - (b.team.ageClass === "herren" ? 0 : 1) || a.team.rank - b.team.rank,
    )
    .map(({ team, count }) => ({ teamName: team.name, count }));
}

/** Whether a player may be marked: like lining up, except that playing for another team that day is fine. */
export function canMark(roster: PlayerRoster, team: TeamRef, ctx: LineupContext): LineupCheck {
  return lineupCheck(roster, team, { ...ctx, sameDayTeam: null });
}

/** Teams that claim, on the same day, a player this match has lined up or marked. */
export function conflictTeams(
  match: MatchView,
  allMatches: MatchView[],
  lineupsByMatch: Map<number, LineupEntry[]>,
  marksByMatch: Map<number, Mark[]>,
): string[] {
  const here = [
    ...(lineupsByMatch.get(match.id) ?? []).map((e) => e.playerId),
    ...(marksByMatch.get(match.id) ?? []).filter((m) => m.playsMatches).map((m) => m.playerId),
  ];
  const names = new Set<string>();
  for (const playerId of here) {
    for (const c of sameDayClaims(playerId, match, allMatches, lineupsByMatch, marksByMatch, [])) {
      names.add(c.match.team.name);
    }
  }
  return [...names];
}
