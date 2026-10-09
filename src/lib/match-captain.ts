import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { matches, players } from "@/db/schema";
import { playerLabel } from "@/lib/format";
import type { LineupEntry } from "@/lib/lineups";

export type MatchCaptain = { playerId: number; name: string };

/** Spieltags-Mannschaftsführer keyed by match id — only for matches where one is set. */
export async function getMatchCaptains(): Promise<Map<number, MatchCaptain>> {
  const rows = await getDb()
    .select({
      matchId: matches.id,
      playerId: players.id,
      displayName: players.displayName,
      nickname: players.nickname,
    })
    .from(matches)
    .innerJoin(players, eq(matches.matchCaptainPlayerId, players.id));
  return new Map(rows.map((r) => [r.matchId, { playerId: r.playerId, name: playerLabel(r) }]));
}

/**
 * The Spieltags-Mannschaftsführer as far as `entries` show: only someone who is in that lineup and hasn't cancelled.
 * Pass the published entries for anything players see.
 */
export function activeMatchCaptain(
  captain: MatchCaptain | null | undefined,
  entries: Pick<LineupEntry, "playerId" | "response">[],
): MatchCaptain | null {
  if (!captain) return null;
  const entry = entries.find((e) => e.playerId === captain.playerId);
  return entry && entry.response !== "nein" ? captain : null;
}
