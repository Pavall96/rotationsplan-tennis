// Parsers for the public WTB (wtb-tennis.de / nuLiga) team and hall pages. Pure functions so the import
// script can run them in a dry run without touching the database.

export const WTB_BASE_URL = "https://www.wtb-tennis.de";
export const OWN_CLUB_NAME = "TC Sonnenbrunnen Heilbronn";

export type WtbMatch = {
  meetingId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, local Europe/Berlin
  homeTeam: string;
  guestTeam: string;
  venueName: string;
  venueUrl: string | null;
};

export type WtbTeamPage = {
  league: string | null;
  matches: WtbMatch[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cell(rowHtml: string, className: string): string | null {
  const m = rowHtml.match(new RegExp(`<td class="${className}"[^>]*>([\\s\\S]*?)</td>`));
  return m ? m[1] : null;
}

export function parseTeamPage(html: string): WtbTeamPage {
  const captainIdx = html.indexOf("Mannschaftsführer");
  const leagueMatch = html.slice(Math.max(captainIdx, 0)).match(/<h3>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/);
  const league = leagueMatch ? textOf(leagueMatch[1]) : null;

  const scheduleIdx = html.indexOf("Spielplan</h3>");
  if (scheduleIdx < 0) throw new Error("Spielplan-Tabelle nicht gefunden – hat sich die WTB-Seite geändert?");
  const tbody = html.slice(scheduleIdx).match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody) return { league, matches: [] };

  const matches: WtbMatch[] = [];
  for (const [, row] of tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const dateText = textOf(cell(row, "date") ?? "");
    const dm = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
    const meeting = row.match(/meeting=(\d+)/);
    const place = cell(row, "place");
    if (!dm || !meeting || !place) continue;

    const venueHref = place.match(/href="([^"]+)"/);
    matches.push({
      meetingId: meeting[1],
      date: `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`,
      time: `${dm[4].padStart(2, "0")}:${dm[5]}`,
      homeTeam: textOf(cell(row, "home") ?? ""),
      guestTeam: textOf(cell(row, "guest") ?? ""),
      venueName: textOf(place),
      venueUrl: venueHref ? new URL(decodeEntities(venueHref[1]), WTB_BASE_URL).toString() : null,
    });
  }
  return { league, matches };
}

/** Street + "PLZ Ort" from one address block; drops the phone/mail/web lines some clubs add below. */
function addressBlock(html: string, label: string): string | null {
  const m = html.match(new RegExp(`${label}</strong>\\s*<address>([\\s\\S]*?)</address>`));
  if (!m) return null;
  const lines: string[] = [];
  for (const line of m[1].split(/<br\s*\/?>/i).map(textOf)) {
    if (!line || line === "-") continue;
    lines.push(line);
    if (/^\d{5}\s/.test(line)) break;
  }
  // A block without a postcode line (e.g. "- 74227 Oedheim" with no street) isn't a usable address.
  return lines.some((l) => /^\d{5}\s/.test(l)) && lines.length > 1 ? lines.join(", ") : null;
}

/**
 * Address of a hall page, one line: "Mörikestr. 41, 74229 Oedheim". Prefers the "Hallenadresse"; some clubs only
 * list their club address, which is then the best guess (`fallback: true`, worth a manual check).
 */
export function parseHallAddress(html: string): { address: string; fallback: boolean } | null {
  const hall = addressBlock(html, "Hallenadresse");
  if (hall) return { address: hall, fallback: false };
  const other = addressBlock(html, "Vereinsanschrift") ?? addressBlock(html, "Platzadresse");
  return other ? { address: other, fallback: true } : null;
}

export type StandingRow = {
  rank: number;
  team: string;
  teamUrl: string; // absolute
  meetings: number;
  points: string; // "a:b" as shown by the WTB
  matches: string; // "a:b" as shown by the WTB
};

export type WinLoss = { won: number; lost: number };

export type WtbPlayer = { rank: number; lk: number | null; name: string; singles: WinLoss; doubles: WinLoss };

/** Resolves a (possibly relative) href against the WTB; null for another host or an unparsable value. Never throws. */
function wtbUrl(href: string): string | null {
  try {
    const url = new URL(href, WTB_BASE_URL);
    return url.origin === new URL(WTB_BASE_URL).origin ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Absolute URL of the group (league table) page linked from a team page, or null. */
export function parseGroupUrl(teamHtml: string): string | null {
  const m = teamHtml.match(/href="([^"]*\/gruppe\/g\/[^"]*)"/);
  return m ? wtbUrl(decodeEntities(m[1])) : null;
}

/** Cell content by its `data-label` attribute (used on the group table). */
function labelledCell(rowHtml: string, label: string): string | null {
  const m = rowHtml.match(new RegExp(`<td[^>]*data-label="${label}"[^>]*>([\\s\\S]*?)</td>`));
  return m ? m[1] : null;
}

/** "a:b" from a table cell; anything else (these values go into the Claude prompt) becomes "0:0". */
function score(cellHtml: string | null): string {
  const m = textOf(cellHtml ?? "").match(/^(\d+)\s*:\s*(\d+)$/);
  return m ? `${m[1]}:${m[2]}` : "0:0";
}

/** Rows of the standings table under the "Tabelle" heading of a group page; [] if the table is missing. */
export function parseStandings(groupHtml: string): StandingRow[] {
  const headingMatch = groupHtml.match(/<h2[^>]*>\s*Tabelle\s*<\/h2>/);
  if (!headingMatch || headingMatch.index === undefined) return [];
  const tbody = groupHtml.slice(headingMatch.index).match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody) return [];

  const rows: StandingRow[] = [];
  for (const [, row] of tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const rank = parseInt(textOf(labelledCell(row, "Rang") ?? ""), 10);
    const teamCell = cell(row, "team");
    const href = teamCell?.match(/href="([^"]+)"/);
    if (!Number.isFinite(rank) || !teamCell || !href) continue;
    const teamUrl = wtbUrl(decodeEntities(href[1]));
    if (!teamUrl) continue;
    rows.push({
      rank,
      team: textOf(teamCell),
      teamUrl,
      meetings: parseInt(textOf(labelledCell(row, "Begegnungen") ?? ""), 10) || 0,
      points: score(labelledCell(row, "Punkte")),
      matches: score(labelledCell(row, "Matches")),
    });
  }
  return rows;
}

/** "2:1" -> { won: 2, lost: 1 }; anything unreadable counts as 0:0. */
function parseWinLoss(text: string): WinLoss {
  const m = text.match(/(\d+)\s*:\s*(\d+)/);
  return m ? { won: Number(m[1]), lost: Number(m[2]) } : { won: 0, lost: 0 };
}

/** Players of a team page ("Spieler" table) in page order; [] if the table is missing. */
export function parseTeamPlayers(teamHtml: string): WtbPlayer[] {
  const headingIdx = teamHtml.indexOf("<h3>Spieler");
  if (headingIdx < 0) return [];
  const tbody = teamHtml.slice(headingIdx).match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody) return [];

  const players: WtbPlayer[] = [];
  for (const [, row] of tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    // Columns: Rang, LK, Name, Nation, Einzel, Doppel, Gesamt
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => textOf(m[1]));
    const rank = parseInt(cells[0] ?? "", 10);
    if (!Number.isFinite(rank) || !cells[2]) continue;
    const lk = (cells[1] ?? "").match(/LK\s*(\d+)/);
    players.push({
      rank,
      lk: lk ? Number(lk[1]) : null,
      name: cells[2],
      singles: parseWinLoss(cells[4] ?? ""),
      doubles: parseWinLoss(cells[5] ?? ""),
    });
  }
  return players;
}

export async function fetchWtb(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Rotationsplan TC Sonnenbrunnen)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`WTB antwortet mit ${res.status} für ${url}`);
  return res.text();
}
