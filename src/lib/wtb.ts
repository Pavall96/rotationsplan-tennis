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

export async function fetchWtb(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Rotationsplan TC Sonnenbrunnen)" } });
  if (!res.ok) throw new Error(`WTB antwortet mit ${res.status} für ${url}`);
  return res.text();
}
