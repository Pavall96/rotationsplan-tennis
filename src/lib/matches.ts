import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { teams, venues, matches, players } from "@/db/schema";
import { playerLabel } from "@/lib/format";

export type AgeClass = "herren" | "h30";

export type MatchView = {
  id: number;
  matchDate: string;
  startsAt: Date;
  isHome: boolean;
  opponent: string;
  playersNeeded: number;
  team: { id: number; slug: string; name: string; ageClass: AgeClass; rank: number };
  venue: { name: string; address: string | null; notes: string | null } | null;
};

export type TeamView = {
  id: number;
  slug: string;
  name: string;
  ageClass: AgeClass;
  rank: number;
  league: string | null;
  captainPlayerId: number | null;
  captainName: string | null;
};

/** Every team match of the season, oldest first (dataset is tiny: ~18 matches). */
export async function getAllMatches(): Promise<MatchView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: matches.id,
      matchDate: matches.matchDate,
      startsAt: matches.startsAt,
      isHome: matches.isHome,
      opponent: matches.opponent,
      playersNeeded: matches.playersNeeded,
      teamId: teams.id,
      teamSlug: teams.slug,
      teamName: teams.name,
      ageClass: teams.ageClass,
      rank: teams.rank,
      venueName: venues.name,
      venueAddress: venues.address,
      venueNotes: venues.notes,
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .leftJoin(venues, eq(matches.venueId, venues.id))
    .orderBy(asc(matches.startsAt), desc(teams.ageClass), asc(teams.rank));

  return rows.map((r) => ({
    id: r.id,
    matchDate: r.matchDate,
    startsAt: r.startsAt,
    isHome: r.isHome,
    opponent: r.opponent,
    playersNeeded: r.playersNeeded,
    team: { id: r.teamId, slug: r.teamSlug, name: r.teamName, ageClass: r.ageClass as AgeClass, rank: r.rank },
    venue: r.venueName ? { name: r.venueName, address: r.venueAddress, notes: r.venueNotes } : null,
  }));
}

export async function getTeams(): Promise<TeamView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: teams.id,
      slug: teams.slug,
      name: teams.name,
      ageClass: teams.ageClass,
      rank: teams.rank,
      league: teams.league,
      captainPlayerId: teams.captainPlayerId,
      captainDisplayName: players.displayName,
      captainNickname: players.nickname,
    })
    .from(teams)
    .leftJoin(players, eq(teams.captainPlayerId, players.id))
    .orderBy(desc(teams.ageClass), asc(teams.rank));

  return rows.map(({ captainDisplayName, captainNickname, ...t }) => ({
    ...t,
    ageClass: t.ageClass as AgeClass,
    captainName: captainDisplayName ? playerLabel({ displayName: captainDisplayName, nickname: captainNickname }) : null,
  }));
}

/** Matches grouped by calendar day, in date order. */
export function groupByDay(all: MatchView[]): { date: string; matches: MatchView[] }[] {
  const days = new Map<string, MatchView[]>();
  for (const m of all) {
    if (!days.has(m.matchDate)) days.set(m.matchDate, []);
    days.get(m.matchDate)!.push(m);
  }
  return [...days].map(([date, ms]) => ({ date, matches: ms }));
}
