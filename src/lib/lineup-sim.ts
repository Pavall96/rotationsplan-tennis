// Aufstellungs-Simulation: what Claude gets to see for one Spieltag, and the check of what it proposes. Pure functions —
// the rules stay in code (eligibility.ts), Claude only weighs strength against fairness.

import type { MatchView } from "@/lib/matches";
import type { RosterRow } from "@/lib/roster";
import { rosterByPlayer } from "@/lib/roster";
import { lineupContext, type LineupEntry } from "@/lib/lineups";
import { availabilityKey, type AvailabilityStatus } from "@/lib/availability";
import { FESTSPIEL_WARNING, isNonGerman, lineupCheck, tooManyNonGermans } from "@/lib/eligibility";
import { formatTime } from "@/lib/format";

export type SimFocus = "stark" | "ausgewogen" | "rotation";
export const SIM_FOCI: readonly SimFocus[] = ["stark", "ausgewogen", "rotation"];

/** What the Mannschaftsführer picks before simulating. */
export type SimOptions = {
  /** Per match id; matches left out are "ausgewogen". */
  focus: Record<number, SimFocus>;
  /** Must be in a Stamm somewhere that day. */
  pinned: number[];
  /** Not lined up this time, whatever they answered. */
  excluded: number[];
  /** Also plan with players who only said "vielleicht". */
  allowMaybe: boolean;
  ersatz: boolean;
  /** Don't hand anyone the appearance that locks them out of the second team while someone else could play. */
  avoidFestspielen: boolean;
};

export const DEFAULT_OPTIONS: SimOptions = {
  focus: {},
  pinned: [],
  excluded: [],
  allowMaybe: true,
  ersatz: true,
  avoidFestspielen: true,
};

export type SimCandidate = {
  playerId: number;
  position: number | null;
  warnings: string[];
  /** Playing here would be the third first-team appearance — locked out of the second team afterwards. */
  wouldFestspielen: boolean;
};

export type SimMatch = {
  matchId: number;
  team: string;
  ageClass: MatchView["team"]["ageClass"];
  rank: number;
  focus: SimFocus;
  playersNeeded: number;
  opponent: string;
  isHome: boolean;
  time: string;
  /** Already in the lineup — the simulation keeps them and only fills the rest. */
  fixedStamm: number[];
  fixedErsatz: number[];
  /** Said "kann" (or "vielleicht", if allowed), may play for this team, and isn't lined up anywhere else that day. */
  candidates: SimCandidate[];
};

export type SimPlayer = {
  playerId: number;
  name: string;
  lk: string | null;
  lists: string;
  positions: Partial<Record<MatchView["team"]["ageClass"], number>>;
  status: AvailabilityStatus | "offen";
  countsAsGerman: boolean;
  /** Pinned by the Mannschaftsführer: must be in a Stamm. */
  pinned: boolean;
  /** Earlier Spieltage this season the player said "kann". */
  zusagenBisher: number;
  /** Stammplätze on earlier dates (played or planned, not cancelled). */
  einsaetzeBisher: number;
  einsaetzeProTeam: Record<string, number>;
};

export type SimInput = {
  date: string;
  ersatz: boolean;
  avoidFestspielen: boolean;
  matches: SimMatch[];
  players: SimPlayer[];
};

/** Everything Claude needs for one Spieltag. `roster` should be the active rows only (players who play this season). */
export function buildSimulation(
  date: string,
  allMatches: MatchView[],
  roster: RosterRow[],
  answers: Map<string, AvailabilityStatus>,
  lineupsByMatch: Map<number, LineupEntry[]>,
  options: SimOptions = DEFAULT_OPTIONS,
): SimInput {
  const rosters = rosterByPlayer(roster);
  const dayMatches = allMatches.filter((m) => m.matchDate === date);
  const statusOf = (playerId: number) => answers.get(availabilityKey(playerId, date)) ?? "offen";
  const linedUpToday = new Set(dayMatches.flatMap((m) => (lineupsByMatch.get(m.id) ?? []).map((e) => e.playerId)));
  const excluded = new Set(options.excluded);
  const available = (status: AvailabilityStatus | "offen") => status === "ja" || (status === "vielleicht" && options.allowMaybe);

  const matches: SimMatch[] = dayMatches.map((m) => {
    const entries = lineupsByMatch.get(m.id) ?? [];
    const candidates: SimCandidate[] = [];
    for (const playerId of rosters.keys()) {
      if (linedUpToday.has(playerId) || excluded.has(playerId) || !available(statusOf(playerId))) continue;
      const playerRoster = rosters.get(playerId)!;
      const check = lineupCheck(playerRoster, m.team, lineupContext(playerId, true, m, allMatches, lineupsByMatch));
      if (!check.ok) continue;
      candidates.push({
        playerId,
        position: playerRoster[m.team.ageClass]?.position ?? null,
        warnings: check.warnings,
        wouldFestspielen: check.warnings.includes(FESTSPIEL_WARNING),
      });
    }
    candidates.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    return {
      matchId: m.id,
      team: m.team.name,
      ageClass: m.team.ageClass,
      rank: m.team.rank,
      focus: options.focus[m.id] ?? "ausgewogen",
      playersNeeded: m.playersNeeded,
      opponent: m.opponent,
      isHome: m.isHome,
      time: formatTime(m.startsAt),
      // A Stammspieler who already cancelled leaves a gap the simulation should fill.
      fixedStamm: entries.filter((e) => e.role === "stamm" && e.response !== "nein").map((e) => e.playerId),
      fixedErsatz: entries.filter((e) => e.role === "ersatz" && e.response !== "nein").map((e) => e.playerId),
      candidates,
    };
  });

  const involved = new Set(matches.flatMap((m) => [...m.fixedStamm, ...m.fixedErsatz, ...m.candidates.map((c) => c.playerId)]));
  const rows = new Map<number, RosterRow[]>();
  for (const r of roster) if (involved.has(r.playerId)) rows.set(r.playerId, [...(rows.get(r.playerId) ?? []), r]);

  const pinned = new Set(options.pinned);
  const earlier = allMatches.filter((m) => m.matchDate < date);
  const earlierDays = new Set(earlier.map((m) => m.matchDate));
  const players: SimPlayer[] = [...rows].map(([playerId, entries]) => {
    const perTeam: Record<string, number> = {};
    for (const m of earlier) {
      const plays = (lineupsByMatch.get(m.id) ?? []).some(
        (e) => e.playerId === playerId && e.role === "stamm" && e.response !== "nein",
      );
      if (plays) perTeam[m.team.name] = (perTeam[m.team.name] ?? 0) + 1;
    }
    return {
      playerId,
      name: entries[0].name,
      lk: entries.find((e) => e.lk)?.lk ?? null,
      lists: entries.map((e) => `${e.ageClass === "h30" ? "H30" : "H"} ${e.position}`).join(" · "),
      positions: Object.fromEntries(entries.map((e) => [e.ageClass, e.position])),
      status: statusOf(playerId),
      countsAsGerman: !isNonGerman(rosters.get(playerId) ?? {}),
      pinned: pinned.has(playerId),
      zusagenBisher: [...earlierDays].filter((d) => answers.get(availabilityKey(playerId, d)) === "ja").length,
      einsaetzeBisher: Object.values(perTeam).reduce((n, c) => n + c, 0),
      einsaetzeProTeam: perTeam,
    };
  });

  return { date, ersatz: options.ersatz, avoidFestspielen: options.avoidFestspielen, matches, players };
}

/** What Claude returns: per match only the players it adds (the fixed ones stay as they are). */
export type Proposal = {
  teams: { matchId: number; stamm: number[]; ersatz: number[]; begruendung: string }[];
  hinweise: string;
};

export type CheckedTeam = {
  matchId: number;
  /** Fixed plus proposed, in Meldeliste order (the singles order). */
  stamm: number[];
  ersatz: number[];
  begruendung: string;
};

export type CheckedDay = {
  teams: CheckedTeam[];
  /** Broken rules or choices — sent back to Claude once, shown if they remain. */
  errors: string[];
  /** Fine by the rules, but worth a look. */
  warnings: string[];
};

/** Checks a proposal against the WTB rules, the answers and the captain's choices. Nothing is dropped silently. */
export function checkProposal(input: SimInput, proposal: Proposal): CheckedDay {
  const errors: string[] = [];
  const warnings: string[] = [];
  const player = (id: number) => input.players.find((p) => p.playerId === id);
  const name = (id: number) => player(id)?.name ?? `Spieler ${id}`;
  const usedToday = new Map<number, string>();
  for (const m of input.matches) for (const id of [...m.fixedStamm, ...m.fixedErsatz]) usedToday.set(id, m.team);

  for (const t of proposal.teams) {
    if (!input.matches.some((m) => m.matchId === t.matchId)) errors.push(`Unbekanntes Spiel ${t.matchId}.`);
  }

  const teams = input.matches.map((m): CheckedTeam => {
    const proposed = proposal.teams.find((t) => t.matchId === m.matchId);
    if (!proposed) errors.push(`Keine Aufstellung für ${m.team}.`);
    const take = (ids: number[]) => {
      const taken: number[] = [];
      for (const id of ids) {
        if (m.fixedStamm.includes(id) || m.fixedErsatz.includes(id)) continue; // repeated a fixed player: harmless
        const candidate = m.candidates.find((c) => c.playerId === id);
        if (!candidate) {
          const status = player(id)?.status;
          errors.push(
            status === "ja" || status === "vielleicht"
              ? `${name(id)} darf oder soll nicht für ${m.team} spielen.`
              : `${name(id)} hat für den Tag nicht zugesagt.`,
          );
          continue;
        }
        const other = usedToday.get(id);
        if (other) {
          errors.push(`${name(id)} steht zweimal auf (${other} und ${m.team}) – pro Tag nur ein Team, auch als Ersatz.`);
          continue;
        }
        usedToday.set(id, m.team);
        taken.push(id);
        for (const w of candidate.warnings) warnings.push(`${name(id)} (${m.team}): ${w}.`);
      }
      return taken;
    };
    const newStamm = take(proposed?.stamm ?? []);
    const newErsatz = input.ersatz ? take(proposed?.ersatz ?? []) : [];
    const position = (id: number) => player(id)?.positions[m.ageClass] ?? 999;
    const stamm = [...m.fixedStamm, ...newStamm].sort((a, b) => position(a) - position(b));

    if (stamm.length > m.playersNeeded) {
      errors.push(`${m.team}: ${stamm.length} Stammspieler, gebraucht werden ${m.playersNeeded}.`);
    }
    if (tooManyNonGermans(stamm.map((id) => ({ countsAsGerman: player(id)?.countsAsGerman ?? true })))) {
      errors.push(`${m.team}: mehr als ein Nicht-Deutscher im Stamm (WSPO § 33a Ziff. 1).`);
    }
    for (const id of newStamm) {
      if (player(id)?.status === "vielleicht") warnings.push(`${name(id)} (${m.team}) hat nur „vielleicht“ gesagt – kurz nachfragen.`);
    }
    return { matchId: m.matchId, stamm, ersatz: [...m.fixedErsatz, ...newErsatz], begruendung: proposed?.begruendung ?? "" };
  });

  const spareFor = (m: SimMatch) => m.candidates.filter((c) => !usedToday.has(c.playerId));
  for (const t of teams) {
    const m = input.matches.find((x) => x.matchId === t.matchId)!;

    // Too few is only a mistake if someone eligible was left over.
    if (t.stamm.length < m.playersNeeded) {
      const spare = spareFor(m);
      const missing = m.playersNeeded - t.stamm.length;
      if (spare.length > 0) {
        errors.push(`${m.team}: nur ${t.stamm.length} von ${m.playersNeeded} – frei wären noch ${spare.map((c) => name(c.playerId)).join(", ")}.`);
      } else {
        warnings.push(`${m.team}: es fehlen ${missing} Spieler – niemand Passendes hat mehr zugesagt.`);
      }
    }

    // Festspielen only when nobody else could have taken the place (and the captain didn't ask for exactly this player).
    if (input.avoidFestspielen) {
      const safeSpare = spareFor(m).filter((c) => !c.wouldFestspielen);
      for (const id of t.stamm) {
        const c = m.candidates.find((x) => x.playerId === id);
        if (c?.wouldFestspielen && !player(id)?.pinned && safeSpare.length > 0) {
          errors.push(
            `${name(id)} würde sich in ${m.team} festspielen, obwohl ${safeSpare.map((s) => name(s.playerId)).join(", ")} frei wäre.`,
          );
        }
      }
    }
  }

  for (const p of input.players) {
    if (!p.pinned) continue;
    const inStamm = teams.some((t) => t.stamm.includes(p.playerId));
    const possible = input.matches.some((m) => m.candidates.some((c) => c.playerId === p.playerId));
    if (!inStamm && possible) errors.push(`${p.name} ist festgelegt, steht aber in keinem Stamm.`);
  }

  return { teams, errors, warnings };
}

/** Players who said "kann" but end up in no team that day — the people the fairness question is about. */
export function leftOut(input: SimInput, day: CheckedDay): SimPlayer[] {
  const used = new Set(day.teams.flatMap((t) => [...t.stamm, ...t.ersatz]));
  return input.players.filter((p) => p.status === "ja" && !used.has(p.playerId));
}
