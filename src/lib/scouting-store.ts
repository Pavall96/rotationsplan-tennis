// Storage layer of the opponent overview: fetches the WTB group data (the only place that talks to the WTB for
// this feature), keeps the snapshot and Claude's assessment in the database, and serves the display data.
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { matchPreviews, teams, wtbGroupSnapshots } from "@/db/schema";
import { formatDateForFile } from "@/lib/format";
import { getLineups, type LineupEntry } from "@/lib/lineups";
import { getAllMatches, type MatchView } from "@/lib/matches";
import { getRoster, type RosterRow } from "@/lib/roster";
import {
  buildFacts,
  factsHash,
  findStanding,
  nextMatchIds,
  opponentView,
  ourPublishedLks,
  surnames,
  type GroupSnapshot,
  type OpponentView,
} from "@/lib/scouting";
import { AssessmentError, writeAssessment } from "@/lib/scouting-ai";
import { fetchWtb, parseGroupUrl, parseStandings, parseTeamPlayers, WTB_BASE_URL, type WtbPlayer } from "@/lib/wtb";

const CLUB_ID = "20019";
const PAUSE_BETWEEN_PAGES_MS = 300;

export type RefreshResult = {
  team: string;
  ok: boolean;
  error?: string;
  opponentNotFound?: boolean;
  assessment?: "neu" | "unverändert" | "ohne Text" | "fehlgeschlagen";
};

type PreviewOutcome = Pick<RefreshResult, "opponentNotFound" | "assessment">;

/** Lineups (published only) and Meldelisten, loaded once and shared by all matches of a run. */
type OurSide = { lineups: Map<number, LineupEntry[]>; roster: RosterRow[] };

function teamUrl(wtbTeamId: string) {
  return `${WTB_BASE_URL}/spielbetrieb/vereine/verein/mannschaften/mannschaft/v/${CLUB_ID}/m/${wtbTeamId}.html`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadOurSide(): Promise<OurSide> {
  const [lineups, roster] = await Promise.all([getLineups({ publishedOnly: true }), getRoster()]);
  return { lineups, roster };
}

function lksFor(match: MatchView, our: OurSide) {
  return ourPublishedLks(match, our.lineups.get(match.id) ?? [], our.roster);
}

/** Fetches the team's group (table + every team's player list) from the WTB. Throws on any failure. */
async function fetchSnapshot(wtbTeamId: string): Promise<GroupSnapshot> {
  const groupUrl = parseGroupUrl(await fetchWtb(teamUrl(wtbTeamId)));
  if (!groupUrl) throw new Error("Kein Gruppen-Link");

  const standings = parseStandings(await fetchWtb(groupUrl));
  const teamPlayers: Record<string, WtbPlayer[]> = {};
  for (const row of standings) {
    await sleep(PAUSE_BETWEEN_PAGES_MS);
    teamPlayers[row.teamUrl] = parseTeamPlayers(await fetchWtb(row.teamUrl));
  }
  return { groupUrl, standings, teamPlayers, fetchedAt: new Date() };
}

/**
 * Builds the facts for one match and, if they changed since the stored assessment, asks Claude and stores the
 * answer. A dry run only builds the facts.
 */
async function updatePreview(
  match: MatchView,
  snapshot: GroupSnapshot,
  wtbTeamId: string,
  our: OurSide,
  dryRun: boolean,
): Promise<PreviewOutcome> {
  const facts = buildFacts({ match, snapshot, wtbTeamId, ourPublishedLks: lksFor(match, our) });
  if (!facts) return { opponentNotFound: true };

  const inputHash = factsHash(facts);
  const [stored] = await getDb().select().from(matchPreviews).where(eq(matchPreviews.matchId, match.id));
  if (stored?.inputHash === inputHash) return { assessment: "unverändert" };
  if (dryRun) return {};

  const opponent = findStanding(snapshot.standings, match.opponent);
  const forbidden = surnames(opponent ? (snapshot.teamPlayers[opponent.teamUrl] ?? []) : []);

  let text: string | null;
  try {
    text = await writeAssessment(facts, forbidden);
  } catch (err) {
    // Nothing stored: the next run asks again.
    if (!(err instanceof AssessmentError)) console.error("Gegner-Einschätzung unerwartet fehlgeschlagen:", err);
    return { assessment: "fehlgeschlagen" };
  }

  // text === null: Claude had nothing usable for these facts, so store that to not ask again.
  await getDb()
    .insert(matchPreviews)
    .values({ matchId: match.id, inputHash, text })
    .onConflictDoUpdate({ target: matchPreviews.matchId, set: { inputHash, text, createdAt: new Date() } });
  return { assessment: text === null ? "ohne Text" : "neu" };
}

async function refreshTeam(
  team: { id: number; name: string; wtbTeamId: string },
  nextMatch: MatchView | undefined,
  our: OurSide,
  dryRun: boolean,
): Promise<RefreshResult> {
  let snapshot: GroupSnapshot;
  try {
    snapshot = await fetchSnapshot(team.wtbTeamId);
    if (!dryRun) {
      const { fetchedAt, ...rest } = snapshot;
      await getDb()
        .insert(wtbGroupSnapshots)
        .values({ teamId: team.id, ...rest, fetchedAt })
        .onConflictDoUpdate({ target: wtbGroupSnapshots.teamId, set: { ...rest, fetchedAt } });
    }
  } catch (err) {
    // The old snapshot stays.
    return { team: team.name, ok: false, error: errorMessage(err) };
  }

  if (!nextMatch) return { team: team.name, ok: true };
  try {
    return { team: team.name, ok: true, ...(await updatePreview(nextMatch, snapshot, team.wtbTeamId, our, dryRun)) };
  } catch (err) {
    return { team: team.name, ok: false, error: errorMessage(err) };
  }
}

/** Daily run: refreshes every team's WTB snapshot and the assessment of its next match. */
export async function refreshAllScouting(opts: { dryRun: boolean }): Promise<RefreshResult[]> {
  const [teamRows, allMatches, our] = await Promise.all([
    getDb().select({ id: teams.id, name: teams.name, wtbTeamId: teams.wtbTeamId }).from(teams).orderBy(teams.id),
    getAllMatches(),
    loadOurSide(),
  ]);
  const nextIds = nextMatchIds(allMatches, formatDateForFile(new Date()));

  const settled = await Promise.allSettled(
    teamRows.map((team) =>
      refreshTeam(team, allMatches.find((m) => nextIds.has(m.id) && m.team.id === team.id), our, opts.dryRun),
    ),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { team: teamRows[i].name, ok: false, error: errorMessage(s.reason) },
  );
}

/** After a lineup publish: our side changed, so redo the assessment from the stored snapshot (no WTB calls). */
export async function refreshMatchPreview(matchId: number): Promise<void> {
  try {
    const match = (await getAllMatches()).find((m) => m.id === matchId);
    if (!match) return;
    const [[team], [row]] = await Promise.all([
      getDb().select({ wtbTeamId: teams.wtbTeamId }).from(teams).where(eq(teams.id, match.team.id)),
      getDb().select().from(wtbGroupSnapshots).where(eq(wtbGroupSnapshots.teamId, match.team.id)),
    ]);
    if (!team || !row) return;
    await updatePreview(match, row, team.wtbTeamId, await loadOurSide(), false);
  } catch (err) {
    console.error(`Gegner-Einschätzung für Spiel ${matchId} konnte nicht aktualisiert werden:`, err);
  }
}

/**
 * Display data per match id; a match without snapshot or with an unknown opponent is missing from the map.
 * Never throws: if the tables are missing (migration not run yet) or the database hiccups, the page gets an
 * empty map and renders without the opponent part.
 */
export async function getOpponentViews(matchIds: number[]): Promise<Map<number, OpponentView>> {
  const views = new Map<number, OpponentView>();
  if (matchIds.length === 0) return views;

  try {
    const db = getDb();
    const wanted = new Set(matchIds);
    const [allMatches, teamRows, snapshots, previews, our] = await Promise.all([
      getAllMatches(),
      db.select({ id: teams.id, wtbTeamId: teams.wtbTeamId }).from(teams),
      db.select().from(wtbGroupSnapshots),
      db.select().from(matchPreviews).where(inArray(matchPreviews.matchId, matchIds)),
      loadOurSide(),
    ]);
    const wtbTeamIds = new Map(teamRows.map((t) => [t.id, t.wtbTeamId]));
    const snapshotByTeam = new Map(snapshots.map((s) => [s.teamId, s]));
    const previewByMatch = new Map(previews.map((p) => [p.matchId, p]));

    for (const match of allMatches) {
      if (!wanted.has(match.id)) continue;
      const snapshot = snapshotByTeam.get(match.team.id);
      const wtbTeamId = wtbTeamIds.get(match.team.id);
      if (!snapshot || !wtbTeamId) continue;
      try {
        const facts = buildFacts({ match, snapshot, wtbTeamId, ourPublishedLks: lksFor(match, our) });
        if (!facts) continue;
        const preview = previewByMatch.get(match.id);
        // An assessment written for other facts would be wrong now; show none until it is refreshed.
        const assessment = preview && preview.inputHash === factsHash(facts) ? preview.text : null;
        const view = opponentView(snapshot, match, wtbTeamId, assessment);
        if (view) views.set(match.id, view);
      } catch (err) {
        console.error(`Gegner-Übersicht für Spiel ${match.id} übersprungen:`, err);
      }
    }
  } catch (err) {
    console.error("Gegner-Übersicht konnte nicht geladen werden:", err);
    return new Map();
  }
  return views;
}
