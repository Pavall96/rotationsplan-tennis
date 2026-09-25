import { getDb } from "@/db";
import { availability } from "@/db/schema";
import { canBeAsked, type PlayerRoster } from "@/lib/eligibility";
import { formatDateForFile } from "@/lib/format";
import type { MatchView } from "@/lib/matches";

export type AvailabilityStatus = "ja" | "vielleicht" | "nein";
export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  ja: "Kann",
  vielleicht: "Vielleicht",
  nein: "Kann nicht",
};

export type PollDay = { date: string; matches: MatchView[] };

/** Answers keyed "playerId|YYYY-MM-DD". */
export async function getAvailability(): Promise<Map<string, AvailabilityStatus>> {
  const rows = await getDb()
    .select({ playerId: availability.playerId, matchDate: availability.matchDate, status: availability.status })
    .from(availability);
  return new Map(rows.map((r) => [availabilityKey(r.playerId, r.matchDate), r.status as AvailabilityStatus]));
}

export function availabilityKey(playerId: number, date: string): string {
  return `${playerId}|${date}`;
}

/** Upcoming Spieltage the player is asked about, each with the matches they could play that day. */
export function pollDaysForPlayer(roster: PlayerRoster, allMatches: MatchView[], today = formatDateForFile(new Date())): PollDay[] {
  const days = new Map<string, MatchView[]>();
  for (const m of allMatches) {
    if (m.matchDate < today || !canBeAsked(roster, m.team)) continue;
    if (!days.has(m.matchDate)) days.set(m.matchDate, []);
    days.get(m.matchDate)!.push(m);
  }
  return [...days].map(([date, matches]) => ({ date, matches }));
}

/** Per rostered player, the upcoming Spieltage they haven't answered yet (players with nothing open are left out). */
export function openDaysByPlayer(
  rosters: Map<number, PlayerRoster>,
  allMatches: MatchView[],
  answers: Map<string, AvailabilityStatus>,
): Map<number, PollDay[]> {
  const open = new Map<number, PollDay[]>();
  for (const [playerId, roster] of rosters) {
    const days = pollDaysForPlayer(roster, allMatches).filter((d) => !answers.has(availabilityKey(playerId, d.date)));
    if (days.length > 0) open.set(playerId, days);
  }
  return open;
}
