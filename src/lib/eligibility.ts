// Who may play for which team, per the WTB Wettspielordnung. Pure functions: callers pass in the Meldeliste
// entries and appearance counts, so the rules can be tested without a database.

import type { AgeClass } from "@/lib/matches";

export type RosterEntry = { position: number; countsAsGerman: boolean };
export type PlayerRoster = Partial<Record<AgeClass, RosterEntry>>;
export type TeamRef = { ageClass: AgeClass; rank: number };

/** Positions 1–4 of a 4er-Meldeliste are fixed to the first team (§ 13 Ziff. 2). */
export const FIXED_POSITIONS = 4;
/** More than this many appearances in a higher team locks a player out of lower teams (§ 33a Ziff. 3). */
export const MAX_HIGHER_TEAM_APPEARANCES = 2;

export const AGE_CLASS_LABEL: Record<AgeClass, string> = { herren: "Herren", h30: "Herren 30" };

export type Eligibility = { ok: true; warning?: string } | { ok: false; reason: string };

/**
 * Whether a player may be lined up for `team`. `firstTeamAppearances` counts the player's matches so far in the
 * first team of the same age class — only relevant when `team` is the second team.
 */
export function canPlay(roster: PlayerRoster, team: TeamRef, firstTeamAppearances = 0): Eligibility {
  const entry = roster[team.ageClass];
  if (!entry) {
    return { ok: false, reason: `Nicht auf der Meldeliste ${AGE_CLASS_LABEL[team.ageClass]}` };
  }
  if (team.rank > 1 && entry.position <= FIXED_POSITIONS) {
    return { ok: false, reason: `Platz ${entry.position} der Meldeliste – fest in der 1. Mannschaft` };
  }
  if (team.rank > 1 && firstTeamAppearances > MAX_HIGHER_TEAM_APPEARANCES) {
    return { ok: false, reason: `In der 1. Mannschaft festgespielt (${firstTeamAppearances} Einsätze)` };
  }
  return { ok: true };
}

/**
 * Warning when lining a player up for the first team would lock them out of the second (the third appearance).
 * Players on positions 1–4 are already fixed there, so it doesn't matter for them.
 */
export function festspielWarning(roster: PlayerRoster, team: TeamRef, firstTeamAppearances: number): string | null {
  const entry = roster[team.ageClass];
  if (!entry || team.rank !== 1 || entry.position <= FIXED_POSITIONS) return null;
  if (firstTeamAppearances === MAX_HIGHER_TEAM_APPEARANCES) {
    return "3. Einsatz in der 1. Mannschaft – danach nicht mehr in der 2. spielberechtigt";
  }
  return null;
}

/** At most one player per team who doesn't count as German (§ 33a Ziff. 1). */
export function tooManyNonGermans(lineup: { countsAsGerman: boolean }[]): boolean {
  return lineup.filter((e) => !e.countsAsGerman).length > 1;
}

/** Singles must be played in Meldeliste order (§ 33b Ziff. 1). */
export function sortByMeldeliste<T extends RosterEntry>(lineup: T[]): T[] {
  return [...lineup].sort((a, b) => a.position - b.position);
}

/**
 * Whether to ask a player about a team's matches in the availability poll. Looser than `canPlay` in one way: H30
 * players are asked about Herren matches even if they're not on the Herren list (the club puts them on the
 * Wintermeldung — a Mannschaftsführer's rule, not the WSPO's). Players on no list aren't asked at all: only the
 * Wintermeldung makes anyone eligible, and trainings-only players shouldn't be polled.
 */
export function canBeAsked(roster: PlayerRoster, team: TeamRef): boolean {
  if (team.ageClass === "herren" && !roster.herren) return Boolean(roster.h30);
  return canPlay(roster, team).ok;
}

export type LineupContext = {
  playsMatches: boolean;
  /** Matches so far (earlier dates, published or planned) in the first team of this age class. */
  firstTeamAppearances: number;
  /** Another team the player is already lined up for on the same day, if any. */
  sameDayTeam: string | null;
};

export type LineupCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

/** Everything that decides whether a Mannschaftsführer may put this player into this match's lineup. */
export function lineupCheck(roster: PlayerRoster, team: TeamRef, ctx: LineupContext): LineupCheck {
  if (!ctx.playsMatches) return { ok: false, reason: "Spielt diese Saison nicht" };
  if (ctx.sameDayTeam) return { ok: false, reason: `Spielt am selben Tag schon für ${ctx.sameDayTeam}` };

  const warnings: string[] = [];
  if (team.ageClass === "herren" && !roster.herren && roster.h30) {
    // The club's rule: H30 players help out in the Herren teams — they must be on the Herren Wintermeldung. Their
    // future Herren position is unknown, but Festspielen (§ 33a Ziff. 3) applies to them all the same.
    if (team.rank > 1 && ctx.firstTeamAppearances > MAX_HIGHER_TEAM_APPEARANCES) {
      return { ok: false, reason: `In der 1. Mannschaft festgespielt (${ctx.firstTeamAppearances} Einsätze)` };
    }
    warnings.push("Nicht auf der Herren-Meldeliste – nur spielberechtigt, wenn er in der Wintermeldung steht");
    if (team.rank === 1 && ctx.firstTeamAppearances === MAX_HIGHER_TEAM_APPEARANCES) {
      warnings.push("3. Einsatz in der 1. Mannschaft – danach nicht mehr in der 2. spielberechtigt");
    }
    return { ok: true, warnings };
  }

  const eligible = canPlay(roster, team, ctx.firstTeamAppearances);
  if (!eligible.ok) return eligible;
  const festspiel = festspielWarning(roster, team, ctx.firstTeamAppearances);
  if (festspiel) warnings.push(festspiel);
  return { ok: true, warnings };
}

/** Whether a player counts as a non-German under WSPO § 10 (only entries without the "D" status). */
export function isNonGerman(roster: PlayerRoster): boolean {
  return Object.values(roster).some((e) => e && !e.countsAsGerman);
}
