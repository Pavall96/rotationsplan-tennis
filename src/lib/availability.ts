import { getDb } from "@/db";
import { availability } from "@/db/schema";
import { canBeAsked, type PlayerRoster } from "@/lib/eligibility";
import { formatDateForFile } from "@/lib/format";
import type { MatchView } from "@/lib/matches";
import { rosterByPlayer, type RosterRow } from "@/lib/roster";

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

/** Who said what for one Spieltag. "Kann nicht" is deliberately not listed by name — only the Mannschaftsführer see it. */
export type DayCrowd = { ja: string[]; vielleicht: string[]; open: number };

/** Per Spieltag: the names of those who can / maybe can, and how many asked players haven't answered yet. */
export function dayCrowd(
  allMatches: MatchView[],
  answers: Map<string, AvailabilityStatus>,
  activeRoster: RosterRow[],
  today = formatDateForFile(new Date()),
): Map<string, DayCrowd> {
  const names = new Map(activeRoster.map((r) => [r.playerId, r.name]));
  const crowd = new Map<string, DayCrowd>();
  for (const [playerId, roster] of rosterByPlayer(activeRoster)) {
    for (const day of pollDaysForPlayer(roster, allMatches, today)) {
      const entry = crowd.get(day.date) ?? { ja: [], vielleicht: [], open: 0 };
      const status = answers.get(availabilityKey(playerId, day.date));
      const name = names.get(playerId)!;
      if (status === "ja") entry.ja.push(name);
      else if (status === "vielleicht") entry.vielleicht.push(name);
      else if (!status) entry.open++;
      crowd.set(day.date, entry);
    }
  }
  for (const e of crowd.values()) {
    e.ja.sort((a, b) => a.localeCompare(b, "de"));
    e.vielleicht.sort((a, b) => a.localeCompare(b, "de"));
  }
  return crowd;
}

export type DayVotes = {
  ja: { playerId: number; name: string }[];
  vielleicht: { playerId: number; name: string }[];
  /** Counts only for the players — who can't is for the Mannschaftsführer (see `neinPlayers`). */
  nein: number;
  open: number;
  /** Names of the others, for the Mannschaftsführer and the Spieltags-Mannschaftsführer. */
  neinPlayers: string[];
  openPlayers: string[];
};

/** Everyone asked about one Spieltag, sorted into their answers (ids kept so the page can mark who is lined up). */
export function dayVotes(
  date: string,
  allMatches: MatchView[],
  answers: Map<string, AvailabilityStatus>,
  activeRoster: RosterRow[],
): DayVotes {
  const names = new Map(activeRoster.map((r) => [r.playerId, r.name]));
  const votes: DayVotes = { ja: [], vielleicht: [], nein: 0, open: 0, neinPlayers: [], openPlayers: [] };
  for (const [playerId, roster] of rosterByPlayer(activeRoster)) {
    if (!pollDaysForPlayer(roster, allMatches, "0000-00-00").some((d) => d.date === date)) continue;
    const status = answers.get(availabilityKey(playerId, date));
    const entry = { playerId, name: names.get(playerId)! };
    if (status === "ja") votes.ja.push(entry);
    else if (status === "vielleicht") votes.vielleicht.push(entry);
    else if (status === "nein") {
      votes.nein++;
      votes.neinPlayers.push(entry.name);
    } else {
      votes.open++;
      votes.openPlayers.push(entry.name);
    }
  }
  votes.ja.sort((a, b) => a.name.localeCompare(b.name, "de"));
  votes.vielleicht.sort((a, b) => a.name.localeCompare(b.name, "de"));
  votes.neinPlayers.sort((a, b) => a.localeCompare(b, "de"));
  votes.openPlayers.sort((a, b) => a.localeCompare(b, "de"));
  return votes;
}
