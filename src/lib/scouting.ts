// Pure logic for the opponent overview on the next match card: facts for the Claude assessment and the
// display data. No database access here; the snapshot is fetched and cached elsewhere.
import { createHash } from "node:crypto";
import type { MatchView } from "./matches";
import type { LineupEntry } from "./lineups";
import type { RosterRow } from "./roster";
import type { StandingRow, WtbPlayer } from "./wtb";

export type Verdict = "vorne" | "offen" | "hinten";

/** key of teamPlayers = StandingRow.teamUrl */
export type GroupSnapshot = {
  groupUrl: string;
  standings: StandingRow[];
  teamPlayers: Record<string, WtbPlayer[]>;
  fetchedAt: Date;
};

export type PositionFact = {
  position: number;
  theirLk: number | null;
  theirAppearances: number;
  theirSingles: string;
  ourLk: number | null;
  verdict: Verdict | null;
};

export type ScoutingFacts = {
  isHome: boolean;
  groupSize: number;
  opponent: { rank: number; points: string; matches: string; meetings: number };
  us: { rank: number; points: string; matches: string; meetings: number };
  opponentHasPlayed: boolean;
  ourLineupPublished: boolean;
  positions: PositionFact[];
};

export type OpponentPlayerView = {
  position: number;
  name: string;
  lk: number | null;
  appearances: number;
  singles: string;
  doubles: string;
};

export type OpponentView = {
  standings: StandingRow[];
  opponentTeamUrl: string;
  ourTeamUrl: string;
  players: OpponentPlayerView[];
  hasPlayed: boolean;
  assessment: string | null;
  fetchedAt: Date;
  groupUrl: string;
};

/** Singles matches played. */
export function appearances(p: WtbPlayer): number {
  return p.singles.won + p.singles.lost;
}

/**
 * The `needed` players most likely to line up: most singles appearances, ties by lower rank; if fewer than
 * `needed` have played, filled up by rank. Sorted by rank, position = 1..n.
 */
export function likelyLineup(players: WtbPlayer[], needed: number): { position: number; player: WtbPlayer }[] {
  const byLikelihood = [...players].sort((a, b) => appearances(b) - appearances(a) || a.rank - b.rank);
  return byLikelihood
    .slice(0, Math.max(needed, 0))
    .sort((a, b) => a.rank - b.rank)
    .map((player, i) => ({ position: i + 1, player }));
}

/** Lower LK is stronger. A gap of two or more decides, anything closer is open. */
export function compareLk(ours: number | null, theirs: number | null): Verdict | null {
  if (ours === null || theirs === null) return null;
  if (theirs - ours >= 2) return "vorne";
  if (ours - theirs >= 2) return "hinten";
  return "offen";
}

/** "Sascha Müller" -> "S. Müller"; a single word stays as is. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** Last word of each name. */
export function surnames(players: WtbPlayer[]): string[] {
  return players.map((p) => p.name.trim().split(/\s+/).at(-1) ?? "");
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function findStanding(standings: StandingRow[], teamName: string): StandingRow | null {
  const wanted = normalize(teamName);
  return standings.find((s) => normalize(s.team) === wanted) ?? null;
}

export function ourStanding(standings: StandingRow[], wtbTeamId: string): StandingRow | null {
  const suffix = `/m/${wtbTeamId}.html`;
  return standings.find((s) => s.teamUrl.endsWith(suffix)) ?? null;
}

/** Ids of the earliest match per team with matchDate >= today (YYYY-MM-DD). */
export function nextMatchIds(all: MatchView[], today: string): Set<number> {
  const best = new Map<number, MatchView>();
  for (const m of all) {
    if (m.matchDate < today) continue;
    const cur = best.get(m.team.id);
    if (!cur || m.startsAt < cur.startsAt || (m.startsAt.getTime() === cur.startsAt.getTime() && m.id < cur.id)) {
      best.set(m.team.id, m);
    }
  }
  return new Set([...best.values()].map((m) => m.id));
}

/**
 * Floored LKs of our published Stamm players (not cancelled) in Meldeliste order of the match's age class,
 * players missing from that list last. null = lineup not published yet.
 */
export function ourPublishedLks(
  match: Pick<MatchView, "lineupPublishedAt"> & { team: Pick<MatchView["team"], "ageClass"> },
  entries: Pick<LineupEntry, "playerId" | "role" | "response">[],
  roster: Pick<RosterRow, "ageClass" | "playerId" | "position" | "lk">[],
): (number | null)[] | null {
  if (!match.lineupPublishedAt) return null;
  const rows = new Map(roster.filter((r) => r.ageClass === match.team.ageClass).map((r) => [r.playerId, r]));
  return entries
    .filter((e) => e.role === "stamm" && e.response !== "nein")
    .map((e) => rows.get(e.playerId))
    .sort((a, b) => (a?.position ?? 9999) - (b?.position ?? 9999))
    .map((r) => {
      if (!r || r.lk === null) return null;
      const lk = Math.floor(Number(r.lk));
      return Number.isNaN(lk) ? null : lk;
    });
}

function summary(s: StandingRow) {
  return { rank: s.rank, points: s.points, matches: s.matches, meetings: s.meetings };
}

export function buildFacts(input: {
  match: MatchView;
  snapshot: GroupSnapshot;
  wtbTeamId: string;
  /** Stamm in roster order, already floored; null = lineup not published */
  ourPublishedLks: (number | null)[] | null;
}): ScoutingFacts | null {
  const { match, snapshot, wtbTeamId, ourPublishedLks } = input;
  const opp = findStanding(snapshot.standings, match.opponent);
  const us = ourStanding(snapshot.standings, wtbTeamId);
  if (!opp || !us) return null;

  const theirs = likelyLineup(snapshot.teamPlayers[opp.teamUrl] ?? [], match.playersNeeded);
  const ourLks: (number | null)[] =
    ourPublishedLks ?? likelyLineup(snapshot.teamPlayers[us.teamUrl] ?? [], match.playersNeeded).map((l) => l.player.lk);

  const count = Math.max(theirs.length, ourLks.length);
  const positions: PositionFact[] = [];
  for (let i = 0; i < count; i++) {
    const their = theirs[i]?.player;
    const theirLk = their?.lk ?? null;
    const ourLk = ourLks[i] ?? null;
    positions.push({
      position: i + 1,
      theirLk,
      theirAppearances: their ? appearances(their) : 0,
      theirSingles: their ? `${their.singles.won}:${their.singles.lost}` : "0:0",
      ourLk,
      verdict: compareLk(ourLk, theirLk),
    });
  }

  return {
    isHome: match.isHome,
    groupSize: snapshot.standings.length,
    opponent: summary(opp),
    us: summary(us),
    opponentHasPlayed: theirs.some((l) => appearances(l.player) > 0),
    ourLineupPublished: ourPublishedLks !== null,
    positions,
  };
}

export function factsHash(facts: ScoutingFacts): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function opponentView(
  snapshot: GroupSnapshot,
  match: MatchView,
  wtbTeamId: string,
  assessment: string | null,
): OpponentView | null {
  const opp = findStanding(snapshot.standings, match.opponent);
  const us = ourStanding(snapshot.standings, wtbTeamId);
  if (!opp || !us) return null;

  const all = [...(snapshot.teamPlayers[opp.teamUrl] ?? [])].sort((a, b) => a.rank - b.rank);
  const active = all.filter((p) => appearances(p) + p.doubles.won + p.doubles.lost > 0);
  const shown = active.length > 0 ? active : all.slice(0, match.playersNeeded + 2);

  return {
    standings: snapshot.standings,
    opponentTeamUrl: opp.teamUrl,
    ourTeamUrl: us.teamUrl,
    players: shown.map((p, i) => ({
      position: i + 1,
      name: shortName(p.name),
      lk: p.lk,
      appearances: appearances(p),
      singles: `${p.singles.won}:${p.singles.lost}`,
      doubles: `${p.doubles.won}:${p.doubles.lost}`,
    })),
    hasPlayed: active.length > 0,
    assessment,
    fetchedAt: snapshot.fetchedAt,
    groupUrl: snapshot.groupUrl,
  };
}
