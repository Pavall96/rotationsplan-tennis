import file from "../../data/meldeliste.json";
import type { AgeClass } from "@/lib/matches";

type Entry = { firstName: string; lastName: string; wtbId: string };

// "Nachname, Vorname" exactly as the WTB lists it — the app shows nicknames, the Spielbericht wants these.
const OFFICIAL_NAMES = new Map<string, string>(
  [...file.lists.herren, ...file.lists.h30].map((e: Entry) => [e.wtbId, `${e.lastName}, ${e.firstName}`]),
);

/** Which namentliche Mannschaftsmeldung the app's roster was imported from. */
export const MELDELISTE_SOURCE: string = file.source;

/** The WTB's own PDF of each namentliche Mannschaftsmeldung (nuLiga) — always the current state, unlike the import. */
export const MELDELISTE_WTB_URL: Record<AgeClass, string> = {
  herren:
    "https://wtb.liga.nu/cgi-bin/WebObjects/nuLigaDokumentTENDE.woa/wa/nuDokument?dokument=PoolReportFOP&type=full&club=6524&season=19204&contestType=104760",
  h30: "https://wtb.liga.nu/cgi-bin/WebObjects/nuLigaDokumentTENDE.woa/wa/nuDokument?dokument=PoolReportFOP&type=full&club=6524&season=19204&contestType=104749",
};

/** A player's name as on the namentliche Mannschaftsmeldung; the app name for anyone the file doesn't know. */
export function officialName(wtbId: string | null, fallback: string): string {
  return (wtbId && OFFICIAL_NAMES.get(wtbId)) || fallback;
}
