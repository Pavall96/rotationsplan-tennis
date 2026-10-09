import { eq, asc } from "drizzle-orm";
import { getDb } from "@/db";
import { players, rosterEntries } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { AgeClass } from "@/lib/matches";
import type { PlayerRoster } from "@/lib/eligibility";

export type RosterRow = {
  ageClass: AgeClass;
  position: number;
  lk: string | null;
  countsAsGerman: boolean;
  nationality: string | null;
  playerId: number;
  wtbId: string | null;
  name: string;
  registered: boolean;
  playsMatches: boolean;
};

/** Both Meldelisten, each in list order. */
export async function getRoster(): Promise<RosterRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      ageClass: rosterEntries.ageClass,
      position: rosterEntries.position,
      lk: rosterEntries.lk,
      countsAsGerman: rosterEntries.countsAsGerman,
      nationality: rosterEntries.nationality,
      playerId: players.id,
      wtbId: players.wtbId,
      displayName: players.displayName,
      nickname: players.nickname,
      email: players.email,
      playsMatches: players.playsMatches,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(rosterEntries.playerId, players.id))
    .orderBy(asc(rosterEntries.ageClass), asc(rosterEntries.position));

  return rows.map((r) => ({
    ageClass: r.ageClass as AgeClass,
    position: r.position,
    lk: r.lk,
    countsAsGerman: r.countsAsGerman,
    nationality: r.nationality,
    playerId: r.playerId,
    wtbId: r.wtbId,
    name: playerLabel(r),
    registered: Boolean(r.email),
    playsMatches: r.playsMatches,
  }));
}

/** Only the players who actually play — the others just hold their Meldeliste position. */
export function activeRows(rows: RosterRow[]): RosterRow[] {
  return rows.filter((r) => r.playsMatches);
}

/** Per player, their entries on each list — the input `canPlay` expects. */
export function rosterByPlayer(rows: RosterRow[]): Map<number, PlayerRoster> {
  const map = new Map<number, PlayerRoster>();
  for (const r of rows) {
    const entry = map.get(r.playerId) ?? {};
    entry[r.ageClass] = { position: r.position, countsAsGerman: r.countsAsGerman };
    map.set(r.playerId, entry);
  }
  return map;
}

/** One player's Meldeliste entries (empty if they're on no list). */
export async function getPlayerRoster(playerId: number): Promise<PlayerRoster> {
  const rows = await getDb().select().from(rosterEntries).where(eq(rosterEntries.playerId, playerId));
  const roster: PlayerRoster = {};
  for (const r of rows) roster[r.ageClass as AgeClass] = { position: r.position, countsAsGerman: r.countsAsGerman };
  return roster;
}
